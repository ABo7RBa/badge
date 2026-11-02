// PC wallpapers must be real, downloadable original images from fresh source
// requests. Provider and Discord transport are mocked; bytes/state are real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {generatedPair} from './fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-pc-delivery-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 const fixture=await generatedPair(41);
 const original=await sharp(fixture.banner).resize(1920,1080).jpeg({quality:93}).toBuffer();
 await fs.writeFile(path.join(temp,'original.jpg'),original);
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Client,MessagePayload,PermissionsBitField,PermissionFlagsBits,ButtonStyle,MessageFlags} from 'discord.js';
import {post,handleInteraction} from './src/bot.js';
import {guild,makeRoom} from './src/db.js';
process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
process.env.SHOW_IMAGE_CREDITS='true';delete process.env.WALLHAVEN_API_KEY;
const original=await fs.readFile('original.jpg');
const gameId='a1b2c3',animeId='d4e5f6';
let mode='game',unsafeDetails=false,imageGate=null;
const requests=[];
const metadata=id=>({id,url:'https://wallhaven.cc/w/'+id,purity:unsafeDetails?'nsfw':'sfw',
 category:id===animeId?'anime':'general',dimension_x:1920,dimension_y:1080,resolution:'1920x1080',ratio:'1.78',
 file_size:original.length,file_type:'image/jpeg',
 path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',
 tags:[{name:id===animeId?'anime':'video games'}],
 thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}});
globalThis.fetch=async(raw,options={})=>{
 const url=new URL(raw);requests.push(url);
 if(url.hostname==='wallhaven.cc'&&url.pathname==='/api/v1/search'){
  if(mode==='api-error')return Response.json({}, {status:503});
  const anime=url.searchParams.get('categories')==='010';
  const matches=mode==='anime'?anime:mode==='game'?!anime:false;
  return Response.json({data:matches?[metadata(mode==='anime'?animeId:gameId)]:[]});
 }
 if(url.hostname==='wallhaven.cc'&&url.pathname.startsWith('/api/v1/w/')&&/^[a-z0-9]{6}$/.test(url.pathname.split('/').at(-1))){
  if(mode==='api-error')return Response.json({}, {status:503});
  return Response.json({data:metadata(url.pathname.split('/').at(-1))});
 }
 if(url.hostname==='w.wallhaven.cc'){
  assert.equal(options.redirect,'error');assert(options.signal);
  assert.equal(options.headers?.Authorization,undefined);assert.equal(options.headers?.authorization,undefined);
  if(imageGate){imageGate.reached();await imageGate.wait;}
  if(mode==='image-error')return new Response('not available',{status:503});
  return new Response(original,{headers:{'content-type':'image/jpeg','content-length':String(original.length)}});
 }
 throw Error('Unexpected live network destination');
};
function destination(gid,{fail=false,attach=true}={}){
 const g=guild(gid),room=g.rooms.room=makeRoom('pc_wallpapers'),messages=[];
 const state={fail,attach,attempts:0};
 const has=flag=>flag!==PermissionFlagsBits.AttachFiles||state.attach;
 const channel={guildId:gid,isTextBased:()=>true,
  permissionsFor:()=>({has:flags=>Array.isArray(flags)?flags.every(has):has(flags)}),
  send:async payload=>{state.attempts++;if(state.fail)throw Error('test PC send denied');messages.push(payload);}};
 const client={user:{id:'test-bot'},channels:{fetch:async()=>channel}};
 return {gid,g,room,state,channel,client,messages};
}
function assertOriginalPost(message){
 assert.equal(message.content||'','');assert.equal(message.files.length,1);
 assert.deepEqual(message.files[0].attachment,original,'the source original must not become a preview or cropped profile card');
 const embed=message.embeds[0].toJSON();
 assert.equal(embed.image.url,'attachment://'+message.files[0].name);
 for(const field of ['title','description','url','thumbnail','footer'])assert.equal(embed[field],undefined,'PC images have no page/source caption');
 const buttons=message.components[0].toJSON().components;
 assert.equal(buttons.length,2);assert(buttons.every(button=>button.style===ButtonStyle.Secondary));
 assert(buttons[0].custom_id.startsWith('sas:download:wh_'));assert(buttons[1].custom_id.startsWith('sas:delete:wh_'));
 assert(buttons.every(button=>button.style!==ButtonStyle.Link&&!button.url),'there must be no external page-link button');
}

