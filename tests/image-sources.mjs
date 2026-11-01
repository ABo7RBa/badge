import assert from 'node:assert/strict';
import {acceptUnsplashPhoto,fetchUnsplashPair,trackUnsplashPair} from '../src/unsplash-source.js';
import {filmIds,validArtwork,fetchFanartMovie} from '../src/fanart-source.js';
import {fetchCategoryAssets} from '../src/image-sources.js';
import {isRemovedSource,packs,guild,addPack} from '../src/db.js';

const photo=(id,label,banner=false)=>({id,width:banner?2400:900,height:banner?1350:1200,
 alt_description:label,description:label,color:'#333333',tags:label.split(',').map(title=>({title:title.trim()})),
 urls:{regular:`https://images.unsplash.com/photo-${id}?ixid=original-${id}&w=1080`},
 links:{html:`https://unsplash.com/photos/${id}`,download_location:`https://api.unsplash.com/photos/${id}/download?ixid=original-${id}`},
 user:{name:'Test Artist',links:{html:'https://unsplash.com/@testartist'}}});
const woman=photo('female001','woman, portrait, outdoors'),man=photo('male00001','man, black hoodie, from behind, city, night');
const scene=photo('scene0001','city street, train station, cloudy grass field, black and white, night',true);
assert(acceptUnsplashPhoto('girls','avatar',woman));assert(!acceptUnsplashPhoto('boys','avatar',woman));
assert(acceptUnsplashPhoto('boys','avatar',man));assert(!acceptUnsplashPhoto('girls','avatar',man));
const requested=[];
const unsplashFetch=async(url,opts)=>{
 const u=new URL(url);requested.push(u);assert.equal(u.hostname,'api.unsplash.com');
 assert.equal(opts.headers.Authorization,'Client-ID test-key');assert.equal(opts.redirect,'error');
 if(u.pathname.endsWith('/download'))return {ok:true,json:async()=>({url:'https://images.unsplash.com/download'})};
 assert.equal(u.pathname,'/search/photos');assert.equal(u.searchParams.get('content_filter'),'high');
 return {ok:true,json:async()=>({total:2,total_pages:5,results:u.searchParams.get('orientation')==='landscape'?[scene]:[woman,man]})};
};
const options={accessKey:'test-key',apiFetch:unsplashFetch,cacheDir:false};
const girls=await fetchCategoryAssets('girls',new Set(),options);
assert.equal(girls.provider,'Unsplash');assert.equal(girls.verificationSource,'unsplash-photo');assert(girls.remote);
assert.deepEqual(girls.sourceIds,['unsplash:female001','unsplash:scene0001']);
assert.equal(girls.avatarURL,woman.urls.regular);assert.equal(girls.bannerURL,scene.urls.regular);
assert(girls.credits.avatar.url.includes('utm_source=abo7rb'));
assert.equal((await fetchCategoryAssets('boys',new Set(),options)).sourceIds[0],'unsplash:male00001');
assert(requested.some(u=>u.searchParams.get('query')?.startsWith('woman ')));
assert(requested.some(u=>u.searchParams.get('query')?.startsWith('man ')));
assert.equal(requested.some(u=>u.pathname.endsWith('/download')),false,'search must not track unused candidates');
await trackUnsplashPair(girls,options);
assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,2);
assert.equal(await fetchUnsplashPair('girls',new Set(girls.sourceIds),options),null);
await assert.rejects(fetchUnsplashPair('girls',new Set(),{accessKey:''}),/UNSPLASH_ACCESS_KEY/);

