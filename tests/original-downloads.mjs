import assert from 'node:assert/strict';
import sharp from 'sharp';
import {downloadOriginalPair} from '../src/original-downloads.js';
import {generatedPair,remotePair} from './fixtures.mjs';

const raw=await generatedPair(51),avatar=raw.avatar,banner=raw.banner;
const jpegAvatar=await sharp(avatar).jpeg().toBuffer(),webpBanner=await sharp(banner).webp().toBuffer();
const missingCrops={avatar:'storage/packs/not-present/cropped-avatar.jpg',banner:'storage/packs/not-present/cropped-banner.jpg'};
const movie=(patch={})=>({id:'existing-movie',kind:'profile',category:'movies',provider:'Fanart.tv',verificationSource:'fanart-movie',
 importedAutomatically:true,categoryVerified:true,filmVerified:true,reviewedWithV86:true,deliveryState:'published',
 sourceId:'fanart:movie:tt1375666|fanart:art:100|fanart:art:200',sourceIds:['fanart:art:100','fanart:art:200'],
 sourceUrl:'https://www.imdb.com/title/tt1375666/',...missingCrops,...patch});
const anime=(patch={})=>({id:'existing-anime',kind:'profile',category:'anime',provider:'Wallhaven',verificationSource:'wallhaven-anime-pair',
 importedAutomatically:true,categoryVerified:true,reviewedWithV86:true,sourceIds:['wallhaven:a1b2c3','wallhaven:d4e5f6'],
 sourceId:'wallhaven:a1b2c3|wallhaven:d4e5f6',...missingCrops,...patch});
const animeAsset=(id,isAvatar)=>({id,url:'https://wallhaven.cc/w/'+id,category:'anime',purity:'sfw',tags:[{name:'anime'}],
 dimension_x:isAvatar?800:1600,dimension_y:isAvatar?1000:900,path:`https://w.wallhaven.cc/full/${id.slice(0,2)}/wallhaven-${id}.jpg`});
const avAsset=animeAsset('a1b2c3',true),bnAsset=animeAsset('d4e5f6',false);

async function assertOriginalFiles(files,expectedAvatar,expectedBanner,extensions=['png','png']){
 assert.deepEqual(files.map(file=>file.filename),[`avatar-original.${extensions[0]}`,`banner-original.${extensions[1]}`]);
 assert.equal(files.length,2);assert.equal(files[0].buffer,expectedAvatar);assert.equal(files[1].buffer,expectedBanner);
 const sizes=await Promise.all(files.map(file=>sharp(file.buffer).metadata()));
 assert.equal(sizes[0].width,800);assert.equal(sizes[0].height,1000,'avatar must retain the complete portrait, not its512px crop orcard');
 assert.equal(sizes[1].width,1600);assert.equal(sizes[1].height,900,'banner must retain the full frame, not its1200x480 crop orcard');
}

// Unsplash uses the exact saved source URLs, without metadata search, URL edits,
// API authentication on the image host, tracking or local cropped-image reads.
const photo={...remotePair('original01'),reviewedWithV86:true};
photo.avatarURL+='&w=1080&fit=max';photo.bannerURL+='&w=1080&fit=max';
const photoBefore=JSON.stringify(photo),photoRequests=[];
const photoFiles=await downloadOriginalPair(photo,{
 apiFetch:async()=>{assert.fail('stored Unsplash records need no new search or tracking call in this helper');},
 imageFetch:async(url,...extra)=>{
  photoRequests.push(url);assert.equal(extra.length,0);assert.equal(new URL(url).searchParams.get('ixid'),'original');
  return url===photo.avatarURL?avatar:banner;
 }
});
await assertOriginalFiles(photoFiles,avatar,banner);assert.equal(JSON.stringify(photo),photoBefore);
assert.deepEqual(photoRequests,[photo.avatarURL,photo.bannerURL]);

