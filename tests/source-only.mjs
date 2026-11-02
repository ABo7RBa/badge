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
 for(const [kind,width,height,shape] of [['avatar',800,1000,'<circle cx="220" cy="350" r="180" fill="#281d3b"/>'],['banner',1600,900,'<path d="M0 850 L700 80 L1600 850 Z" fill="#392d45"/>']]){
  await sharp({create:{width,height,channels:3,background:'#81708e'}}).composite([{input:Buffer.from('<svg width="'+width+'" height="'+height+'">'+shape+'</svg>')}]).png().toFile(path.join(temp,kind+'.png'));
 }
 const result=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startAutomation,importImages,post} from './src/bot.js';
import {guild,packs,makeRoom,addPack} from './src/db.js';
process.env.SOURCE_ONLY='false'; // The removed legacy flag must never re-enable a library.
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
delete process.env.PHOTO_DISPLAY; // Default publication must be a fresh source-derived composite card.
process.env.FANART_API_KEY='test';process.env.FANART_MOVIE_IDS='tt1375666';
const seed={kind:'profile',avatar:'avatar.png',banner:'banner.png',reviewedWithV86:true,visualHash:'a'.repeat(64),bannerVisualHash:'b'.repeat(64),avatarDHash:'abcd',bannerDHash:'1234'};
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
 if(u.hostname==='images.unsplash.com'){
  assert.equal(u.searchParams.get('ixid'),'retained');
  if(mode==='image-fail')return new Response('unavailable',{status:503});
  return new Response(u.pathname.includes('scene001')?bn:av,{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Inception',movieposter:mode==='empty'?[]:[{id:'1',url:'https://assets.fanart.tv/fanart/movies/1/poster.png'}],moviebackground:mode==='empty'?[]:[{id:'2',url:'https://assets.fanart.tv/fanart/movies/1/banner.png'}]});
 if(u.hostname==='assets.fanart.tv')return new Response(u.pathname.endsWith('poster.png')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='w.wallhaven.cc')return new Response(u.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='wallhaven.cc'){
  const anime=u.searchParams.get('categories')==='010',avatar=anime&&u.searchParams.get('atleast')==='600x600';
  const id=avatar?'a1b2c3':'d4e5f6';
  return Response.json({data:mode==='empty'?[]:[{id,url:'https://wallhaven.cc/w/'+id,category:anime?'anime':'general',purity:'sfw',dimension_x:avatar?900:2560,dimension_y:avatar?1200:1440,path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}}]});
 }
 throw Error('Unexpected network');
};
for(const category of ['girls','boys','movies','anime','pc_wallpapers'])for(const outcome of ['good','fail','empty','image-fail']){
 if(outcome==='image-fail'&&!['girls','boys'].includes(category))continue;
 const gid=category+'-'+outcome,g=guild(gid),room=g.rooms.room=makeRoom(category);
 g.packs.push({...seed,id:'old-manual',category,bundled:false,importedAutomatically:false,photoVerified:true,categoryVerified:true,filmVerified:category==='movies',verificationSource:category==='movies'?'manual':'moderator-photo'});
 assert(g.packs.some(p=>p.id==='old-manual'),'legacy saved photo must tempt fallback');
 // Pre-existing source records must also be ignored in strict mode.
 if(['girls','boys'].includes(category)){
  phase='stored';mode='good';process.env.UNSPLASH_ACCESS_KEY='stored-'+gid;
  await importImages(gid,category,true);assert(g.packs.some(p=>p.remote));
 }
 phase='fresh';mode=outcome;process.env.UNSPLASH_ACCESS_KEY='fresh-'+gid;
 delete g.fetchStatus?.[category];g.fetchAt[category]=0;
 const recordsBefore=g.packs.map(record=>record.id),usedBefore=[...room.usedIds];
 const messages=[];requests=[];const tasks=[];
 const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async p=>messages.push(p)})}};
 const timers={setInterval:(callback,ms)=>{tasks.push({callback,ms});return tasks.length;},setTimeout:(callback,ms)=>{tasks.push({callback,ms});return tasks.length;},clearInterval(){},clearTimeout(){}};
 const automation=await startAutomation(client,{timers});
 assert(!tasks.some(t=>t.ms===300000),'strict mode must not prefetch unused library packs');
 await tasks.find(t=>t.ms===5000).callback();automation.stop();room.enabled=false;
 assert(requests.length>0,'publishing must consult the provider even when local images are available');
 if(outcome==='good'){
  assert.equal(messages.length,1,room.error);assert.equal(room.count,1);
  if(['girls','boys'].includes(category)){
   assert.equal(messages[0].files.length,1);assert(messages[0].files[0].attachment.length>1000);
   const info=await (await import('sharp')).default(messages[0].files[0].attachment).metadata();
   assert.equal(info.format,'png');assert.equal(info.width,1080);assert.equal(info.height,700);
   const embed=messages[0].embeds[0].toJSON();assert(embed.image.url.startsWith('attachment://'));
   assert.equal(embed.thumbnail,undefined);assert.equal(embed.description,undefined);
   const fetchedImages=requests.filter(u=>u.hostname==='images.unsplash.com');
   assert.equal(fetchedImages.length,2);assert(fetchedImages.every(u=>u.pathname.includes('fresh')),'old saved source pairs cannot supply the card');
   assert.equal(requests.filter(u=>u.hostname==='api.unsplash.com'&&u.pathname.endsWith('/download')).length,2);
   assert.deepEqual(await fs.readdir('storage/packs/'+gid).catch(error=>{if(error.code==='ENOENT')return [];throw error;}),[]);
  }
  if(category==='movies'){assert(requests.some(u=>u.hostname==='assets.fanart.tv'));assert.notEqual(room.lastId,'old-manual');}
  if(category==='pc_wallpapers')assert(messages[0].embeds[0].toJSON().image.url.includes('th.wallhaven.cc'));
  if(category==='anime'){assert(messages[0].files[0].attachment.length>1000);assert.equal(messages[0].embeds[0].toJSON().description,undefined);assert.equal(requests.filter(u=>u.hostname==='w.wallhaven.cc').length,2);}
 }else{
  assert.equal(messages.length,0,'never send local/source-library fallback on '+category+' '+outcome);assert.equal(room.count,0);assert(room.error);
  if(outcome==='image-fail'){
   const failedImageURLs=requests.filter(url=>url.hostname==='images.unsplash.com').map(url=>url.toString());
   assert(failedImageURLs.length>0,'the failure must occur while retrieving the selected source images');
   assert.deepEqual(g.packs.map(record=>record.id),recordsBefore,'a failed fresh card must not consume source metadata; older records stay intact');
   assert.deepEqual(room.usedIds,usedBefore);assert.equal(room.lastId,null);
   // Recover the same CDN URLs in the same guild and catalogue. No alternate
   // photo, new credentials, cleared history or stored-image fallback is used.
   mode='good';requests=[];
   const recovered=await post(client,gid,'room',{forced:true});
   assert.equal(messages.length,1,recovered);assert.equal(room.count,1);assert.equal(room.error,null);
   const recoveryImageURLs=requests.filter(url=>url.hostname==='images.unsplash.com').map(url=>url.toString());
   assert.equal(recoveryImageURLs.length,2);
   assert(failedImageURLs.every(url=>recoveryImageURLs.includes(url)),'recovery must retrieve the same selected source pair');
   assert.equal(messages[0].files.length,1);
   const recoveredInfo=await (await import('sharp')).default(messages[0].files[0].attachment).metadata();
   assert.equal(recoveredInfo.format,'png');assert.equal(recoveredInfo.width,1080);assert.equal(recoveredInfo.height,700);
   const published=g.packs.find(record=>record.id===room.lastId);
   assert(published?.remote);assert(published.sourceIds.every(id=>id.includes('fresh')));
   assert.deepEqual(g.packs.filter(record=>recordsBefore.includes(record.id)).map(record=>record.id),recordsBefore,'older saved records survive both failure and recovery');
   assert.equal(g.packs.length,recordsBefore.length+1);assert.deepEqual(room.usedIds,[published.id]);
   assert.equal(room.enabled,false,'a forced retry must not change the paused room setting');
   assert.deepEqual(await fs.readdir('storage/packs/'+gid).catch(error=>{if(error.code==='ENOENT')return [];throw error;}),[]);
  }
 }
}
// Disabling a required source must not silently enable local publishing.
process.env.AUTO_FETCH='false';const g=guild('disabled-source');g.rooms.room=makeRoom('girls');
let sends=0;const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:'disabled-source',isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>sends++})}};
await post(client,'disabled-source','room');assert.equal(sends,0);assert.match(g.rooms.room.error,/AUTO_FETCH/);
console.log('PASS: fresh Unsplash cards, same-pair CDN recovery and all five default automatic source-only routes ignore bundled, manual and stored source images, and never fall back on API failure/empty/disabled sources');
`});
 assert(result.includes('PASS:'));process.stdout.write(result);
}finally{await fs.rm(temp,{recursive:true,force:true});}
