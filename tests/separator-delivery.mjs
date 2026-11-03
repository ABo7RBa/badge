// A separator is a standalone decoration after an accepted image post, never a
// second publication or part of previews/downloads. All HTTP/Discord is mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {generatedPair} from './fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-separator-delivery-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 const fixture=await generatedPair(43);
 await fs.writeFile(path.join(temp,'avatar.png'),fixture.avatar);
 await fs.writeFile(path.join(temp,'banner.png'),fixture.banner);
 await sharp(fixture.banner).resize(1920,1080).png().toFile(path.join(temp,'pc.png'));
 await fs.mkdir(path.join(temp,'media'));
 await sharp({create:{width:640,height:36,channels:4,background:'#175aef'}}).png().toFile(path.join(temp,'media','separator.png'));
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {MessageFlags} from 'discord.js';
import {post,handleInteraction} from './src/bot.js';
import {guild,makeRoom} from './src/db.js';
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png'),pc=await fs.readFile('pc.png');
const separator=await fs.readFile('media/separator.png');
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';process.env.SHOW_IMAGE_CREDITS='false';
process.env.FANART_MOVIE_IDS='tt1375666';delete process.env.POST_SEPARATOR_ENABLED;delete process.env.PHOTO_DISPLAY;
let requestGate=null;
function photo(id,label,landscape){return {id,width:landscape?2400:900,height:landscape?1350:1200,color:'#333333',alt_description:label,
 urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=original'},
 links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 user:{name:'Fixture Artist',links:{html:'https://unsplash.com/@fixture'}}};}
const wallhaven=(id,avatar=false,category='anime')=>({id,url:'https://wallhaven.cc/w/'+id,category,purity:'sfw',
 dimension_x:avatar?900:2560,dimension_y:avatar?1200:1440,path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',
 tags:[{name:category==='general'?'video games':'anime'}],thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}});