// A failed Discord upload does not consume the wallpaper. Retry requests the
// same source again and can publish the identical original once, then dedupes.
const retry=destination('pc-retry',{fail:true});
assert.match(await post(retry.client,retry.gid,'room',{forced:true}),/test PC send denied/);
assert.equal(retry.messages.length,0);assert.equal(retry.room.count,0);
assert.deepEqual(retry.room.wallhavenUsedIds||[],[]);assert.deepEqual(retry.g.packs,[]);
retry.state.fail=false;const beforeRetry=requests.length;
assert.match(await post(retry.client,retry.gid,'room',{forced:true}),/نشرت|تم النشر/);
assert(requests.length>beforeRetry,'retry must contact the source rather than reuse image bytes');
assert.equal(retry.messages.length,1);assert.equal(retry.room.count,1);assertOriginalPost(retry.messages[0]);
assert.deepEqual(retry.room.wallhavenUsedIds,['wallhaven:'+gameId]);assert.deepEqual(retry.g.packs,[]);
await post(retry.client,retry.gid,'room',{forced:true});
assert.equal(retry.messages.length,1,'used wallpapers are not recycled');

// Saved download-button history must prevent repeats even before startup can
// read Discord history (or when that history is unavailable).
for(const history of [{usedIds:['wh_'+gameId],lastId:null},{usedIds:[],lastId:'wh_'+gameId}]){
 const legacy=destination('pc-legacy-'+(history.lastId?'last':'used'));
 legacy.room.usedIds=history.usedIds;legacy.room.lastId=history.lastId;
 const originalRequests=requests.filter(url=>url.hostname==='w.wallhaven.cc').length;
 await post(legacy.client,legacy.gid,'room',{forced:true});
 assert.equal(legacy.messages.length,0);assert.equal(legacy.room.count,0);
 assert.equal(requests.filter(url=>url.hostname==='w.wallhaven.cc').length,originalRequests,'legacy used wallpaper must not be redownloaded for publication');
 assert.deepEqual(legacy.g.packs,[]);
}

// Missing attachment permission is diagnosed before any provider work.
const denied=destination('pc-no-attachment',{attach:false}),beforePermission=requests.length;
assert.match(await post(denied.client,denied.gid,'room',{forced:true}),/Attach Files/);
assert.equal(requests.length,beforePermission);assert.equal(denied.messages.length,0);assert.equal(denied.room.count,0);

