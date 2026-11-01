import assert from 'node:assert/strict';
import {animePairSearchUrl,acceptAnimeAsset,fetchAnimePair} from '../src/anime-pairs.js';
const asset=(id,avatar)=>({id,url:`https://wallhaven.cc/w/${id}`,category:'anime',purity:'sfw',
 dimension_x:avatar?900:2560,dimension_y:avatar?1200:1440,
 path:`https://w.wallhaven.cc/full/${id.slice(0,2)}/wallhaven-${id}.jpg`,tags:[]});
const av=asset('a1b2c3',true),bn=asset('d4e5f6',false);
assert(acceptAnimeAsset('avatar',av));assert(acceptAnimeAsset('banner',bn));
for(const patch of [{purity:'nsfw'},{category:'people'},{path:'https://evil.test/img.jpg'},
 {path:'https://w.wallhaven.cc/full/a1/wallhaven-d4e5f6.jpg'},
 {tags:[{name:'nudity'}]},{dimension_x:100}])assert(!acceptAnimeAsset('avatar',{...av,...patch}));
assert(!acceptAnimeAsset('banner',av));assert(!acceptAnimeAsset('avatar',bn));
for(const kind of ['avatar','banner']){
 const url=animePairSearchUrl(kind);assert.equal(url.searchParams.get('categories'),'010');assert.equal(url.searchParams.get('purity'),'100');
}
let calls=[],downloads=[],checked=0;
const options={apiFetch:async raw=>{
 const u=new URL(raw);calls.push(u);assert.equal(u.hostname,'wallhaven.cc');
 return {ok:true,json:async()=>({data:[u.searchParams.get('q').includes('portrait')?av:bn]})};
},imageFetch:async url=>{downloads.push(url);return Buffer.from(url);},validate:async(a,b)=>{
 checked++;assert.notEqual(a.toString(),b.toString());
}};
const got=await fetchAnimePair(new Set(),options);
assert.equal(got.provider,'Wallhaven');assert.equal(got.category,'anime');assert.equal(got.linkOnly,undefined);
assert.deepEqual(got.sourceIds,['wallhaven:a1b2c3','wallhaven:d4e5f6']);
assert.equal(got.sourceUrl,av.url);assert.equal(got.sourceBannerUrl,bn.url);assert.equal(downloads.length,2);assert.equal(checked,1);
assert.equal(await fetchAnimePair(new Set(got.sourceIds),options),null);
assert.equal(await fetchAnimePair(new Set(),{...options,validate:async()=>{throw Error('different colors')}}),null,'badly matched pairs are skipped');
await assert.rejects(fetchAnimePair(new Set(),{...options,imageFetch:async()=>{throw Error('network')}}),/تعذر تحميل/);
await assert.rejects(fetchAnimePair(new Set(),{...options,apiFetch:async()=>({ok:false,status:429})}),/429/);
console.log('PASS: source-fetched anime avatar/banner pairs, SFW/origin/dimension checks, independent images, quality rejection and duplicate prevention');