globalThis.fetch=async raw=>{
 const url=new URL(raw);
 if(requestGate){requestGate.reached();await requestGate.wait;}
 if(url.hostname==='api.unsplash.com'){
  if(url.pathname.endsWith('/download'))return Response.json({url:'https://images.unsplash.com/photo-original'});
  const landscape=url.searchParams.get('orientation')==='landscape',male=url.searchParams.get('query').startsWith('man ');
  return Response.json({total:1,total_pages:5,results:[photo(landscape?'scene0001':male?'male00001':'female001',
   landscape?'City street train station cloudy grass field at night':male?'Man in black hoodie from behind at night':'Woman portrait outdoors',landscape)]});
 }
 if(url.hostname==='images.unsplash.com')return new Response(url.pathname.includes('scene0001')?bn:av,{headers:{'content-type':'image/png'}});
 if(url.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Example Movie',
  movieposter:[{id:'111',url:'https://assets.fanart.tv/fanart/inception-52df821bd2a9f.jpg'}],
  moviebackground:[{id:'222',url:'https://assets.fanart.tv/fanart/inception-4fdb7d192f166.jpg'}]});
 if(url.hostname==='assets.fanart.tv')return new Response(url.pathname.includes('52df821bd2a9f')?av:bn,{headers:{'content-type':'image/png'}});
 if(url.hostname==='wallhaven.cc'){
  if(url.pathname==='/api/v1/w/p1c2g3')return Response.json({data:wallhaven('p1c2g3',false,'general')});
  if(url.searchParams.get('atleast')==='1920x1080')return Response.json({data:url.searchParams.get('q')==='anime'?[]:[wallhaven('p1c2g3',false,'general')]});
  const avatar=url.searchParams.get('atleast')==='600x600';
  return Response.json({data:[wallhaven(avatar?'a1b2c3':'d4e5f6',avatar)]});
 }
 if(url.hostname==='w.wallhaven.cc')return new Response(url.pathname.includes('p1c2g3')?pc:url.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 throw Error('Unexpected live network destination');
};
function destination(gid,category,{failMain=false,failSeparator=false,afterMain=null}={}){
 process.env.UNSPLASH_ACCESS_KEY='separator-photo-'+gid;process.env.FANART_API_KEY='separator-film-'+gid;
 const g=guild(gid),room=g.rooms.room=makeRoom(category),messages=[],attempts=[];
 const state={failMain,failSeparator,afterMain};
 const channel={guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async payload=>{
  const divider=payload.files?.[0]?.name?.startsWith('separator.');
  attempts.push(divider?'separator':'main');
  if(divider){
   assert.equal(room.count,1,'the accepted main post must be counted before separator send');
   const saved=JSON.parse(await fs.readFile('storage/state.json','utf8'));
   assert.equal(saved.guilds[gid].rooms.room.count,1,'main publication must be persisted before decoration');
   if(category==='movies')assert.equal(saved.guilds[gid].packs.find(p=>p.id===room.lastId)?.deliveryState,'published');
   if(state.failSeparator)throw Error('test separator upload denied');
  }else if(state.failMain)throw Error('test main upload denied');
  messages.push(payload);
  if(!divider&&state.afterMain)state.afterMain();
 }};
 const client={user:{id:'test-bot'},channels:{fetch:async()=>channel}};
 return {gid,g,room,messages,attempts,state,client};
}
function assertSeparator(payload){
 assert.equal(payload.files.length,1);assert.equal(payload.files[0].name,'separator.png');
 assert.deepEqual(payload.files[0].attachment,separator,'send the standalone original asset without cropping/re-encoding');
 assert.equal(payload.content||'','');assert.deepEqual(payload.embeds||[],[]);assert.deepEqual(payload.components||[],[]);
 assert.deepEqual(payload.allowedMentions,{parse:[]});
}
const categories=['anime','movies','girls','boys','pc_wallpapers'];
const published=[];
for(const category of categories){
 delete process.env.PHOTO_DISPLAY;
 const item=destination('success-'+category,category);
 const result=await post(item.client,item.gid,'room',{forced:true});
 assert.match(result,/نشرت|تم النشر/);assert.deepEqual(item.attempts,['main','separator']);assert.equal(item.messages.length,2);
 assert.equal(item.room.count,1);assert(item.room.lastId);assert.equal(item.room.error,null);
 assertSeparator(item.messages[1]);
 if(category==='pc_wallpapers')assert.deepEqual(item.g.packs,[]);
 else assert.equal(item.messages[0].files.length,1,'separator must not be combined with the main card attachments');
 assert.notEqual(item.messages[0].files[0].name,'separator.png');published.push(item);
}
// The optional source-hotlink route has its own post branch and needs decoration
// too, while its actual main image remains a source-hosted embed without files.
process.env.PHOTO_DISPLAY='source';
const source=destination('success-source-view','boys');
assert.match(await post(source.client,source.gid,'room',{forced:true}),/تم النشر/);
assert.deepEqual(source.attempts,['main','separator']);assert(!source.messages[0].files);
assert(source.messages[0].embeds[0].toJSON().image.url.startsWith('https://images.unsplash.com/'));
assertSeparator(source.messages[1]);published.push(source);delete process.env.PHOTO_DISPLAY;

