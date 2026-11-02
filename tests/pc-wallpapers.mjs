import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fetchPcWallpaper,fetchPcWallpaperById} from '../src/pc-wallpapers.js';

const id='a1b2c3',secondId='d4e5f6',MB=8*1024*1024;
const original=(raw=id,extension='jpg')=>`https://w.wallhaven.cc/full/${raw.slice(0,2)}/wallhaven-${raw}.${extension}`;
const detail=(patch={},raw=id)=>({id:raw,category:'general',purity:'sfw',tags:[{name:'video games'}],path:original(raw),dimension_x:1920,dimension_y:1080,...patch});
const canvas=()=>sharp({create:{width:1920,height:1080,channels:3,background:'#29374a'}});
const jpeg=await canvas().jpeg().toBuffer(),png=await canvas().png().toBuffer(),webp=await canvas().webp().toBuffer();

async function byId(patch={},bytes=jpeg,extra={}){
 let details=0,downloads=0;
 const result=await fetchPcWallpaperById(id,{
  apiFetch:async(raw,opts)=>{
   const url=new URL(raw);assert.equal(url.hostname,'wallhaven.cc');assert.equal(url.pathname,'/api/v1/w/'+id);
   assert.equal(opts.redirect,'error');assert(opts.signal instanceof AbortSignal);details++;
   return {ok:true,json:async()=>({data:detail(patch)})};
  },imageFetch:async url=>{assert.equal(url,patch.path||original());downloads++;return bytes;},...extra
 });
 return {result,details,downloads};
}

// JPEG/PNG/WebP are returned at original resolution and byte-for-byte intact.
for(const [extension,bytes,filename]of [['jpg',jpeg,'jpg'],['png',png,'png'],['webp',webp,'webp']]){
 const {result,details,downloads}=await byId({path:original(id,extension)},bytes);
 assert(result);assert.equal(details,1);assert.equal(downloads,1);
 assert.equal(result.buffer,bytes);assert.equal(result.filename,`wallhaven-${id}.${filename}`);
 assert.equal(result.id,'wallhaven:'+id);assert.equal(result.rawId,id);assert.equal(result.category,'pc_wallpapers');
 assert.equal(result.width,1920);assert.equal(result.height,1080);assert.equal(result.sourceUrl,'https://wallhaven.cc/w/'+id);assert.equal(result.provider,'Wallhaven');
}
assert((await byId({path:original(id,'jpeg')},jpeg)).result);
assert((await byId({dimension_x:10,dimension_y:10})).result,'decoded size, not an API estimate, establishes the delivered resolution');

// Gender/character tags do not make verified game/anime artwork a photograph.
for(const patch of [
 {tags:[{name:'video games'},{name:'women'},{name:'girls'},{name:'portrait'},{name:'nature'}]},
 {tags:[{name:'Elden Ring'}]},
 {category:'anime',tags:[{name:'Anime Girls'},{name:'women'}]},
 {category:'anime',tags:[{name:'Naruto'}]},
 {category:'anime',tags:[{name:'Genshin Impact'}]}
])assert((await byId(patch)).result,JSON.stringify(patch));
for(const patch of [
 {category:'people'},{purity:'sketchy'},{purity:'nsfw'},{id:secondId},{tags:[]},{tags:null},
 {tags:[{name:'forest'},{name:'nature'},{name:'landscape'}]},
 {tags:[{name:'anime'}]}, // General category needs explicit gaming proof.
 {tags:[{name:'gaming'},{name:'computer'},{name:'hardware'}]},
 {tags:[{name:'Batman'}]},{tags:[{name:'Game of Thrones'}]},{tags:[{name:'Star Wars'}]},{tags:[{name:'The Witcher'}]},
 {tags:[{name:'video games'},{name:'cosplay'}]},{tags:[{name:'video games'},{name:'Naruto cosplay'}]},
 {tags:[{name:'video games'},{name:'photography'}]},
 {category:'anime',tags:[{name:'anime'},{name:'photography'}]},
 {category:'anime',tags:[{name:'forest'}]},
 {tags:[{name:'video games',purity:'sketchy'}]},
 {file_size:MB+1}
]){
 const {result,downloads}=await byId(patch);assert.equal(result,null,JSON.stringify(patch));assert.equal(downloads,0,'ineligible metadata must not use the download budget');
}

