import assert from 'node:assert/strict';
import {fetchFanartMovie,validArtwork} from '../src/fanart-source.js';

const art=(id,kind)=>({id:String(id),url:`https://assets.fanart.tv/fanart/movies/27205/${kind}-${id}.jpg`});
const film=(id='tt1375666')=>({imdb_id:id,name:'Example Film',
 movieposter:[1,2,3].map(id=>art(id,'poster')),moviebackground:[4,5,6].map(id=>art(id,'background'))});
const base={apiKey:'fanart-test-key',ids:['tt1375666'],apiFetch:async()=>({ok:true,json:async()=>film()}),
 validate:async()=>({toneScore:0.9})};

// Legacy API image URLs are upgraded to HTTPS, never requested insecurely.
let upgradedDownloads=0;
const legacyFilm=film();
for(const field of ['movieposter','moviebackground'])legacyFilm[field]=legacyFilm[field].map(item=>({...item,url:item.url.replace('https:','http:')}));
assert(validArtwork(legacyFilm.movieposter[0]));
for(const url of ['http://assets.fanart.tv.evil.test/fanart/movies/1/x.jpg','http://user:pass@assets.fanart.tv/fanart/movies/1/x.jpg','http://assets.fanart.tv:8080/fanart/movies/1/x.jpg'])assert(!validArtwork({id:'1',url}));
const legacyPair=await fetchFanartMovie(new Set(),{...base,apiFetch:async()=>({ok:true,json:async()=>legacyFilm}),imageFetch:async url=>{
 assert.equal(new URL(url).protocol,'https:');assert.equal(new URL(url).hostname,'assets.fanart.tv');upgradedDownloads++;return Buffer.from(url);
}});
assert(legacyPair);assert.equal(upgradedDownloads,6);

// Outright CDN failure is bounded to one request per unique image in one film.
let filmRequests=0,inFlight=0,peak=0;const failures=new Map();
await assert.rejects(fetchFanartMovie(new Set(),{...base,ids:['tt1375666','tt0816692','tt0468569'],
 apiFetch:async raw=>{filmRequests++;return {ok:true,json:async()=>film(new URL(raw).pathname.split('/').at(-1))};},
 imageFetch:async url=>{
  failures.set(url,(failures.get(url)||0)+1);inFlight++;peak=Math.max(peak,inFlight);
  await new Promise(resolve=>setImmediate(resolve));inFlight--;
  throw Error('raw private diagnostic must not escape');
 }}),error=>error.code==='FANART_IMAGE_NETWORK'&&!error.message.includes('raw private diagnostic'));
assert.equal(filmRequests,1,'do not repeat a total CDN failure across five films');
assert.equal(failures.size,6);assert([...failures.values()].every(count=>count===1));
assert.equal(peak,3,'download concurrency must remain bounded');

// One broken poster must not prevent another poster from forming a valid pair.
const recoveryCalls=new Map();
const recovered=await fetchFanartMovie(new Set(),{...base,imageFetch:async url=>{
 recoveryCalls.set(url,(recoveryCalls.get(url)||0)+1);
 if(url===art(1,'poster').url)throw Error('missing image');return Buffer.from(url);
}});
assert.equal(recovered.sourceId,'fanart:movie:tt1375666|fanart:art:2|fanart:art:4');assert(recovered.avatar.toString().includes('poster-2'));
assert([...recoveryCalls.values()].every(count=>count===1));

// Download success with QA rejection is a genuine unsuitable-artwork result.
let qualityChecks=0;const qaCalls=new Map();
assert.equal(await fetchFanartMovie(new Set(),{...base,imageFetch:async url=>{
 qaCalls.set(url,(qaCalls.get(url)||0)+1);return Buffer.from(url);
},validate:async()=>{qualityChecks++;throw Error('colors do not match');}}),null);
assert.equal(qualityChecks,9);assert.equal(qaCalls.size,6);assert([...qaCalls.values()].every(count=>count===1));

// Partial loss can move to another film; missing catalogue data remains empty.
const secondFilm=await fetchFanartMovie(new Set(),{...base,ids:['tt1375666','tt0816692'],
 apiFetch:async raw=>{
  const id=new URL(raw).pathname.split('/').at(-1),json=film(id);
  if(id==='tt0816692'){
   json.movieposter=json.movieposter.map(p=>({...p,url:p.url.replace('/27205/','/157336/')}));
   json.moviebackground=json.moviebackground.map(p=>({...p,url:p.url.replace('/27205/','/157336/')}));
  }
  return {ok:true,json:async()=>json};
 },imageFetch:async url=>{
  if(url.includes('/27205/')&&url.includes('poster-'))throw Error('first film posters removed');
  return Buffer.from(url);
 }});
assert.equal(secondFilm.sourceId,'fanart:movie:tt0816692|fanart:art:1|fanart:art:4');
for(const json of [null,{}, {...film(),movieposter:[]},{...film(),moviebackground:[]}]){
 assert.equal(await fetchFanartMovie(new Set(),{...base,apiFetch:async()=>({ok:true,json:async()=>json}),
  imageFetch:async()=>{assert.fail('no usable metadata means no image fetch');}}),null);
}
let missingRequests=0;
assert.equal(await fetchFanartMovie(new Set(),{...base,apiFetch:async()=>{missingRequests++;return {ok:false,status:404};},
 imageFetch:async()=>{assert.fail('404 must not download images');}}),null);assert.equal(missingRequests,1);
await assert.rejects(fetchFanartMovie(new Set(),{...base,apiFetch:async()=>({ok:false,status:429})}),/429/);
console.log('PASS: Fanart unique bounded downloads, CDN diagnostics, partial recovery, QA distinction and missing-catalogue handling');