assert.deepEqual(filmIds('tt1375666,tt1375666,tt0816692'),['tt1375666','tt0816692']);
assert.throws(()=>filmIds('https://evil.test/'),/IMDb/);
const art=(id,file)=>({id:String(id),url:`https://assets.fanart.tv/fanart/movies/27205/${file}.jpg`});
const poster=art(1,'movieposter'),background=art(2,'moviebackground');
assert(validArtwork(poster));assert(!validArtwork({...poster,url:'https://evil.test/poster.jpg'}));
const movie={imdb_id:'tt1375666',name:'Inception',movieposter:[poster],moviebackground:[background]};
const filmOptions={apiKey:'test-key',imageFetch:async url=>Buffer.from(url),validate:async()=>true,ids:['tt1375666'],apiFetch:async(url,opts)=>{
  assert.equal(new URL(url).hostname,'webservice.fanart.tv');
  assert(new URL(url).pathname.endsWith('/movies/tt1375666'));
  assert.equal(opts.headers['api-key'],'test-key');return {ok:true,json:async()=>movie};
}};
const film=await fetchCategoryAssets('movies',new Set(),filmOptions);
assert.equal(film.sourceId,'fanart:movie:tt1375666');assert.equal(film.category,'movies');
assert.equal(film.filmVerified,true);assert(film.sourceUrl.includes('tt1375666'));
assert(film.avatar.toString().includes('movieposter'));assert(film.banner.toString().includes('moviebackground'));
assert.equal(await fetchFanartMovie(new Set([film.sourceId]),filmOptions),null);
assert.equal(await fetchFanartMovie(new Set(['fanart:art:1']),filmOptions),null);
for(const bad of [{...movie,imdb_id:'tt0816692'},{...movie,moviebackground:[]},{...movie,moviebackground:[poster]},
  {...movie,movieposter:[{...poster,url:'https://evil.test/image.jpg'}]}]){
  assert.equal(await fetchFanartMovie(new Set(),{...filmOptions,apiFetch:async()=>({ok:true,json:async()=>bad})}),null);
}
await assert.rejects(fetchFanartMovie(new Set(),{apiKey:''}),/FANART_API_KEY/);
await assert.rejects(fetchFanartMovie(new Set(),{...filmOptions,apiFetch:async()=>({ok:false,status:429})}),/429/);
assert.equal(await fetchFanartMovie(new Set(),{...filmOptions,apiFetch:async()=>({ok:false,status:404})}),null);
const fallbackFilm=await fetchFanartMovie(new Set(),{...filmOptions,ids:['tt0816692','tt1375666'],
 apiFetch:async url=>new URL(url).pathname.endsWith('tt0816692')?{ok:false,status:404}:{ok:true,json:async()=>movie}});
assert.equal(fallbackFilm.sourceId,'fanart:movie:tt1375666');

const wallhaven=cat=>({id:'a1b2c3',url:'https://wallhaven.cc/w/a1b2c3',category:cat,purity:'sfw',
 dimension_x:2560,dimension_y:1440,thumbs:{large:'https://th.wallhaven.cc/lg/a1/a1b2c3.jpg'}});
for(const [cat,remote] of [['anime','anime'],['pc_wallpapers','general']]){
 const result=await fetchCategoryAssets(cat,new Set(),{apiFetch:async()=>({ok:true,json:async()=>({data:[wallhaven(remote)]})})});
 assert.equal(result.linkOnly,true);assert.equal(result.provider,'Wallhaven');assert.equal(result.category,cat);
}
await assert.rejects(fetchCategoryAssets('unknown'),/غير مدعوم/);

// Existing removed-source records stay preserved, but are excluded from publication.
for(const p of [{sourceId:'openverse:old'},{sourceId:'tmdb:movie:12'},
  {sourceUrl:'https://commons.wikimedia.org/wiki/File:old'}, {sourceUrl:'https://image.tmdb.org/t/p/w500/old.jpg'},
  {verificationSource:'commons-photo'}, {verificationSource:'openverse-photo'}])assert(isRemovedSource(p));
assert(!isRemovedSource(girls));assert(!isRemovedSource(film));
const state={guilds:{}};const g=guild('source-tests',state);
const old={...packs('source-tests','anime',state)[0],id:'old-provider',bundled:false,reviewedWithV86:true,
 importedAutomatically:true,categoryVerified:true,sourceId:'openverse:old'};
g.packs.push(old);assert(!packs('source-tests',null,state).some(p=>p.id===old.id));
assert.equal(g.packs.length,1);assert.throws(()=>addPack('source-tests',old,state),/المصدر محذوف/);
console.log('PASS: five source routes, classification, URLs, auth, rate limits, pairing, repeat prevention and removed-source quarantine');
