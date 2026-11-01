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

// Failed QA in the first three entries must not hide a usable fourth poster.
const fourthFilm={...film(),movieposter:[1,2,3,7].map(id=>art(id,'poster')),moviebackground:[art(4,'background')]};
const fourthCalls=new Map();
const fourth=await fetchFanartMovie(new Set(),{...base,apiKey:'fourth-poster-fixture',apiFetch:async()=>({ok:true,json:async()=>fourthFilm}),imageFetch:async url=>{
 fourthCalls.set(url,(fourthCalls.get(url)||0)+1);return Buffer.from(url);
},validate:async avatar=>{if(!avatar.toString().includes('poster-7'))throw Error('not a matching palette');}});
assert.deepEqual(fourth.sourceIds,['fanart:art:7','fanart:art:4']);assert.equal(fourthCalls.size,5);assert([...fourthCalls.values()].every(n=>n===1));

// Expanded windows also compare the original poster against later backgrounds.
const fourthBackground={...film(),movieposter:[art(1,'poster')],moviebackground:[4,5,6,8].map(id=>art(id,'background'))};
const expanded=await fetchFanartMovie(new Set(),{...base,apiKey:'fourth-background-fixture',apiFetch:async()=>({ok:true,json:async()=>fourthBackground}),imageFetch:async url=>Buffer.from(url),
 validate:async(_avatar,banner)=>{if(!banner.toString().includes('background-8'))throw Error('wrong tone');}});
assert.deepEqual(expanded.sourceIds,['fanart:art:1','fanart:art:8']);

// Subsequent attempts rotate the bounded artwork window, reaching later assets.
const laterArtwork={...film(),movieposter:Array.from({length:13},(_,i)=>art(100+i,'poster')),moviebackground:[art(200,'background')]};
const rotating={...base,apiKey:'rotating-artwork-fixture',apiFetch:async()=>({ok:true,json:async()=>laterArtwork}),imageFetch:async url=>Buffer.from(url),
 validate:async avatar=>{if(!avatar.toString().includes('poster-112'))throw Error('not matching');}};
for(let attempt=0;attempt<2;attempt++)await assert.rejects(fetchFanartMovie(new Set(),rotating),e=>e.code==='FANART_SEARCH_CONTINUES');
assert.equal((await fetchFanartMovie(new Set(),rotating)).sourceIds[0],'fanart:art:112');

// A catalogue full of unsuitable artwork cannot cause unlimited image work.
let totalDownloads=0,activeDownloads=0,maxDownloads=0;const inspectedFilms=[];
const bounded={...base,apiKey:'bounded-artwork-fixture',ids:Array.from({length:7},(_,i)=>'tt'+String(4000000+i)),apiFetch:async raw=>{
 const id=new URL(raw).pathname.split('/').at(-1);inspectedFilms.push(id);
 const n=Number(id.slice(2))*10;
 return {ok:true,json:async()=>({...film(id),movieposter:Array.from({length:8},(_,i)=>art(n+i,'poster')),moviebackground:Array.from({length:8},(_,i)=>art(n+20+i,'background'))})};
},imageFetch:async url=>{
 totalDownloads++;activeDownloads++;maxDownloads=Math.max(maxDownloads,activeDownloads);
 await new Promise(resolve=>setImmediate(resolve));activeDownloads--;return Buffer.from(url);
},validate:async()=>{throw Error('unmatched palettes');}};
await assert.rejects(fetchFanartMovie(new Set(),bounded),e=>e.code==='FANART_SEARCH_CONTINUES');
assert.equal(totalDownloads,24);assert.equal(maxDownloads,3);
const lastInspected=inspectedFilms.at(-1);totalDownloads=0;inspectedFilms.length=0;
await assert.rejects(fetchFanartMovie(new Set(),bounded),e=>e.code==='FANART_SEARCH_CONTINUES');
assert(totalDownloads<=24);assert.notEqual(inspectedFilms[0],lastInspected,'work-limited retries advance to other films');

