import {readLimited} from './media.js';
import {validatePair} from './quality-gate.js';
import {safeSourceUrl, requireApiKey, sourceJson} from './source-utils.js';

// An explicit film list, not a claim of regional streaming availability.
// IMDb identifiers are accepted by Fanart.tv's movie endpoint.
export const DEFAULT_FILM_IDS = 'tt1375666,tt0816692,tt0468569,tt0133093,tt1856101,tt1160419,tt15239678';
export function filmIds(value = process.env.FANART_MOVIE_IDS || DEFAULT_FILM_IDS) {
  const ids = [...new Set(value.split(',').map(x => x.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 100 || ids.some(id => !/^tt\d{7,10}$/.test(id))) {
    throw Error('FANART_MOVIE_IDS: أدخل حتى 100 معرف IMDb للأفلام مفصولة بفواصل، مثل tt1375666');
  }
  return ids;
}
export function fanartMovieUrl(id) {
  if (!/^tt\d{7,10}$/.test(id)) throw Error('معرف فيلم غير صالح');
  return new URL(`https://webservice.fanart.tv/v3/movies/${id}`);
}
export function validArtwork(item) {
  return /^\d+$/.test(String(item?.id || '')) && Boolean(artworkUrl(item.url));
}
function artworkUrl(value){
  try{
    const url=new URL(value);
    // Legacy API records can contain HTTP links to the official image CDN.
    // Upgrade only this exact known host and continue to verify TLS normally.
    if(!['http:','https:'].includes(url.protocol)||url.hostname!=='assets.fanart.tv'||url.username||url.password||url.port)return null;
    url.protocol='https:';
    return safeSourceUrl(url.toString(),['assets.fanart.tv'],/^\/fanart\/movies\//)?url.toString():null;
  }catch{return null;}
}
function imageNetworkError() {
  const error=Error('Fanart.tv: تعذر تنزيل صور الفيلم من خادم الصور؛ حاول لاحقًا');
  error.code='FANART_IMAGE_NETWORK';return error;
}
export async function fetchFanartMovie(seen = new Set(), {
  apiKey = process.env.FANART_API_KEY, ids = filmIds(), seed = 0,
  apiFetch = fetch, imageFetch = readLimited, validate = validatePair
} = {}) {
  const key = requireApiKey(apiKey, 'FANART_API_KEY');
  const pending = filmIds(ids.join(',')).filter(id => !seen.has(`fanart:movie:${id}`));
  let downloadFailed=false,downloadedPair=false;
  for (let n = 0; n < Math.min(5, pending.length); n++) {
    const id = pending[(seed + n) % pending.length];
    let json;
    try {
      json = await sourceJson(fanartMovieUrl(id), {apiFetch, source: 'Fanart.tv', headers: {'api-key': key}});
    } catch (error) {
      if (error.status === 404) continue; // Some configured films have no artwork yet.
      throw error;
    }
    if (json?.imdb_id !== id || typeof json.name !== 'string' || !json.name.trim()) continue;
    const normalize=items=>(Array.isArray(items)?items:[]).filter(validArtwork).map(item=>({...item,url:artworkUrl(item.url)}));
    const posters = normalize(json.movieposter);
    const backgrounds = normalize(json.moviebackground);
    const pairs=[];
    for (const poster of posters.slice(0, 3)) for (const background of backgrounds.slice(0, 3)) {
      const sourceIds = [`fanart:art:${poster.id}`, `fanart:art:${background.id}`];
      if (poster.id === background.id || poster.url === background.url || sourceIds.some(x => seen.has(x))) continue;
      pairs.push({poster,background,sourceIds});
    }
    if(!pairs.length)continue;
    // Fetch at most six unique assets, three at a time. Cache rejected promises
    // too: a missing image is never retried for every alternative pairing.
    const images=new Map(),outcomes=new Map();
    const image=url=>{
      if(!images.has(url))images.set(url,Promise.resolve().then(()=>imageFetch(url)));
      return images.get(url);
    };
    const urls=[...new Set(pairs.flatMap(pair=>[pair.poster.url,pair.background.url]))];
    let cursor=0;
    const worker=async()=>{
      while(cursor<urls.length){
        const url=urls[cursor++];
        try{outcomes.set(url,{ok:true,value:await image(url)});}
        catch{downloadFailed=true;outcomes.set(url,{ok:false});}
      }
    };
    await Promise.all(Array.from({length:Math.min(3,urls.length)},worker));
    // A completely unavailable CDN should not trigger the same failed work
    // across five films. Partial artwork loss can still recover in this film.
    if(urls.every(url=>!outcomes.get(url).ok))throw imageNetworkError();
    for(const {poster,background,sourceIds} of pairs){
      if(!outcomes.get(poster.url).ok||!outcomes.get(background.url).ok)continue;
      downloadedPair=true;
      try {
        const avatar=outcomes.get(poster.url).value,banner=outcomes.get(background.url).value;
        await validate(avatar, banner, {minAvatar: 300, minBanner: 800, maxToneDistance: 0.4});
        return {avatar, banner, category: 'movies', title: json.name, filmTitle: json.name,
          sourceId: `fanart:movie:${id}`, sourceIds, sourceUrl: `https://www.imdb.com/title/${id}/`,
          sourceBannerUrl: 'https://fanart.tv/', credit: 'Film artwork via Fanart.tv — rights belong to their owners',
          license: 'Fanart.tv API terms; film artwork remains copyrighted',
          filmVerified: true, verificationSource: 'fanart-movie', provider: 'Fanart.tv'};
      } catch { /* Downloaded artwork failed quality: try another pair from the same film. */ }
    }
  }
  if(downloadFailed&&!downloadedPair)throw imageNetworkError();
  return null;
}