// Old saved anime metadata can recover both originals even when normalized
// crop files are missing. Details are for those exact IDs and roles only.
const animeRecord=anime(),animeBefore=JSON.stringify(animeRecord),animeAPI=[],animeImages=[];
const animeFiles=await downloadOriginalPair(animeRecord,{
 wallhavenApiKey:'wallhaven-fixture-key',apiFetch:async(raw,options)=>{
  const url=new URL(raw);animeAPI.push(url);assert.equal(url.hostname,'wallhaven.cc');assert.equal(url.searchParams.get('apikey'),'wallhaven-fixture-key');
  assert.equal(options.redirect,'error');assert(!url.pathname.includes('/search'));
  return {ok:true,json:async()=>({data:url.pathname.endsWith('/a1b2c3')?avAsset:bnAsset})};
 },imageFetch:async url=>{animeImages.push(url);return url===avAsset.path?avatar:banner;}
});
await assertOriginalFiles(animeFiles,avatar,banner);assert.equal(JSON.stringify(animeRecord),animeBefore);
assert.deepEqual(animeAPI.map(url=>url.pathname),['/api/v1/w/a1b2c3','/api/v1/w/d4e5f6']);
assert.deepEqual(animeImages,[avAsset.path,bnAsset.path]);
for(const patch of [
 {id:'f0e1d2'},{purity:'nsfw'},{category:'general'},{tags:[{name:'nudity'}]},{tags:{name:'anime'}},
 {path:'https://evil.test/wallhaven-a1b2c3.jpg'},
 {path:'https://w.wallhaven.cc/full/d4/wallhaven-a1b2c3.jpg'},
 {path:avAsset.path+'?size=preview'},
 {path:'https://user:pass@w.wallhaven.cc/full/a1/wallhaven-a1b2c3.jpg'},
 {path:'https://w.wallhaven.cc:443/full/a1/wallhaven-a1b2c3.jpg'}
])await assert.rejects(downloadOriginalPair(anime(),{
 apiFetch:async()=>({ok:true,json:async()=>({data:{...avAsset,...patch}})}),imageFetch:async()=>{assert.fail('unavailable exact anime artwork must not be substituted or downloaded');}
}),error=>error.code==='ORIGINAL_SOURCE_UNAVAILABLE');

// Find exact movie artwork IDs in their original arrays, even when different
// images come first. Current flat and legacy nested CDN paths both work.
const moviePoster='https://assets.fanart.tv/fanart/inception-52df821bd2a9f.jpg';
const movieBanner='https://assets.fanart.tv/fanart/movies/27205/moviebackground/inception-4fdb7d192f166.webp';
const movieJSON={imdb_id:'tt1375666',name:'Inception',movieposter:[
 {id:'999',url:'https://assets.fanart.tv/fanart/not-the-posted-image.jpg'},
 {id:'100',url:moviePoster.replace('https:','http:')}
],moviebackground:[{id:'888',url:'https://assets.fanart.tv/fanart/another-background.jpg'},{id:'200',url:movieBanner}]};
for(const record of [movie(),movie({sourceId:'fanart:movie:tt1375666'}),movie({sourceId:undefined})]){
 let apiCalls=0;const imageRequests=[],before=JSON.stringify(record);
 const files=await downloadOriginalPair(record,{
  fanartApiKey:'fanart-original-fixture',apiFetch:async(raw,options)=>{
   apiCalls++;const url=new URL(raw);assert.equal(url.pathname,'/v3/movies/tt1375666');assert.equal(url.searchParams.get('api_key'),'fanart-original-fixture');
   assert.equal(options.headers['api-key'],'fanart-original-fixture');assert.equal(options.redirect,'error');return Response.json(movieJSON);
  },imageFetch:async url=>{
   imageRequests.push(url);assert.equal(new URL(url).protocol,'https:');assert.equal(new URL(url).hostname,'assets.fanart.tv');
   if(url===moviePoster)return jpegAvatar;if(url===movieBanner)return webpBanner;assert.fail('a different movie image was selected');
  }
 });
 await assertOriginalFiles(files,jpegAvatar,webpBanner,['jpg','webp']);
 assert.equal(apiCalls,1);assert.deepEqual(imageRequests,[moviePoster,movieBanner]);assert.equal(JSON.stringify(record),before);
}
for(const body of [
 {...movieJSON,imdb_id:'tt0816692'},
 {...movieJSON,movieposter:[movieJSON.movieposter[0]]},
 {...movieJSON,moviebackground:[movieJSON.moviebackground[0]]},
 {...movieJSON,movieposter:[{id:'100',url:'https://evil.test/fanart/inception.jpg'}]},
 {...movieJSON,movieposter:[{id:'100',url:'https://user:pass@assets.fanart.tv/fanart/inception.jpg'}]},
 {...movieJSON,movieposter:[{id:'100',url:'https://assets.fanart.tv:8443/fanart/inception.jpg'}]},
 {...movieJSON,movieposter:[{id:'100',url:'https://assets.fanart.tv/fanart/inception.svg'}]},
 {...movieJSON,movieposter:'not-an-array'},null,{},[]
])await assert.rejects(downloadOriginalPair(movie(),{
 fanartApiKey:'fixture',apiFetch:async()=>({ok:true,json:async()=>body}),imageFetch:async()=>{assert.fail('a missing exact movie image may not use another asset or the crop');}
}),error=>error.code==='ORIGINAL_SOURCE_UNAVAILABLE');

