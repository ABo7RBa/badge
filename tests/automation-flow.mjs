// Exercise the registered automatic timers, real image pipeline and local state.
// Providers and Discord are mocked; user storage and live services are untouched.
import assert from 'node:assert/strict';
process.env.SOURCE_ONLY='false';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-automation-'));
try {
 await fs.cp(path.join(root,'src'),path.join(tmp,'src'),{recursive:true});
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 // Independently seeded tiles give each pair distinct fingerprints and similar
 // low-light palettes, so the real quality and deduplication checks still run.
 for(let variant=0;variant<8;variant++)for(const kind of ['avatar','banner']){
  const width=kind==='avatar'?800:1600,height=kind==='avatar'?1000:900;
  let seed=variant*653+(kind==='avatar'?1291:7817);const tiles=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   seed=(seed*16807)%2147483647;const value=24+(seed%90);
   tiles.push('<rect x="'+x*width/8+'" y="'+y*height/8+'" width="'+width/8+'" height="'+height/8+'" fill="rgb('+value+','+(value+6)+','+(value+14)+')"/>');
  }
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'">'+tiles.join('')+'</svg>';
  await sharp(Buffer.from(svg)).png().toFile(path.join(tmp,kind+'-'+variant+'.png'));
 }
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startAutomation} from './src/bot.js';
import {guild,packs,makeRoom,store} from './src/db.js';
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
process.env.UNSPLASH_ACCESS_KEY='test-key';process.env.FANART_API_KEY='test-key';
process.env.FANART_MOVIE_IDS='tt1375666';
const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
let generation=0;const fixtures={};
for(let n=0;n<8;n++)for(const kind of ['avatar','banner'])fixtures[kind+'-'+n]=await fs.readFile(kind+'-'+n+'.png');
const apiCalls=[];
globalThis.fetch=async(raw,opts)=>{
 const u=new URL(raw);apiCalls.push(u);
 if(u.hostname==='api.unsplash.com'){
  assert.equal(opts.headers.Authorization,'Client-ID test-key');assert.equal(opts.redirect,'error');
  if(u.pathname.endsWith('/download'))return Response.json({url:'https://images.unsplash.com/download'});
  assert.equal(u.pathname,'/search/photos');assert.equal(u.searchParams.get('content_filter'),'high');
  const query=u.searchParams.get('query'),landscape=u.searchParams.get('orientation')==='landscape';
  const boys=landscape?/train|architecture|grass field|motel|city street|city night/.test(query):query.startsWith('man ');
  const id=(boys?'boys':'girls')+String(generation).padStart(3,'0')+(landscape?'bn':'av');
  const label=landscape?'City street train station and cloudy grass field in black and white at night':boys?'Man in black hoodie from behind on a city street at night':'Woman portrait outdoors';
  return Response.json({total:1,total_pages:5,results:[{id,width:landscape?1600:800,height:landscape?900:1000,
   alt_description:label,description:label,color:'#333333',tags:label.split(',').map(title=>({title:title.trim()})),
   user:{name:'Automation Test Artist',links:{html:'https://unsplash.com/@automationartist'}},
   links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download?ixid=original-'+id},
   urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=original-'+id+'&w=1080'}}]});
 }
 if(u.hostname==='images.unsplash.com'){
  assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.redirect,'error');assert(u.searchParams.get('ixid'));
  const kind=u.pathname.endsWith('av')?'avatar':'banner',match=u.pathname.match(/([0-9]{3})(?:av|bn)$/);
  return new Response(fixtures[kind+'-'+Number(match[1])],{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Inception',
  movieposter:[{id:'51',url:'https://assets.fanart.tv/fanart/movies/27205/poster.png'}],
  moviebackground:[{id:'52',url:'https://assets.fanart.tv/fanart/movies/27205/background.png'}]});
 if(u.hostname==='assets.fanart.tv')return new Response(fixtures[(u.pathname.endsWith('poster.png')?'avatar':'banner')+'-3'],{headers:{'content-type':'image/png'}});
 if(u.hostname==='w.wallhaven.cc')return new Response(fixtures[(u.pathname.includes('a1b2c3')?'avatar':'banner')+'-1'],{headers:{'content-type':'image/png'}});
 if(u.hostname==='wallhaven.cc'){
  const anime=u.searchParams.get('categories')==='010',avatar=anime&&u.searchParams.get('atleast')==='600x600';
  const id=avatar?'a1b2c3':'d4e5f6';
  return Response.json({data:[{id,url:'https://wallhaven.cc/w/'+id,
   category:anime?'anime':'general',purity:'sfw',dimension_x:avatar?800:2560,dimension_y:avatar?1000:1440,
   path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',
   thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}}]});
 }
 throw Error('Unexpected live network destination: '+u.hostname);
};

const order=[],captured=[],cleared=[],channels=new Map(),messages=[],attempts=new Map();
let handle=0;
const timers={
 setInterval(callback,ms){order.push('timer');captured.push({kind:'interval',callback,ms,id:++handle});return handle;},
 setTimeout(callback,ms){order.push('timer');captured.push({kind:'timeout',callback,ms,id:++handle});return handle;},
 clearInterval(id){cleared.push(id);},clearTimeout(id){cleared.push(id);}
};
const client={user:{id:'test-bot'},channels:{fetch:async cid=>channels.get(cid)}};
function addRoom(gid,category,{enabled=true,future=false,fail=false,sendGate=null,permissions=true}={}){
 const cid=gid+'-room',g=guild(gid),room=g.rooms[cid]=makeRoom(category,40,now);
 room.enabled=enabled;if(future)room.nextAt=now+60*60*1000;
 // Demand fetch is tested even for categories that have bundled starter packs.
 room.usedIds=packs(gid,category).map(p=>p.id);
 const channel={guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>permissions}),
  messages:{fetch:async()=>{order.push('history:'+cid);return new Map();}},
  send:async payload=>{
   attempts.set(cid,(attempts.get(cid)||0)+1);
   if(['girls','boys'].includes(category)){
    const record=g.packs.find(p=>p.id===g.fetchStatus[category].recordId);
    for(const download of record.downloadLocations){
     const endpoint=new URL(download);
     assert(apiCalls.some(url=>url.hostname==='api.unsplash.com'&&url.pathname===endpoint.pathname),'selected photo tracked before send');
    }
   }
   if(fail)throw Error('test send denied');
   if(sendGate)await sendGate();
   messages.push({gid,cid,payload});
  }};
 channels.set(cid,channel);return {gid,cid,g,room,channel};
}
const active=Object.fromEntries(['girls','boys','movies','anime','pc_wallpapers'].map(category=>[category,addRoom('automatic-'+category,category)]));
const paused=addRoom('paused','boys',{enabled:false}),future=addRoom('future','boys',{future:true});
const automation=await startAutomation(client,{timers});
assert.equal(order.filter(x=>x.startsWith('history:')).length,7);
assert.equal(order.slice(0,7).every(x=>x.startsWith('history:')),true,'history must finish before timers register');
const initial=captured.find(x=>x.kind==='timeout'&&x.ms===5000)?.callback;
const tick=captured.find(x=>x.kind==='interval'&&x.ms===20000)?.callback;
const prefetch=captured.find(x=>x.kind==='interval'&&x.ms===300000)?.callback;
assert(initial&&tick&&!prefetch,'only publication timers register; no library prefetch');

// No manual importImages/post calls: invoke only callbacks registered by startup.
await initial();
for(const [category,item] of Object.entries(active)){
 const sent=messages.filter(x=>x.cid===item.cid);assert.equal(sent.length,1,category+': '+item.room.error);
 assert.equal(item.room.count,1);assert(item.room.nextAt>now);
 const embed=sent[0].payload.embeds[0].toJSON();
 for(const field of ['title','description','footer'])assert.equal(embed[field],undefined,'automatic posts have no visible captions');
 if(category==='pc_wallpapers'){
  assert.equal(embed.url,undefined);assert(embed.image.url.includes('th.wallhaven.cc'));
  assert.equal(item.room.wallhavenUsedIds.length,1);
 }else if(category==='movies'||category==='anime'){
  assert(sent[0].payload.files[0].attachment.length>1000);assert.equal(embed.description,undefined);
  assert.equal(item.g.fetchStatus[category].state,'success');
 }else{
  assert.equal(sent[0].payload.files.length,1,'Unsplash pairs use the same full card as anime');
  const info=await (await import('sharp')).default(sent[0].payload.files[0].attachment).metadata();
  assert.equal(info.format,'png');assert.equal(info.width,1080);assert.equal(info.height,700);
  assert(embed.image.url.startsWith('attachment://'));assert.equal(embed.thumbnail,undefined);
  assert.equal(embed.description,undefined);assert.equal(embed.title,undefined);
  assert.equal(item.g.packs[0].credits.avatar.name,'Automation Test Artist');
  assert.equal(item.g.fetchStatus[category].state,'success');
 }
}
assert.equal(messages.some(x=>x.cid===paused.cid||x.cid===future.cid),false);
assert(apiCalls.some(x=>x.hostname==='api.unsplash.com'&&x.pathname==='/search/photos'));
assert.equal(apiCalls.filter(x=>x.hostname==='api.unsplash.com'&&x.pathname.endsWith('/download')).length,4,'only selected girls/boys photos are tracked');
assert.equal(apiCalls.filter(x=>x.hostname==='images.unsplash.com').length,4,'selected card images are downloaded only for their renders');
assert(apiCalls.some(x=>x.hostname==='webservice.fanart.tv'));
assert(apiCalls.some(x=>x.hostname==='wallhaven.cc'));
const deliveredAtFirstTick=messages.length,callsAtFirstTick=apiCalls.length;
await tick();assert.equal(messages.length,deliveredAtFirstTick);assert.equal(apiCalls.length,callsAtFirstTick);

// A 40-minute publication must not be starved by the 80-minute prefetch cooldown.
for(const [category,item] of Object.entries(active))if(category!=='boys')item.room.enabled=false;
generation=1;now=active.boys.room.nextAt;
await tick();
assert.equal(messages.filter(x=>x.cid===active.boys.cid).length,2,active.boys.room.error);
assert.equal(active.boys.room.count,2);assert.equal(new Set(active.boys.room.usedIds).size,2);
assert.equal(active.boys.g.packs.length,2,'a genuinely new pair must be imported on demand');
active.boys.room.enabled=false;

// Missing credentials remain visible and retry after a meaningful state change.
const missing=addRoom('missing-key','boys');delete process.env.UNSPLASH_ACCESS_KEY;
await tick();
assert.equal(messages.some(x=>x.cid===missing.cid),false);assert.equal(missing.room.count,0);
assert.match(missing.room.error,/UNSPLASH_ACCESS_KEY/);assert.equal(missing.g.fetchStatus.boys.state,'error');
assert(missing.g.fetchStatus.boys.retryAt>now);
process.env.UNSPLASH_ACCESS_KEY='test-key';
now=Math.max(now+1,missing.room.nextAt,missing.g.fetchStatus.boys.retryAt+1);
missing.g.fetchStatus.boys.retryAt=now-1;await tick();
assert.equal(messages.filter(x=>x.cid===missing.cid).length,1,missing.room.error);
assert.equal(missing.g.fetchStatus.boys.state,'success');missing.room.enabled=false;

// A rejected Discord send must not be marked published or consume its queue.
const failed=addRoom('send-failure','boys',{fail:true});generation=2;
await tick();
assert.equal(messages.some(x=>x.cid===failed.cid),false);assert.equal(failed.room.count,0);
assert.equal(failed.room.usedIds.length,0);assert.match(failed.room.error,/test send denied/);
assert.equal(failed.g.packs.length,0,'failed sends roll back the new remote record so its images remain eligible to retry');failed.room.enabled=false;

// Permission failures are diagnosed before any provider/download work is done.
const forbidden=addRoom('permission-failure','boys',{permissions:false});const beforePermissions=apiCalls.length;
await tick();assert.equal(forbidden.room.count,0);assert.match(forbidden.room.error,/Embed Links/);
assert.equal(apiCalls.length,beforePermissions);forbidden.room.enabled=false;

// Keep one send in flight, then fire a second scheduler callback concurrently.
let release,reached;
const gate=new Promise(resolve=>{release=resolve;}),reachedSend=new Promise(resolve=>{reached=resolve;});
const overlap=addRoom('overlap','boys',{sendGate:async()=>{reached();await gate;}});generation=3;
const first=tick();await reachedSend;
const second=tick();await second;
assert.equal(attempts.get(overlap.cid),1);release();await first;
assert.equal(messages.filter(x=>x.cid===overlap.cid).length,1);assert.equal(overlap.room.count,1);
overlap.room.enabled=false;

const lastMessageCount=messages.length,lastCallCount=apiCalls.length;
automation.stop();assert.equal(cleared.length,captured.length);
await initial();await tick();
assert.equal(messages.length,lastMessageCount);assert.equal(apiCalls.length,lastCallCount);
Date.now=originalNow;
console.log('PASS: automatic startup/timers fetch and publish five categories, respect schedule/pause, retry missing keys, preserve failed sends, prevent overlap, and prepare only stored-pair sources');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
} finally {await fs.rm(tmp,{recursive:true,force:true});}
