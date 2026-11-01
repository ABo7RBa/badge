import assert from 'node:assert/strict';
import {fetchFanartMovie} from '../src/fanart-source.js';
import {guild,migrateLegacySettings} from '../src/db.js';
const art=id=>({id:String(id),url:`https://assets.fanart.tv/fanart/movies/1/image-${id}.jpg`});
const film={imdb_id:'tt1375666',name:'Inception',movieposter:[1,2,3,4,5].map(art),moviebackground:[6,7,8,9,10].map(art)};
const options={apiKey:'test-key',ids:['tt1375666'],apiFetch:async()=>({ok:true,json:async()=>film}),imageFetch:async u=>Buffer.from(u),validate:async()=>true};
const seen=new Set();
for(let n=0;n<5;n++){
 const pair=await fetchFanartMovie(seen,options);assert(pair,'a film with unused artwork must remain available');
 assert(pair.sourceId.startsWith('fanart:movie:tt1375666|'));
 assert(pair.sourceIds.every(id=>!seen.has(id)));seen.add(pair.sourceId);for(const id of pair.sourceIds)seen.add(id);
}
assert.equal(seen.size,15);assert.equal(await fetchFanartMovie(seen,options),null);
const first=await fetchFanartMovie(new Set(),options);
const next=await fetchFanartMovie(new Set([first.sourceId]),options);
assert(next);assert(!next.sourceIds.some(id=>first.sourceIds.includes(id)),'composite source IDs also protect against individual photo reuse');
const state={guilds:{}};const g=guild('legacy-films',state);
g.packs.push({id:'keep-this-id',category:'movies',sourceId:'fanart:movie:tt1375666',sourceIds:first.sourceIds});
g.rooms.room={category:'movies',minutes:40,enabled:true,usedIds:['keep-this-id'],queue:[]};
assert(migrateLegacySettings(undefined,state));
assert.equal(g.packs[0].id,'keep-this-id');assert.deepEqual(g.rooms.room.usedIds,['keep-this-id']);
assert.equal(g.packs[0].sourceId,first.sourceId);assert.equal(migrateLegacySettings(undefined,state),false);
const migratedSeen=new Set(g.packs.flatMap(p=>[p.sourceId,...p.sourceIds]));
assert(await fetchFanartMovie(migratedSeen,options),'old records must not permanently block all other artwork of the same film');
console.log('PASS: multiple unique movie pairs, artwork beyond the first three, duplicate prevention and lossless legacy migration');

// Every default catalogue entry is reachable, including the sixth/seventh film.
const sevenIds=Array.from({length:7},(_,i)=>'tt'+String(2000000+i));let sevenCalls=0;
const catalogueFilm=id=>({imdb_id:id,name:'Catalogue Fixture',movieposter:[art(1)],moviebackground:[art(2)]});
const seventh=await fetchFanartMovie(new Set(),{...options,apiKey:'seven-films-fixture',ids:sevenIds,apiFetch:async raw=>{
 sevenCalls++;const id=new URL(raw).pathname.split('/').at(-1),json=catalogueFilm(id);
 if(id!==sevenIds[6])json.movieposter=[];
 return {ok:true,json:async()=>json};
}});
assert(seventh?.sourceId.startsWith('fanart:movie:'+sevenIds[6]+'|'));assert.equal(sevenCalls,7);

// Larger lists are bounded per call and resume in the rest of the catalogue.
const manyIds=Array.from({length:12},(_,i)=>'tt'+String(3000000+i));let manyCalls=0;
const largeCatalogue={...options,apiKey:'large-catalogue-fixture',ids:manyIds,apiFetch:async raw=>{
 manyCalls++;const id=new URL(raw).pathname.split('/').at(-1),json=catalogueFilm(id);
 if(id!==manyIds.at(-1))json.movieposter=[];
 return {ok:true,json:async()=>json};
}};
await assert.rejects(fetchFanartMovie(new Set(),largeCatalogue),e=>e.code==='FANART_SEARCH_CONTINUES');
assert.equal(manyCalls,10);
const twelfth=await fetchFanartMovie(new Set(),largeCatalogue);
assert(twelfth?.sourceId.startsWith('fanart:movie:'+manyIds.at(-1)+'|'));assert.equal(manyCalls,12);
console.log('PASS: all seven default-sized entries and rotating bounded windows through larger film catalogues');
