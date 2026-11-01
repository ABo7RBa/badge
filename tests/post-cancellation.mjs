import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-cancel-'));
try{
 await fs.cp(path.join(root,'src'),path.join(tmp,'src'),{recursive:true});
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 await fs.symlink(path.join(root,'assets'),path.join(tmp,'assets'),'dir');
 const result=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import {post} from './src/bot.js';
import {guild,packs,makeRoom} from './src/db.js';
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
const photo=(id,banner=false)=>({id,width:banner?2400:900,height:banner?1350:1200,color:'#30343a',
 alt_description:banner?'City street landscape':'Woman portrait outdoors',
 urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=original'},
 links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 user:{name:'Test Artist',links:{html:'https://unsplash.com/@testartist'}}});
let number=0;
for(const stage of ['search','download'])for(const action of ['pause','unbind','rebind','stop-start']){
 const gid='cancel-'+number++,g=guild(gid),cid='room';
 process.env.UNSPLASH_ACCESS_KEY='test-'+gid;
 const room=g.rooms[cid]=makeRoom('girls');room.usedIds=packs(gid,'girls').map(p=>p.id);
 const originalUsed=[...room.usedIds];let reached,release;
 const ready=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 globalThis.fetch=async raw=>{
  const u=new URL(raw),search=u.pathname==='/search/photos';
  if(u.hostname!=='api.unsplash.com')throw Error('Unexpected network');
  if((stage==='search'&&search)||(stage==='download'&&!search)){reached();await gate;}
  return Response.json(search?{results:[photo(u.searchParams.get('orientation')==='landscape'?'banner01':'avatar01',u.searchParams.get('orientation')==='landscape')]}:{url:'https://images.unsplash.com/photo-unused'});
 };
 const messages=[];const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,
  permissionsFor:()=>({has:()=>true}),send:async payload=>messages.push(payload)})}};
 const pending=post(client,gid,cid);await ready;
 if(action==='pause'){room.enabled=false;room.revision++;}
 if(action==='unbind')delete g.rooms[cid];
 if(action==='rebind')g.rooms[cid]=makeRoom('anime');
 if(action==='stop-start'){room.enabled=false;room.revision++;room.enabled=true;room.revision++;}
 const current=g.rooms[cid],nextAt=current?.nextAt;
 release();assert.match(await pending,/أُلغي/);
 assert.equal(messages.length,0,stage+' '+action);assert.equal(room.count,0);
 assert.deepEqual(room.usedIds,originalUsed);assert.equal(room.error,null);
 if(current){assert.equal(current.nextAt,nextAt);assert.equal(current.count,0);}
}
// Wallhaven uses its own awaited search path, which must respect a paused room too.
const gid='cancel-wallhaven',g=guild(gid),room=g.rooms.room=makeRoom('anime');
let reached,release;const ready=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});
globalThis.fetch=async()=>{reached();await gate;return Response.json({data:[{id:'a1b2c3',url:'https://wallhaven.cc/w/a1b2c3',category:'anime',purity:'sfw',dimension_x:2560,dimension_y:1440,thumbs:{large:'https://th.wallhaven.cc/lg/a1/a1b2c3.jpg'}}]});};
const messages=[];const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async p=>messages.push(p)})}};
const pending=post(client,gid,'room');await ready;room.enabled=false;room.revision++;release();
assert.match(await pending,/أُلغي/);assert.equal(messages.length,0);assert.equal(room.count,0);
console.log('PASS: pause, unbind, rebind and stop/start cancel in-flight Unsplash and Wallhaven publishing without changing saved schedule/history');
`});
 assert(result.includes('PASS:'));process.stdout.write(result);
}finally{await fs.rm(tmp,{recursive:true,force:true});}
