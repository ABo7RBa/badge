// Actual automatic timer callbacks must never fall back to saved image packs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-source-only-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 await fs.symlink(path.join(root,'assets'),path.join(temp,'assets'),'dir');
 for(const [kind,width,height,shape] of [['avatar',800,1000,'<circle cx="220" cy="350" r="180" fill="#281d3b"/>'],['banner',1600,900,'<path d="M0 850 L700 80 L1600 850 Z" fill="#392d45"/>']]){
  await sharp({create:{width,height,channels:3,background:'#81708e'}}).composite([{input:Buffer.from('<svg width="'+width+'" height="'+height+'">'+shape+'</svg>')}]).png().toFile(path.join(temp,kind+'.png'));
 }
 const result=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startAutomation,importImages,post} from './src/bot.js';
import {guild,packs,makeRoom,addPack} from './src/db.js';
delete process.env.SOURCE_ONLY; // Strict sources must be the default for existing .env files too.
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
process.env.FANART_API_KEY='test';process.env.FANART_MOVIE_IDS='tt1375666';
const seed=JSON.parse(await fs.readFile('assets/seed.json','utf8')).find(p=>p.category==='boys');
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png');
let mode='good',phase='fresh',requests=[];
globalThis.fetch=async raw=>{
 const u=new URL(raw);requests.push(u);
 if(mode==='fail')return Response.json({}, {status:503});
 if(u.hostname==='api.unsplash.com'){
  if(u.pathname.endsWith('/download'))return Response.json({url:'https://images.unsplash.com/photo-unused'});
  if(mode==='empty')return Response.json({total:0,total_pages:0,results:[]});
  const banner=u.searchParams.get('orientation')==='landscape',male=u.searchParams.get('query').startsWith('man ');
  const id=phase+(banner?'scene001':male?'male0001':'female01');
  const label=banner?'City street train station cloudy grass field at night':male?'Man in black hoodie from behind at night':'Woman portrait outdoors';
  return Response.json({total:1,total_pages:5,results:[{id,width:banner?2400:900,height:banner?1350:1200,color:'#333333',alt_description:label,
   urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=retained'},links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
   user:{name:'Source Test',links:{html:'https://unsplash.com/@sourcetest'}}}]});
 }
 if(u.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Inception',movieposter:mode==='empty'?[]:[{id:'1',url:'https://assets.fanart.tv/fanart/movies/1/poster.png'}],moviebackground:mode==='empty'?[]:[{id:'2',url:'https://assets.fanart.tv/fanart/movies/1/banner.png'}]});
 if(u.hostname==='assets.fanart.tv')return new Response(u.pathname.endsWith('poster.png')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='w.wallhaven.cc')return new Response(u.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='wallhaven.cc'){
  const anime=u.searchParams.get('categories')==='010',avatar=anime&&u.searchParams.get('q').includes('portrait');
  const id=avatar?'a1b2c3':'d4e5f6';
  return Response.json({data:mode==='empty'?[]:[{id,url:'https://wallhaven.cc/w/'+id,category:anime?'anime':'general',purity:'sfw',dimension_x:avatar?900:2560,dimension_y:avatar?1200:1440,path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}}]});
 }
 throw Error('Unexpected network');
};
for(const category of ['girls','boys','movies','anime','pc_wallpapers'])for(const outcome of ['good','fail','empty']){
 const gid=category+'-'+outcome,g=guild(gid),room=g.rooms.room=makeRoom(category);
 if(['girls','boys','movies'].includes(category))addPack(gid,{...seed,id:'old-manual',category,bundled:false,importedAutomatically:false,photoVerified:true,categoryVerified:true,filmVerified:category==='movies',verificationSource:category==='movies'?'manual':'moderator-photo'});
 assert(packs(gid,category).length>0,'test must have an unused local library image to tempt fallback');
 // Pre-existing source records must also be ignored in strict mode.
 if(['girls','boys'].includes(category)){
  phase='stored';mode='good';process.env.UNSPLASH_ACCESS_KEY='stored-'+gid;
  await importImages(gid,category,true);assert(g.packs.some(p=>p.remote));
 }
 phase='fresh';mode=outcome;process.env.UNSPLASH_ACCESS_KEY='fresh-'+gid;
 delete g.fetchStatus?.[category];g.fetchAt[category]=0;
 const messages=[];requests=[];const tasks=[];
 const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async p=>messages.push(p)})}};
 const timers={setInterval:(callback,ms)=>{tasks.push({callback,ms});return tasks.length;},setTimeout:(callback,ms)=>{tasks.push({callback,ms});return tasks.length;},clearInterval(){},clearTimeout(){}};
 const automation=await startAutomation(client,{timers});
 assert(!tasks.some(t=>t.ms===300000),'strict mode must not prefetch unused library packs');
 await tasks.find(t=>t.ms===5000).callback();automation.stop();room.enabled=false;
 assert(requests.length>0,'publishing must consult the provider even when local images are available');
 if(outcome==='good'){
  assert.equal(messages.length,1,room.error);assert.equal(room.count,1);
  if(['girls','boys'].includes(category))assert(messages[0].embeds[0].toJSON().image.url.includes('fresh'));
  if(category==='movies'){assert(requests.some(u=>u.hostname==='assets.fanart.tv'));assert.notEqual(room.lastId,'old-manual');}
  if(category==='pc_wallpapers')assert(messages[0].embeds[0].toJSON().url.includes('wallhaven.cc'));
  if(category==='anime'){assert(messages[0].files[0].attachment.length>1000);assert(messages[0].embeds[0].toJSON().description.includes('مصدر البنر'));assert.equal(requests.filter(u=>u.hostname==='w.wallhaven.cc').length,2);}
 }else{assert.equal(messages.length,0,'never send local/source-library fallback on '+category+' '+outcome);assert.equal(room.count,0);assert(room.error);}
}
// Disabling a required source must not silently enable local publishing.
process.env.AUTO_FETCH='false';const g=guild('disabled-source');g.rooms.room=makeRoom('girls');
let sends=0;const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:'disabled-source',isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>sends++})}};
await post(client,'disabled-source','room');assert.equal(sends,0);assert.match(g.rooms.room.error,/AUTO_FETCH/);
console.log('PASS: all five default automatic source-only routes ignore bundled, manual and stored source images, and never fall back on API failure/empty/disabled sources');
`});
 assert(result.includes('PASS:'));process.stdout.write(result);
}finally{await fs.rm(temp,{recursive:true,force:true});}
