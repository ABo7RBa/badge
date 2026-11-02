import assert from 'node:assert/strict';
import {packIdsFromMessages,collectRecentPostIds,reconcileRoom} from '../src/history.js';
import {searchWallhaven} from '../src/wallhaven-source.js';

const message=(id,components,author='bot')=>({id,author:{id:author},components:[{components}]});
const download=id=>({customId:`sas:download:${id}`});
const legacy=(id,url=`https://wallhaven.cc/w/${id}`)=>[
 {data:{custom_id:`sas:delete:wh_${id}`}},
 {data:{style:5,url}}
];
const posts=[
 message('new',[download('wh_a1b2c3')]),
 message('api-data',[{data:{custom_id:'sas:download:wh_b2c3d4'}}]),
 message('legacy',legacy('d4e5f6')),
 message('both',[download('wh_a1b2c3'),...legacy('a1b2c3')]),
 message('profile',[download('pair01:banner-01')]),
 message('foreign-author',[download('wh_e5f6g7')],'other-bot'),
 message('foreign-legacy',legacy('e5f6g7'),'user'),
 message('no-link',[{customId:'sas:delete:wh_e5f6g7'}]),
 message('mismatch',legacy('e5f6g7','https://wallhaven.cc/w/a1b2c3')),
 message('foreign-host',legacy('e5f6g7','https://example.com/w/e5f6g7')),
 message('not-link',[{customId:'sas:delete:wh_e5f6g7'},{style:2,url:'https://wallhaven.cc/w/e5f6g7'}]),
 message('uppercase',[download('wh_A1B2C3')]),
 message('short',[download('wh_a1b2c')]),
 message('long',[download('wh_a1b2c34')]),
 message('legacy-uppercase',legacy('A1B2C3'))
];
assert.deepEqual(packIdsFromMessages(posts,'bot'),['wh_a1b2c3','wh_b2c3d4','wh_d4e5f6','wh_a1b2c3','pair01']);

// Exercise Discord pagination, including a legacy post beyond the first page.
const first=[posts[0],posts[4],...Array.from({length:98},(_,n)=>message(`noise-${n}`,[],'user'))];
const second=[posts[1],posts[2]];
const fetches=[];
const channel={messages:{fetch:async args=>{
 fetches.push(args);
 return new Map((fetches.length===1?first:second).map(post=>[post.id,post]));
}}};
const recovered=await collectRecentPostIds(channel,'bot');
assert.deepEqual(fetches,[{limit:100},{limit:100,before:'noise-97'}]);
assert.deepEqual(recovered,['wh_a1b2c3','pair01','wh_b2c3d4','wh_d4e5f6']);

const room={category:'pc_wallpapers',usedIds:['pair00','wh_m1n2o3','wallhaven:p4q5r6'],
 wallhavenUsedIds:['wallhaven:a1b2c3','wallhaven:a1b2c3','wh_z1y2x3'],
 lastId:'wallhaven:s7t8u9',queue:['pair00','pair01','pair02','wh_a1b2c3','wallhaven:d4e5f6']};
reconcileRoom(room,recovered);
assert.deepEqual(room.usedIds,['pair00','pair01'],'PC source IDs must not enter generic pack history');
assert.deepEqual(new Set(room.wallhavenUsedIds),new Set([
 'wallhaven:a1b2c3','wallhaven:z1y2x3','wallhaven:m1n2o3','wallhaven:p4q5r6',
 'wallhaven:s7t8u9','wallhaven:b2c3d4','wallhaven:d4e5f6'
]));
assert.equal(room.wallhavenUsedIds.length,7,'existing and recovered sources are deduplicated');
assert.deepEqual(room.queue,['pair02']);
const persisted=JSON.stringify(room);
const reloaded=JSON.parse(persisted);
reconcileRoom(reloaded,recovered);
assert.equal(JSON.stringify(reloaded),persisted,'repeated restart recovery is idempotent');

const profile={category:'girls',usedIds:['pair00'],queue:['pair00','pair01','pair02']};
reconcileRoom(profile,recovered);
assert.deepEqual(profile.usedIds,['pair00','pair01']);
assert.deepEqual(profile.queue,['pair02']);
assert.equal(profile.wallhavenUsedIds,undefined,'PC markers do not create source history in profile rooms');
const oldProfile={lastId:'old-pair',queue:['old-pair','new-pair']};
reconcileRoom(oldProfile,['new-pair']);
assert.deepEqual(oldProfile.usedIds,['old-pair','new-pair']);
assert.deepEqual(oldProfile.queue,[]);

// A reloaded room's recovered source history drives the real search filter.
const wallpaper=id=>({id,url:`https://wallhaven.cc/w/${id}`,category:'general',purity:'sfw',
 dimension_x:2560,dimension_y:1440,thumbs:{large:`https://th.wallhaven.cc/lg/${id.slice(0,2)}/${id}.jpg`}});
let requests=0;
const seen=new Set(reloaded.wallhavenUsedIds);
const selected=await searchWallhaven('pc_wallpapers',seen,{seed:0,apiKey:'',apiFetch:async()=>{
 requests++;
 return Response.json({data:['a1b2c3','b2c3d4','d4e5f6','n1e2w3'].map(wallpaper)});
}});
assert.equal(selected.id,'wallhaven:n1e2w3','recovered PC images cannot be published again');
assert.equal(requests,1);
const exhausted=await searchWallhaven('pc_wallpapers',seen,{seed:0,attempts:1,apiKey:'',
 apiFetch:async()=>Response.json({data:['a1b2c3','d4e5f6'].map(wallpaper)})});
assert.equal(exhausted,null,'only used source results must yield no repeat');
console.log('PASS: PC restart recovery preserves pack history, verifies legacy posts and prevents Wallhaven repeats');
