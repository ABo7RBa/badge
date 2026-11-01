import {createHash} from 'node:crypto';
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
export function fanartMovieUrl(id, apiKey = null) {
  if (!/^tt\d{7,10}$/.test(id)) throw Error('معرف فيلم غير صالح');
  const url=new URL(`https://webservice.fanart.tv/v3/movies/${id}`);
  if(apiKey)url.searchParams.set('api_key',apiKey);
  return url;
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
// Small rotating windows bound each attempt without pinning a large catalogue
// or an artwork list to the same first entries forever. No raw key is retained.
const searches=new Map();
const MAX_FILMS=10,MAX_IMAGES=24,ART_WINDOW=3,ART_WINDOWS=2;
function searchState(key,ids,seed){
 const signature=createHash('sha256').update(key+'\0'+ids.join(',')).digest('hex');
 if(!searches.has(signature)){
  if(searches.size>=128)searches.delete(searches.keys().next().value);
  searches.set(signature,{film:Math.abs(Math.trunc(Number(seed)||0))%Math.max(1,ids.length),art:new Map()});
 }
 return searches.get(signature);
}
function artworkState(search,id,posters,backgrounds){
 const signature=createHash('sha256').update(JSON.stringify([posters,backgrounds].map(items=>items.map(item=>[item.id,item.url])))).digest('hex');
 let progress=search.art.get(id);
 if(!progress||progress.signature!==signature){
  progress={signature,tile:0,visited:new Set()};search.art.set(id,progress);
 }
 return progress;
}
function workLimitError(){
 const error=Error('Fanart.tv: لم يوجد طقم مناسب ضمن حد الفحص الحالي؛ سيُستكمل البحث في صور وأفلام أخرى بالمحاولة التالية');
 error.code='FANART_SEARCH_CONTINUES';return error;
}
export async function fetchFanartMovie(seen = new Set(), {
  apiKey = process.env.FANART_API_KEY, ids = filmIds(), seed = 0,
  apiFetch = fetch, imageFetch = readLimited, validate = validatePair
} = {}) {
  const key = requireApiKey(apiKey, 'FANART_API_KEY');
  seen=new Set([...seen].flatMap(value=>[value,...String(value).split('|').filter(id=>/^fanart:art:\d+$/.test(id))]));
  const pending = filmIds(ids.join(',')).filter(id => !seen.has(`fanart:movie:${id}`));
  if(!pending.length)return null;
  const state=searchState(key,pending,seed),start=state.film;
  const outcomes=new Map();
  let downloadFailed=false,downloadedPair=false,limited=false,moreArtwork=false;
  for (let n = 0; n < Math.min(MAX_FILMS, pending.length); n++) {
    if(outcomes.size>=MAX_IMAGES){limited=true;break;}
    const index=(start+n)%pending.length,id=pending[index];
    // Advance before awaiting: errors and work limits must not pin retries to
    // a bad film. Credentials/HTTP errors still abort rather than being hidden.
    state.film=(index+1)%pending.length;
    let json;
    try {
      json = await sourceJson(fanartMovieUrl(id,key), {apiFetch, source: 'Fanart.tv', headers: {'api-key': key}});
    } catch (error) {
      if (error.status === 404) continue;
      throw error;
    }
    if (json?.imdb_id !== id || typeof json.name !== 'string' || !json.name.trim()) continue;
    const normalize=items=>(Array.isArray(items)?items:[]).filter(validArtwork).map(item=>({...item,url:artworkUrl(item.url)}));
    const unused=item=>!seen.has(`fanart:art:${item.id}`);
    const allPosters=normalize(json.movieposter).filter(unused),allBackgrounds=normalize(json.moviebackground).filter(unused);
    if(!allPosters.length||!allBackgrounds.length)continue;
    // Walk a Cartesian grid of bounded artwork tiles. Moving both image
    // offsets together can permanently miss a matching poster/background far
    // apart in their respective lists.
    const tileSize=ART_WINDOW*ART_WINDOWS;
    const posterTiles=Math.ceil(allPosters.length/tileSize),backgroundTiles=Math.ceil(allBackgrounds.length/tileSize);
    const tileCount=posterTiles*backgroundTiles,progress=artworkState(state,id,allPosters,allBackgrounds);
    const tile=progress.tile%tileCount;
    const posterStart=Math.floor(tile/backgroundTiles)*tileSize,backgroundStart=(tile%backgroundTiles)*tileSize;
    const posters=allPosters.slice(posterStart,posterStart+tileSize);
    const backgrounds=allBackgrounds.slice(backgroundStart,backgroundStart+tileSize);
    progress.tile=(tile+1)%tileCount;
    const checked=new Set();
    for(let window=1;window<=ART_WINDOWS;window++){
      const pairs=[];
      for(const poster of posters.slice(0,window*ART_WINDOW))for(const background of backgrounds.slice(0,window*ART_WINDOW)){
        const sourceIds=[`fanart:art:${poster.id}`,`fanart:art:${background.id}`];
        if(poster.id===background.id||poster.url===background.url||sourceIds.some(asset=>seen.has(asset)))continue;
        pairs.push({poster,background,sourceIds});
      }
      if(!pairs.length)continue;
      const urls=[...new Set(pairs.flatMap(pair=>[pair.poster.url,pair.background.url]))];
      const missing=urls.filter(url=>!outcomes.has(url)),available=MAX_IMAGES-outcomes.size;
      if(missing.length>available)limited=true;
      const requests=missing.slice(0,available);let cursor=0;
      const worker=async()=>{
        while(cursor<requests.length){
          const url=requests[cursor++];
          try{outcomes.set(url,{ok:true,value:await imageFetch(url)});}
          catch{downloadFailed=true;outcomes.set(url,{ok:false});}
        }
      };
      await Promise.all(Array.from({length:Math.min(3,requests.length)},worker));
      // Do not multiply an entirely unavailable CDN across artwork windows.
      if(requests.length&&urls.every(url=>outcomes.get(url)?.ok===false))throw imageNetworkError();
      for(const {poster,background,sourceIds} of pairs){
        const pairId=sourceIds.join('|');
        if(checked.has(pairId)||!outcomes.get(poster.url)?.ok||!outcomes.get(background.url)?.ok)continue;
        checked.add(pairId);downloadedPair=true;
        try{
          const avatar=outcomes.get(poster.url).value,banner=outcomes.get(background.url).value;
          await validate(avatar,banner,{minAvatar:320,minBanner:800,maxToneDistance:0.4});
          // Keep a successful tile available for an unposted/pending pair.
          // Once sent, its asset IDs leave the unused list and reset this grid.
          progress.tile=tile;
          return {avatar,banner,category:'movies',title:json.name,filmTitle:json.name,
            sourceId:[`fanart:movie:${id}`,...sourceIds].join('|'),sourceIds,sourceUrl:`https://www.imdb.com/title/${id}/`,
            sourceBannerUrl:'https://fanart.tv/',credit:'Film artwork via Fanart.tv — rights belong to their owners',
            license:'Fanart.tv API terms; film artwork remains copyrighted',
            filmVerified:true,verificationSource:'fanart-movie',provider:'Fanart.tv'};
        }catch{ /* A fetched but unsuitable pair does not exhaust later artwork. */ }
      }
      if(limited||posters.length<=ART_WINDOW&&backgrounds.length<=ART_WINDOW)break;
    }
    if(!limited)progress.visited.add(tile);
    if(progress.visited.size<tileCount)moreArtwork=true;
    if(limited)break;
  }
  if(downloadFailed&&!downloadedPair)throw imageNetworkError();
  if(limited||moreArtwork||pending.length>MAX_FILMS)throw workLimitError();
  return null;
}