// Original URLs must bind the precise ID and prefix, with no redirects or URL
// credentials/port/query/fragment/normalization tricks accepted as originals.
for(const path of [
 'http://w.wallhaven.cc/full/a1/wallhaven-a1b2c3.jpg',
 'https://evil.test/full/a1/wallhaven-a1b2c3.jpg',
 'https://w.wallhaven.cc.evil.test/full/a1/wallhaven-a1b2c3.jpg',
 'https://user:pass@w.wallhaven.cc/full/a1/wallhaven-a1b2c3.jpg',
 'https://w.wallhaven.cc:443/full/a1/wallhaven-a1b2c3.jpg',
 'https://w.wallhaven.cc:8443/full/a1/wallhaven-a1b2c3.jpg',
 original()+'?download=1',original()+'#image',
 'https://w.wallhaven.cc/full/d4/wallhaven-a1b2c3.jpg',
 'https://w.wallhaven.cc/full/a1/wallhaven-d4e5f6.jpg',
 'https://w.wallhaven.cc/full/aa/../a1/wallhaven-a1b2c3.jpg',
 'https://w.wallhaven.cc/full/a1/wallhaven-a1b2c3.svg'
]){
 const {result,downloads}=await byId({path});assert.equal(result,null,path);assert.equal(downloads,0);
}
await assert.rejects(fetchPcWallpaperById('../a1b2c3'),/معرف/);

// Metadata cannot disguise a low-resolution, portrait, square or corrupt file.
for(const dimensions of [[1280,720],[1080,1920],[1920,1920]]){
 const bytes=await sharp({create:{width:dimensions[0],height:dimensions[1],channels:3,background:'#29374a'}}).png().toBuffer();
 assert.equal((await byId({dimension_x:3840,dimension_y:2160},bytes)).result,null);
}
const portraitEncoded=await sharp({create:{width:1080,height:1920,channels:3,background:'#29374a'}}).withMetadata({orientation:6}).jpeg().toBuffer();
const oriented=(await byId({},portraitEncoded)).result;assert(oriented);assert.equal(oriented.width,1920);assert.equal(oriented.height,1080);assert.equal(oriented.buffer,portraitEncoded);
const truncated=jpeg.subarray(0,Math.floor(jpeg.length*.7));
assert.equal((await sharp(truncated).metadata()).width,1920,'fixture has a readable header but incomplete pixel data');
assert.equal((await byId({},truncated)).result,null,'the source must decode the full original, not only inspect its header');
assert.equal((await byId({},Buffer.from('not an image'))).result,null);
assert.equal((await byId({},Buffer.alloc(MB+1))).result,null);
const oversizedPixels=await sharp({create:{width:8001,height:5000,channels:3,background:'#29374a'}}).jpeg({quality:10}).toBuffer();
assert((await sharp(oversizedPixels,{limitInputPixels:false}).metadata()).width*5000>40_000_000);
assert.equal((await byId({},oversizedPixels)).result,null);
const tiff=await canvas().tiff().toBuffer();assert.equal((await byId({},tiff)).result,null);
const frameBytes=1920*1080*3,frames=Buffer.alloc(frameBytes*2,35);frames.fill(180,frameBytes);
const animated=await sharp(frames,{raw:{width:1920,height:2160,channels:3,pageHeight:1080}}).webp({loop:0,delay:[100,100]}).toBuffer();
assert.equal((await sharp(animated).metadata()).pages,2);assert.equal((await byId({},animated)).result,null);

// Search tags are not proof: each candidate must be checked through details.
let searches=0,details=0,downloads=0;
const checkedPaths=[];
const found=await fetchPcWallpaper(new Set(['wallhaven:'+id]),{apiKey:'private-fixture-key',apiFetch:async(raw,opts)=>{
 const url=new URL(raw);checkedPaths.push(url.pathname);assert.equal(url.searchParams.get('apikey'),'private-fixture-key');assert.equal(opts.redirect,'error');
 if(url.pathname==='/api/v1/search'){
  searches++;assert.equal(url.searchParams.get('purity'),'100');assert.equal(url.searchParams.get('atleast'),'1920x1080');
  assert(['100','010'].includes(url.searchParams.get('categories')));
  return {ok:true,json:async()=>({data:[{id,tags:[{name:'video games'}]},{id:secondId}]})};
 }
 details++;assert.equal(url.pathname,'/api/v1/w/'+secondId);
 return {ok:true,json:async()=>({data:detail({},secondId)})};
},imageFetch:async url=>{downloads++;assert.equal(url,original(secondId));return jpeg;}});
assert.equal(found.rawId,secondId);assert.equal(searches,1);assert.equal(details,1);assert.equal(downloads,1);
assert(!checkedPaths.includes('/api/v1/w/'+id),'seen photos do not consume detail or download requests');
const byReference=await fetchPcWallpaperById('wallhaven:'+id,{apiFetch:async()=>({ok:true,json:async()=>({data:detail()})}),imageFetch:async()=>jpeg});
assert.equal(byReference.rawId,id);