// The interoperable query authentication path keeps headers for compatibility,
// while errors must never expose the URL-bearing secret.
const authSecret='private-query-key-do-not-print';
await assert.rejects(fetchFanartMovie(new Set(),{...base,apiKey:authSecret,apiFetch:async(raw,opts)=>{
 assert.equal(new URL(raw).searchParams.get('api_key'),authSecret);assert.equal(opts.headers['api-key'],authSecret);
 throw Error(raw);
}}),e=>!e.message.includes(authSecret)&&/تعذر الاتصال/.test(e.message));

// Source QA uses the same 320px avatar minimum as normalization. A 310px
// candidate must be skipped in favor of a valid candidate from the same film.
const sharp=(await import('sharp')).default;
const {generatedPair}=await import('./fixtures.mjs');
const {validatePair}=await import('../src/quality-gate.js');
const generated=await generatedPair(33);
const small=await sharp(generated.avatar).resize(310,388).png().toBuffer();
const enough=await sharp(generated.avatar).resize(400,500).png().toBuffer();
const checkedMinimums=[];
const normalized=await fetchFanartMovie(new Set(),{...base,apiKey:'normalization-size-fixture',
 apiFetch:async()=>({ok:true,json:async()=>({...film(),movieposter:[art(1,'poster'),art(2,'poster')],moviebackground:[art(4,'background')]})}),
 imageFetch:async url=>url.includes('poster-1')?small:url.includes('poster-2')?enough:generated.banner,
 validate:async(av,bn,opts)=>{checkedMinimums.push(opts.minAvatar);return validatePair(av,bn,opts);}
});
assert.equal(normalized.sourceIds[0],'fanart:art:2');assert.deepEqual(checkedMinimums,[320,320]);
console.log('PASS: later matching artwork, rotating search windows, bounded work, query authentication privacy and normalization-consistent dimensions');


// Moving avatar/banner windows in lockstep can never find a pair separated
// across distant list positions. Cartesian tiles must reach that combination.
const separatedFilm={...film(),movieposter:Array.from({length:20},(_,i)=>art(500+i,'poster')),moviebackground:Array.from({length:20},(_,i)=>art(600+i,'background'))};
let separatedDownloads=0;
const separated={...base,apiKey:'separated-pair-fixture',apiFetch:async()=>({ok:true,json:async()=>separatedFilm}),imageFetch:async url=>{separatedDownloads++;return Buffer.from(url);},
 validate:async(avatar,banner)=>{if(!avatar.toString().includes('poster-500')||!banner.toString().includes('background-610'))throw Error('not a matching pair');}};
await assert.rejects(fetchFanartMovie(new Set(),separated),e=>e.code==='FANART_SEARCH_CONTINUES');
assert(separatedDownloads<=12);separatedDownloads=0;
const separatedPair=await fetchFanartMovie(new Set(),separated);
assert.deepEqual(separatedPair.sourceIds,['fanart:art:500','fanart:art:610']);assert(separatedDownloads<=12);
const revalidated=await fetchFanartMovie(new Set(),separated);
assert.deepEqual(revalidated.sourceIds,separatedPair.sourceIds,'a pending pair stays reachable for online revalidation before publication');

// Exhaustion is reported only after all stable artwork tiles were examined.
const exhaustedFilm={...film(),movieposter:Array.from({length:7},(_,i)=>art(700+i,'poster')),moviebackground:[art(800,'background')]};
const exhausted={...base,apiKey:'exhausted-grid-fixture',apiFetch:async()=>({ok:true,json:async()=>exhaustedFilm}),imageFetch:async url=>Buffer.from(url),validate:async()=>{throw Error('no matching tone');}};
await assert.rejects(fetchFanartMovie(new Set(),exhausted),e=>e.code==='FANART_SEARCH_CONTINUES');
assert.equal(await fetchFanartMovie(new Set(),exhausted),null);
console.log('PASS: Cartesian artwork windows reach separated matches and distinguish continuation from fully checked exhaustion');