// Anime is also an allowed PC wallpaper bucket, and is delivered as an original.
mode='anime';const anime=destination('pc-anime');
assert.match(await post(anime.client,anime.gid,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(anime.messages.length,1);assertOriginalPost(anime.messages[0]);
assert.deepEqual(anime.room.wallhavenUsedIds,['wallhaven:'+animeId]);assert.deepEqual(anime.g.packs,[]);
mode='game';

// Exercise real Discord.js serialization of private commands and the download
// button. Each route must return one original attachment, not a URL or gallery.
const serializationClient=new Client({intents:[]});
function interaction(kind,gid,extra={}){
 const i={guildId:gid,channelId:'room',memberPermissions:new PermissionsBitField([PermissionFlagsBits.ManageGuild]),
  message:{id:'original-post',author:{id:'test-bot'}},events:[],state:{},files:[],deferred:false,replied:false,
  options:{getChannel:()=>null,getString:()=> 'pc_wallpapers',getInteger:()=>null,getFocused:()=>''},
  isAutocomplete:()=>false,isChatInputCommand:()=>kind==='command',isStringSelectMenu:()=>kind==='select',isChannelSelectMenu:()=>false,
  isButton:()=>kind==='button',isModalSubmit:()=>false,
  async apply(method,payload){
   const options=typeof payload==='string'?{content:payload}:payload;
   const resolved=MessagePayload.create({client:serializationClient},options).resolveBody();await resolved.resolveFiles();
   this.events.push(method);this.state=resolved.body;this.files=resolved.files;
  },
  async deferReply(options){this.deferred=true;this.deferredOptions=options;this.events.push('deferReply');},
  async deferUpdate(){this.deferred=true;this.events.push('deferUpdate');},
  async reply(payload){this.replied=true;return this.apply('reply',payload);},
  async editReply(payload){return this.apply('editReply',payload);},
  async update(payload){this.replied=true;return this.apply('update',payload);},
  ...extra};return i;
}
function assertOriginalReply(i){
 assert.equal(i.state.content||'','');assert.equal(i.files.length,1,i.state.content||'expected an original wallpaper attachment');
 assert.deepEqual(i.files[0].data,original);assert.equal(i.state.attachments.length,1);
 for(const embed of i.state.embeds||[]){
  assert.equal(embed.image?.url,'attachment://'+i.files[0].name);
  for(const field of ['title','description','url','thumbnail','footer'])assert.equal(embed[field],undefined);
 }
 assert(!(i.state.components||[]).some(row=>row.components?.some(button=>button.style===ButtonStyle.Link||button.url)));
}
const buttonId=retry.messages[0].components[0].toJSON().components[0].custom_id;
const download=interaction('button',retry.gid,{customId:buttonId,memberPermissions:new PermissionsBitField()});
const beforeDownload=requests.length;
await handleInteraction(download,retry.client);
assert.equal(download.events[0],'deferReply');assert.equal(download.deferredOptions.flags,MessageFlags.Ephemeral);
assertOriginalReply(download);
const downloadRequests=requests.slice(beforeDownload);
assert(downloadRequests.some(url=>url.pathname==='/api/v1/w/'+gameId));
assert(downloadRequests.some(url=>url.hostname==='w.wallhaven.cc'));
assert(!downloadRequests.some(url=>url.pathname==='/api/v1/search'),'download must revalidate the exact published wallpaper ID');

for(const name of ['معاينة','جلب-صور','استكشاف-وولهيفن']){
 const preview=interaction('command','private-'+name,{commandName:name});
 await handleInteraction(preview,retry.client);assert.equal(preview.events[0],'deferReply');assertOriginalReply(preview);
 assert.deepEqual(guild(preview.guildId).packs,[]);
}
for(const action of ['fetch','wallhaven']){
 const menu=interaction('select','private-menu-'+action,{customId:'sas:category:'+action+':0',values:['pc_wallpapers']});
 await handleInteraction(menu,retry.client);assert.equal(menu.events[0],'deferUpdate');assertOriginalReply(menu);
 assert.deepEqual(guild(menu.guildId).packs,[]);
}
// Legacy collection-link controls are safe aliases for actual PC publication.
const slashAlias=destination('pc-old-slash-alias');
const oldSlash=interaction('command',slashAlias.gid,{commandName:'مجموعات-4k',
 options:{getChannel:()=>({id:'room'}),getString:()=>null,getInteger:()=>null}});
await handleInteraction(oldSlash,slashAlias.client);assert.equal(slashAlias.messages.length,1);assertOriginalPost(slashAlias.messages[0]);
const menuAlias=destination('pc-old-menu-alias');
const oldMenu=interaction('select',menuAlias.gid,{customId:'sas:channel:4k-links',values:['room'],
 isStringSelectMenu:()=>false,isChannelSelectMenu:()=>true});
await handleInteraction(oldMenu,menuAlias.client);assert.equal(menuAlias.messages.length,1);assertOriginalPost(menuAlias.messages[0]);
const wrongAlias=destination('not-a-pc-room');wrongAlias.room.category='movies';
const wrongSlash=interaction('command',wrongAlias.gid,{commandName:'مجموعات-4k',
 options:{getChannel:()=>({id:'room'}),getString:()=>null,getInteger:()=>null}});
const beforeWrongAlias=requests.length;await handleInteraction(wrongSlash,wrongAlias.client);
assert.equal(wrongAlias.messages.length,0);assert.equal(requests.length,beforeWrongAlias);assert.match(wrongSlash.state.content,/PC|خلفيات/);

// A once-safe image whose live classification changes must not be downloaded
// from cached metadata or the old source URL.
unsafeDetails=true;const noUnsafeDownload=interaction('button',retry.gid,{customId:buttonId});
const imagesBeforeUnsafe=requests.filter(url=>url.hostname==='w.wallhaven.cc').length;
await handleInteraction(noUnsafeDownload,retry.client);
assert.equal(noUnsafeDownload.files.length,0);assert(noUnsafeDownload.state.content);
assert.equal(requests.filter(url=>url.hostname==='w.wallhaven.cc').length,imagesBeforeUnsafe);
unsafeDetails=false;
mode='image-error';const noCachedDownload=interaction('button',retry.gid,{customId:buttonId});
const imagesBeforeFailure=requests.filter(url=>url.hostname==='w.wallhaven.cc').length;
await handleInteraction(noCachedDownload,retry.client);
assert.equal(noCachedDownload.files.length,0);assert(noCachedDownload.state.content);
assert(requests.filter(url=>url.hostname==='w.wallhaven.cc').length>imagesBeforeFailure,'the source original must be requested again');
mode='game';

// Pausing during original-image retrieval cancels publication without consuming
// the wallpaper ID or changing the previous schedule/history.
const cancel=destination('pc-cancel');let release,reached;
const ready=new Promise(resolve=>{reached=resolve;}),wait=new Promise(resolve=>{release=resolve;});
imageGate={reached,wait};
const pending=post(cancel.client,cancel.gid,'room');await ready;
cancel.room.enabled=false;cancel.room.revision++;const nextAt=cancel.room.nextAt;
release();assert.match(await pending,/أُلغي/);imageGate=null;
assert.equal(cancel.messages.length,0);assert.equal(cancel.room.count,0);assert.equal(cancel.room.nextAt,nextAt);
assert.deepEqual(cancel.room.wallhavenUsedIds||[],[]);assert.deepEqual(cancel.g.packs,[]);

// Original bytes never become an on-disk image library.
assert.deepEqual(await fs.readdir('storage/packs').catch(error=>{if(error.code==='ENOENT')return [];throw error;}),[]);
await serializationClient.destroy();
console.log('PASS: original PC game/anime attachments, download revalidation, no link buttons, failed-send retry/dedup, permissions, cancellation and no image library');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(temp,{recursive:true,force:true});}