// Metadata gates run before requests and reject manual/removed/quarantined
// records, mismatched IDs and conflicting film provenance.
for(const record of [
 movie({importedAutomatically:false}),movie({categoryVerified:false}),movie({reviewedWithV86:false}),movie({filmVerified:false}),
 movie({provider:'Openverse'}),movie({sourceUrl:'https://openverse.org/photos/old'}),movie({kind:'wallpaper'}),
 movie({sourceIds:['fanart:art:100','fanart:art:100']}),movie({sourceIds:['fanart:art:../100','fanart:art:200']}),
 movie({sourceId:'fanart:movie:tt1375666|fanart:art:200|fanart:art:100'}),
 movie({sourceUrl:'https://www.imdb.com/title/tt0816692/'}),movie({sourceId:undefined,sourceUrl:'https://evil.test/title/tt1375666/'}),
 anime({sourceId:'wallhaven:d4e5f6|wallhaven:a1b2c3'}),
 {...photo,avatarURL:'https://images.unsplash.com.evil.test/photo-original01av'}
])await assert.rejects(downloadOriginalPair(record,{
 apiFetch:async()=>{assert.fail('untrusted metadata must not contact an API');},imageFetch:async()=>{assert.fail('untrusted metadata must not contact a CDN');}
}),error=>error.code==='ORIGINAL_RECORD_INVALID');

// Downloaded originals are bounded, fully decoded supported images. The
// helper never re-encodes, resizes or clips them into another profile card.
for(const bytes of [Buffer.from('invalid image'),Buffer.alloc(8*1024*1024+1),Buffer.from('<svg width="800" height="1000"></svg>'),await sharp(avatar).tiff().toBuffer()]){
 await assert.rejects(downloadOriginalPair(photo,{imageFetch:async url=>url===photo.avatarURL?bytes:banner}),error=>error.code==='ORIGINAL_IMAGE_INVALID');
}
const oversized=await sharp({create:{width:8001,height:5000,channels:3,background:'#29374a'}}).jpeg({quality:10}).toBuffer();
await assert.rejects(downloadOriginalPair(photo,{imageFetch:async url=>url===photo.avatarURL?oversized:banner}),error=>error.code==='ORIGINAL_IMAGE_INVALID');
const frameBytes=800*1000*3,frames=Buffer.alloc(frameBytes*2,30);frames.fill(160,frameBytes);
const animated=await sharp(frames,{raw:{width:800,height:2000,channels:3,pageHeight:1000}}).webp({loop:0,delay:[100,100]}).toBuffer();
assert.equal((await sharp(animated).metadata()).pages,2);
await assert.rejects(downloadOriginalPair(photo,{imageFetch:async url=>url===photo.avatarURL?animated:banner}),error=>error.code==='ORIGINAL_IMAGE_INVALID');
const truncated=jpegAvatar.subarray(0,Math.floor(jpegAvatar.length*.7));assert.equal((await sharp(truncated).metadata()).width,800);
await assert.rejects(downloadOriginalPair(photo,{imageFetch:async url=>url===photo.avatarURL?truncated:banner}),error=>error.code==='ORIGINAL_IMAGE_INVALID');
const oriented=await sharp({create:{width:1000,height:800,channels:3,background:'#29374a'}}).withMetadata({orientation:6}).jpeg().toBuffer();
const orientationFiles=await downloadOriginalPair(photo,{imageFetch:async url=>url===photo.avatarURL?oriented:banner});
assert.equal(orientationFiles[0].buffer,oriented);assert.equal((await sharp(orientationFiles[0].buffer).metadata()).orientation,6);

// Fixed errors never contain request URLs, keys, raw API text or CDN failures.
const secret='original-download-private-fixture';
await assert.rejects(downloadOriginalPair(movie(),{fanartApiKey:secret,apiFetch:async raw=>{throw Error(raw);}}),error=>!error.message.includes(secret)&&!error.message.includes('https:'));
await assert.rejects(downloadOriginalPair(movie(),{fanartApiKey:secret,apiFetch:async()=>Response.json({status:'error',message:secret+' https://private.test/'})}),error=>error.code==='ORIGINAL_SOURCE_ERROR'&&!error.message.includes(secret)&&!error.message.includes('https:'));
await assert.rejects(downloadOriginalPair(photo,{imageFetch:async()=>{throw Error(secret+' https://private.test/');}}),error=>error.code==='ORIGINAL_DOWNLOAD_FAILED'&&!error.message.includes(secret)&&!error.message.includes('https:'));
console.log('PASS: uncropped exact-original profile downloads, old metadata/IDs, current+legacy CDN paths, no replacement/crop fallback, immutable records and safe bounds/errors');