searches=0;details=0;downloads=0;
assert.equal(await fetchPcWallpaper(new Set(),{apiFetch:async raw=>{
 const url=new URL(raw);
 if(url.pathname==='/api/v1/search'){
  searches++;const prefix=searches===1?'a':'b';
  return {ok:true,json:async()=>({data:Array.from({length:20},(_,n)=>({id:prefix+String(n).padStart(5,'0'),tags:[{name:'video games'}]}))})};
 }
 details++;const rawId=url.pathname.split('/').at(-1);
 return {ok:true,json:async()=>({data:detail({tags:[{name:'nature'}]},rawId)})};
},imageFetch:async()=>{downloads++;return jpeg;}}),null);
assert.equal(searches,2);assert.equal(details,6);assert.equal(downloads,0);
searches=0;details=0;downloads=0;
assert.equal(await fetchPcWallpaper(new Set(),{apiFetch:async raw=>{
 const url=new URL(raw);
 if(url.pathname==='/api/v1/search'){searches++;return {ok:true,json:async()=>({data:[{id},{id:secondId},{id:'f0e1d2'}]})};}
 details++;return {ok:true,json:async()=>({data:detail({},url.pathname.split('/').at(-1))})};
},imageFetch:async()=>{downloads++;return Buffer.from('bad image');}}),null);
assert.equal(downloads,2);assert(details<=6&&searches<=2);

// Cancellation is checked at each source boundary, including failures after
// the room was paused; nothing may continue to the next stage or send a file.
for(const stage of ['before','search','details','image']){
 let active=stage!=='before',apiCalls=0,imageCalls=0;
 const item=await fetchPcWallpaper(new Set(),{shouldContinue:()=>active,apiFetch:async raw=>{
  apiCalls++;const url=new URL(raw),search=url.pathname==='/api/v1/search';
  return {ok:true,json:async()=>{
   if(stage===(search?'search':'details'))active=false;
   return search?{data:[{id}]}:{data:detail()};
  }};
 },imageFetch:async()=>{imageCalls++;if(stage==='image')active=false;return jpeg;}});
 assert.equal(item,null);
 if(stage==='before')assert.equal(apiCalls,0);
 if(stage==='search')assert.equal(apiCalls,1);
 assert.equal(imageCalls,stage==='image'?1:0);
}
let active=true;
assert.equal(await fetchPcWallpaper(new Set(),{shouldContinue:()=>active,apiFetch:async()=>{active=false;return {ok:false,status:503};},imageFetch:async()=>{assert.fail('canceled API errors must not download');}}),null);
assert.equal(await fetchPcWallpaperById(id,{shouldContinue:()=>false,apiFetch:async()=>{assert.fail('canceled by-ID retrieval must not contact API');}}),null);

// Source/API errors remain distinct from policy rejection, without raw request
// URLs or credentials leaking through error messages.
await assert.rejects(fetchPcWallpaper(new Set(),{apiFetch:async()=>({ok:false,status:429})}),/429/);
await assert.rejects(fetchPcWallpaperById(id,{apiKey:'do-not-print-this-key',apiFetch:async raw=>{throw Error(raw);}}),error=>!error.message.includes('do-not-print-this-key')&&/Wallhaven/.test(error.message));
await assert.rejects(fetchPcWallpaperById(id,{apiFetch:async()=>({ok:true,json:async()=>({data:detail()})}),imageFetch:async()=>{throw Error('raw private transport detail');}}),error=>error.code==='WALLHAVEN_PC_IMAGE_NETWORK'&&!error.message.includes('raw private'));
assert.equal(await fetchPcWallpaperById(id,{apiFetch:async()=>({ok:false,status:404}),imageFetch:async()=>{assert.fail('removed wallpaper must not be downloaded');}}),null);
console.log('PASS: original PC game/anime wallpapers, mandatory detail proof, strict URLs, actual decoding/limits, exact bytes, seen IDs, cancellation and bounded requests');


// Malformed HTTP200 data is an API-schema failure, not an empty candidate set.
// Only fixed diagnostics escape, never raw body values, URLs or credentials.
const schemaSecret='schema-private-value';
for(const data of [undefined,null,{},'https://private.test/?apikey='+schemaSecret,42]){
 await assert.rejects(fetchPcWallpaper(new Set(),{
  apiFetch:async()=>({ok:true,json:async()=>({data,error:schemaSecret})}),
  imageFetch:async()=>{assert.fail('malformed search data must not download');}
 }),error=>/رد البحث غير صالح/.test(error.message)&&!error.message.includes(schemaSecret)&&!error.message.includes('https:'));
}
for(const data of [undefined,null,[],'https://private.test/?apikey='+schemaSecret,42]){
 await assert.rejects(fetchPcWallpaperById(id,{
  apiFetch:async()=>({ok:true,json:async()=>({data,error:schemaSecret})}),
  imageFetch:async()=>{assert.fail('malformed detail data must not download');}
 }),error=>/بيانات الخلفية غير صالحة/.test(error.message)&&!error.message.includes(schemaSecret)&&!error.message.includes('https:'));
}
assert.equal(await fetchPcWallpaperById(id,{apiFetch:async()=>({ok:true,json:async()=>({data:{id,tags:[]}})}),imageFetch:async()=>{assert.fail('valid object with no policy proof remains rejected');}}),null);
console.log('PASS: malformed Wallhaven search/detail success bodies produce fixed, secret-safe diagnostics');