// Failed main sends cannot leave a separator in the channel.
for(const category of categories){
 const item=destination('main-failure-'+category,category,{failMain:true});
 assert.match(await post(item.client,item.gid,'room',{forced:true}),/test main upload denied/);
 assert.deepEqual(item.attempts,['main']);assert.equal(item.messages.length,0);assert.equal(item.room.count,0);
}
// A decorative failure is swallowed after the main post/history are committed.
// A subsequent forced attempt must not repeat the accepted source image.
for(const category of categories){
 const item=destination('separator-failure-'+category,category,{failSeparator:true});
 const result=await post(item.client,item.gid,'room',{forced:true});
 assert.match(result,/نشرت|تم النشر/);assert.deepEqual(item.attempts,['main','separator']);assert.equal(item.messages.length,1);
 assert.equal(item.room.count,1);assert.equal(item.room.error,null);assert(item.room.nextAt>Date.now()+35*60000);
 if(category==='movies')assert.equal(item.g.packs.find(p=>p.id===item.room.lastId)?.deliveryState,'published');
 await post(item.client,item.gid,'room',{forced:true});
 assert.equal(item.attempts.filter(kind=>kind==='main').length,1,'separator failure must never trigger another copy of an accepted image');
 assert.equal(item.attempts.filter(kind=>kind==='separator').length,1);assert.equal(item.room.count,1);
}
// A room changed while the source request is pending has no accepted main or
// separator. A pause immediately after an accepted main suppresses only its
// decoration, retaining the main post and its saved history.
const cancel=destination('cancel-before-main','movies');let release,reached;
const ready=new Promise(resolve=>{reached=resolve;}),wait=new Promise(resolve=>{release=resolve;});
requestGate={reached,wait};const pending=post(cancel.client,cancel.gid,'room');await ready;
cancel.room.enabled=false;cancel.room.revision++;release();
assert.match(await pending,/أُلغي/);requestGate=null;assert.deepEqual(cancel.attempts,[]);assert.equal(cancel.room.count,0);
const paused=destination('pause-after-main','anime');paused.state.afterMain=()=>{paused.room.enabled=false;paused.room.revision++;};
assert.match(await post(paused.client,paused.gid,'room'),/تم النشر/);
assert.deepEqual(paused.attempts,['main']);assert.equal(paused.room.count,1);assert.equal(paused.messages.length,1);

function interaction(kind,gid,extra={}){
 const i={guildId:gid,channelId:'room',deferred:false,replied:false,memberPermissions:{has:()=>true},events:[],response:null,
  options:{getChannel:()=>null,getString:()=>null,getInteger:()=>null},
  isAutocomplete:()=>false,isChatInputCommand:()=>kind==='command',isStringSelectMenu:()=>false,isChannelSelectMenu:()=>false,isButton:()=>kind==='button',isModalSubmit:()=>false,
  async deferReply(payload){assert.equal(payload.flags,MessageFlags.Ephemeral);this.deferred=true;this.events.push('deferReply');},
  async reply(payload){this.replied=true;this.response=payload;},async editReply(payload){this.response=payload;},...extra};
 return i;
}
// Private image previews and downloads must not post a separator publicly.
for(const item of published){
 process.env.PHOTO_DISPLAY=item===source?'source':'card';
 const before=item.messages.length;
 const button=item.messages[0].components[0].toJSON().components.find(b=>b.custom_id?.startsWith('sas:download:'));
 const download=interaction('button',item.gid,{customId:button.custom_id});
 await handleInteraction(download,item.client);
 assert(download.response);assert.equal(item.messages.length,before);assert.equal(item.attempts.length,2);
 if(item!==source)assert.equal(download.response.files.length,1);
 const preview=destination('private-preview-'+item.gid,item.room.category);
 const command=interaction('command',preview.gid,{commandName:'معاينة',options:{getChannel:()=>null,getString:()=>item.room.category}});
 await handleInteraction(command,preview.client);
 assert(command.response);assert.deepEqual(preview.attempts,[]);assert.equal(preview.room.count,0);
 if(item!==source)assert.equal(command.response.files.length,1,'successful private preview remains just its main image');
}
delete process.env.PHOTO_DISPLAY;
// Existing installations with no asset (or an explicit opt-out) keep their
// previous one-message publishing behavior across every feed.
await fs.rename('media/separator.png','media/held-separator.png');
for(const category of categories){
 const item=destination('missing-asset-'+category,category);
 assert.match(await post(item.client,item.gid,'room',{forced:true}),/نشرت|تم النشر/);
 assert.deepEqual(item.attempts,['main']);assert.equal(item.room.count,1);
}
await fs.writeFile('media/separator.png',separator);process.env.POST_SEPARATOR_ENABLED='false';
for(const category of categories){
 const item=destination('disabled-separator-'+category,category);
 assert.match(await post(item.client,item.gid,'room',{forced:true}),/نشرت|تم النشر/);
 assert.deepEqual(item.attempts,['main']);assert.equal(item.room.count,1);
}
console.log('PASS: five-feed image→separator ordering, exact standalone asset, no private/failed/canceled decoration, safe decoration failure and missing/disabled compatibility');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(temp,{recursive:true,force:true});}
