// Exercise the routed handlers and real Discord.js message serialization in
// isolated state. No login, external request or real message send occurs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-interactions-'));
try{
 await fs.cp(path.join(root,'src'),path.join(tmp,'src'),{recursive:true});
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 const avatar=await sharp({create:{width:800,height:1000,channels:3,background:'#7c6d88'}})
  .composite([{input:Buffer.from('<svg width="800" height="1000"><circle cx="220" cy="350" r="180" fill="#281d3b"/></svg>')}]).png().toBuffer();
 const banner=await sharp({create:{width:1600,height:900,channels:3,background:'#81708e'}})
  .composite([{input:Buffer.from('<svg width="1600" height="900"><path d="M0 850 L700 80 L1600 850 Z" fill="#392d45"/></svg>')}]).png().toBuffer();
 await fs.writeFile(path.join(tmp,'avatar.png'),avatar);await fs.writeFile(path.join(tmp,'banner.png'),banner);
 await fs.writeFile(path.join(tmp,'src/image-sources.js'),`
import fs from 'node:fs/promises';
export const SOURCE_CREDITS='Website fixtures';
let generation=0;
export async function fetchCategoryAssets(category){
 generation++;
 if(category==='anime')return {avatar:await fs.readFile('avatar.png'),banner:await fs.readFile('banner.png'),provider:'Wallhaven',verificationSource:'wallhaven-anime-pair',sourceIds:['wallhaven:a1b2c3','wallhaven:d4e5f6'],sourceId:'wallhaven:a1b2c3|wallhaven:d4e5f6',sourceUrl:'https://wallhaven.cc/w/a1b2c3',sourceBannerUrl:'https://wallhaven.cc/w/d4e5f6',credit:'Fixture artist',license:'Fixture only'};
 const a='fresh'+generation+'av',b='fresh'+generation+'bn';
 return {remote:true,kind:'profile',category,provider:'Unsplash',verificationSource:'unsplash-photo',photoVerified:true,boysStyle:'dark-street-v1',boysTheme:'mono-urban',
 sourceIds:['unsplash:'+a,'unsplash:'+b],sourceId:'unsplash:'+a+'|unsplash:'+b,
 avatarURL:'https://images.unsplash.com/photo-'+a+'?ixid=original',bannerURL:'https://images.unsplash.com/photo-'+b+'?ixid=original',
 sourceUrl:'https://unsplash.com/photos/'+a,sourceBannerUrl:'https://unsplash.com/photos/'+b,
 downloadLocations:['https://api.unsplash.com/photos/'+a+'/download','https://api.unsplash.com/photos/'+b+'/download'],
 credits:{avatar:{name:'Fresh Portrait',url:'https://unsplash.com/@portrait'},banner:{name:'Fresh Scene',url:'https://unsplash.com/@scene'}}};
}
`);
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Client,Collection,MessagePayload,PermissionsBitField,PermissionFlagsBits} from 'discord.js';
import {handleInteraction} from './src/bot.js';
import {guild,packs,addPack,makeRoom} from './src/db.js';
const client=new Client({intents:[]});
const bot={user:{id:'test-bot'},channels:{fetch:async()=>{throw Error('Unexpected channel request');}}};
const administrator=new PermissionsBitField([PermissionFlagsBits.ManageGuild]);
function interaction(kind,extra={}){
 const i={guildId:'interactions',channelId:'test-room',memberPermissions:administrator,deferred:false,replied:false,responded:false,
  events:[],state:{embeds:[],attachments:[]},serialized:[],
  options:{getChannel:()=>null,getString:()=>null,getInteger:()=>null,getFocused:()=>''},
  isAutocomplete:()=>kind==='autocomplete',isChatInputCommand:()=>kind==='command',
  isStringSelectMenu:()=>kind==='select',isChannelSelectMenu:()=>kind==='channel',
  isButton:()=>kind==='button',isModalSubmit:()=>kind==='modal',
  async apply(method,payload){
   const options=typeof payload==='string'?{content:payload}:payload;
   const resolved=MessagePayload.create({client},options).resolveBody();await resolved.resolveFiles();
   this.events.push(method);this.serialized.push(resolved.body);this.files=resolved.files;
   for(const key of ['content','embeds','attachments','components'])if(resolved.body[key]!==undefined)this.state[key]=resolved.body[key];
   return resolved.body;
  },
  async reply(payload){this.replied=true;return this.apply('reply',payload);},
  async editReply(payload){return this.apply('editReply',payload);},
  async update(payload){this.replied=true;return this.apply('update',payload);},
  async deferReply(){this.deferred=true;this.events.push('deferReply');},
  async deferUpdate(){this.deferred=true;this.events.push('deferUpdate');},
  async respond(choices){this.responded=true;this.events.push('respond');this.choices=choices;},
  ...extra};return i;
}
const remote={id:'remote-boy',remote:true,kind:'profile',category:'boys',provider:'Unsplash',verificationSource:'unsplash-photo',
 importedAutomatically:true,categoryVerified:true,photoVerified:true,boysStyle:'dark-street-v1',boysTheme:'mono-urban',title:'Remote boy',
 sourceIds:['unsplash:remote01','unsplash:remote02'],sourceId:'unsplash:remote01|unsplash:remote02',
 avatarURL:'https://images.unsplash.com/photo-remote01?ixid=original-a',bannerURL:'https://images.unsplash.com/photo-remote02?ixid=original-b',
 sourceUrl:'https://unsplash.com/photos/remote01',sourceBannerUrl:'https://unsplash.com/photos/remote02',
 downloadLocations:['https://api.unsplash.com/photos/remote01/download','https://api.unsplash.com/photos/remote02/download'],
 credits:{avatar:{name:'Portrait Artist',url:'https://unsplash.com/@portrait'},banner:{name:'Scene Artist',url:'https://unsplash.com/@scene'}}};
process.env.PHOTO_DISPLAY='source';
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png');
globalThis.fetch=async raw=>{
 const u=new URL(raw);assert.equal(u.hostname,'images.unsplash.com');
 return new Response(u.pathname.endsWith('bn')||u.pathname.endsWith('02')?bn:av,{headers:{'content-type':'image/png'}});
};
addPack('interactions',remote);
const navigation=interaction('select',{customId:'sas:category:preview:0',values:['boys']});
await handleInteraction(navigation,bot);
assert.notEqual(navigation.state.embeds[0].image.url,remote.bannerURL);
assert(navigation.state.embeds[0].image.url.includes('fresh'));
assert(navigation.state.embeds[0].thumbnail.url.includes('fresh'));
assert.deepEqual(navigation.state.attachments,[]);
// Discord preserves omitted fields, so each transition must actually clear them.
navigation.customId='sas:menu';navigation.values=['status'];await handleInteraction(navigation,bot);
assert.deepEqual(navigation.state.embeds,[]);assert.deepEqual(navigation.state.attachments,[]);
navigation.customId='sas:category:preview:0';navigation.values=['boys'];await handleInteraction(navigation,bot);
navigation.values=['anime'];await handleInteraction(navigation,bot);
assert.deepEqual(navigation.state.embeds,[],'local preview must clear remote embed');
assert.equal(navigation.state.attachments.length,1);assert(navigation.files[0].data.length>1000);
navigation.customId='sas:menu';navigation.values=['rooms'];await handleInteraction(navigation,bot);
assert.deepEqual(navigation.state.embeds,[]);assert.deepEqual(navigation.state.attachments,[],'text navigation clears image attachments');
const local=packs('interactions','anime')[0];
process.env.PHOTO_DISPLAY='card';
const slashPreview=interaction('command',{commandName:'معاينة',state:{embeds:[{description:'stale'}],attachments:[]},
 options:{getChannel:()=>null,getString:name=>name==='category'?'boys':null}});
await handleInteraction(slashPreview,bot);assert.deepEqual(slashPreview.state.embeds,[]);assert.equal(slashPreview.state.attachments.length,1);
assert.equal(slashPreview.state.content,'');assert.equal(slashPreview.files[0].data.length>1000,true);

// Downloads place the complete avatar above its complete banner, never the framed card or
// the normalized512x512/1200x480 display derivatives saved for an anime preview.
process.env.UNSPLASH_ACCESS_KEY='test-download-key';let tracks=0,failOriginalBanner=false;
const originalRequests=[];
globalThis.fetch=async(raw,options)=>{
 const u=new URL(raw);originalRequests.push(u);
 if(u.hostname==='images.unsplash.com'){
  assert([remote.avatarURL,remote.bannerURL].includes(raw),'retrieve the exact saved source URL without rewriting or metadata re-search');
  assert.equal(options?.headers?.Authorization,undefined);assert.equal(options?.headers?.['X-API-Key'],undefined);assert.equal(options?.redirect,'error');
  assert.equal(u.searchParams.get('ixid'),u.pathname.endsWith('02')?'original-b':'original-a');
  if(failOriginalBanner&&u.pathname.endsWith('02'))return new Response('unavailable',{status:503});
  return new Response(u.pathname.endsWith('02')?bn:av,{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='api.unsplash.com'){
  assert.equal(options?.headers?.Authorization,'Client-ID test-download-key');assert(u.pathname.endsWith('/download'),'existing saved regular URLs need no additional photo API request');
  tracks++;return Response.json({url:'https://images.unsplash.com/photo-original'});
 }
 if(u.hostname==='wallhaven.cc'){
  assert(['/api/v1/w/a1b2c3','/api/v1/w/d4e5f6'].includes(u.pathname),'anime download looks up exactly its saved source IDs');
  const id=u.pathname.split('/').at(-1),portrait=id==='a1b2c3';
  return Response.json({data:{id,url:'https://wallhaven.cc/w/'+id,category:'anime',purity:'sfw',tags:[{name:'anime'}],
   dimension_x:portrait?800:1600,dimension_y:portrait?1000:900,
   path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg'}});
 }
 if(u.hostname==='w.wallhaven.cc'){
  assert.equal(options?.headers?.Authorization,undefined);assert.equal(options?.headers?.['X-API-Key'],undefined);assert.equal(options?.redirect,'error');
  assert(['/full/a1/wallhaven-a1b2c3.jpg','/full/d4/wallhaven-d4e5f6.jpg'].includes(u.pathname));
  return new Response(u.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 }
 throw Error('Unexpected download destination');
};
async function assertOriginalFiles(response){
 assert.equal(response.events[0],'deferReply');assert.equal(response.events.at(-1),'editReply');
 assert.deepEqual(response.files.map(file=>file.name),['avatar-original.png','banner-original.png']);
 assert.equal(response.state.attachments.length,2);assert.equal(response.state.content,'');
 assert.equal(response.state.embeds.length,2,'private reply shows avatar above banner');
 assert.deepEqual(response.state.embeds,[{image:{url:'attachment://avatar-original.png'}},{image:{url:'attachment://banner-original.png'}}],'two image-only embeds preserve vertical order without captions');
 assert.deepEqual(response.state.components,[]);
 assert(response.files[0].data.equals(av),'avatar must retain the exact complete source bytes');
 assert(response.files[1].data.equals(bn),'banner must retain the exact complete source bytes');
 for(const [file,width,height] of [[response.files[0],800,1000],[response.files[1],1600,900]]){
  const metadata=await (await import('sharp')).default(file.data).metadata();
  assert.equal(metadata.format,'png');assert.equal(metadata.width,width);assert.equal(metadata.height,height);
  assert.notEqual(metadata.width,1080,'not a1080x700profile card');
 }
}
const download=interaction('button',{customId:'sas:download:'+local.id,memberPermissions:new PermissionsBitField()});
await handleInteraction(download,bot);await assertOriginalFiles(download);
assert.equal(originalRequests.filter(url=>url.hostname==='wallhaven.cc').length,2);
assert.equal(originalRequests.filter(url=>url.hostname==='w.wallhaven.cc').length,2);
// Old display derivatives may have been removed; source metadata still identifies
// exactly the previously published pair, so downloads do not require a library.
await fs.rm(local.avatar,{force:true});await fs.rm(local.banner,{force:true});
const oldAnimeDownload=interaction('button',{customId:'sas:download:'+local.id,memberPermissions:new PermissionsBitField()});
await handleInteraction(oldAnimeDownload,bot);await assertOriginalFiles(oldAnimeDownload);
// A pre-existing remote record has only urls.regular saved. Both public display
// modes must return the same uncropped files privately, with2tracking events.
for(const mode of ['card','source']){
 process.env.PHOTO_DISPLAY=mode;const before=tracks;
 const remoteDownload=interaction('button',{customId:'sas:download:'+remote.id});
 await handleInteraction(remoteDownload,bot);await assertOriginalFiles(remoteDownload);
 assert.equal(tracks,before+2);
}
assert.equal(originalRequests.filter(url=>url.hostname==='images.unsplash.com').length,4);
// Failure of either original must not send one partial image or the public card.
const recordsBefore=JSON.stringify(guild('interactions').packs),tracksBeforeFailure=tracks;failOriginalBanner=true;
const failedDownload=interaction('button',{customId:'sas:download:'+remote.id});
await handleInteraction(failedDownload,bot);
assert.equal(failedDownload.events[0],'deferReply');assert.equal(failedDownload.events.at(-1),'editReply');
assert.equal((failedDownload.files||[]).length,0);assert.deepEqual(failedDownload.state.attachments,[]);
assert.deepEqual(failedDownload.state.embeds,[]);assert.match(failedDownload.state.content,/❌/);
assert.equal(tracks,tracksBeforeFailure,'failed originals are not tracked as a completed download');
assert.equal(JSON.stringify(guild('interactions').packs),recordsBefore,'download failure cannot mutate the source catalogue');
failOriginalBanner=false;process.env.PHOTO_DISPLAY='card';
// Confirm deletion is acknowledged before any potentially slow REST request.
const deletion=interaction('button',{customId:'sas:confirm:original-message'});
const deletionClient={user:{id:'test-bot'},channels:{fetch:async()=>{
 assert.equal(deletion.events[0],'deferUpdate');return {messages:{fetch:async()=>({author:{id:'test-bot'},
  delete:async()=>deletion.events.push('deleted')})}};
}}};
await handleInteraction(deletion,deletionClient);
assert(deletion.events.indexOf('deleted')>deletion.events.indexOf('deferUpdate'));
assert.equal(deletion.events.at(-1),'editReply');assert.match(deletion.state.content,/حُذف/);
const protectedDelete=interaction('button',{customId:'sas:confirm:user-message'});let removedUserMessage=false;
await handleInteraction(protectedDelete,{user:{id:'test-bot'},channels:{fetch:async()=>({messages:{fetch:async()=>({
 author:{id:'human'},delete:async()=>{removedUserMessage=true;}})}})}});
assert.equal(removedUserMessage,false);assert.match(protectedDelete.state.content,/لا تخص البوت/);

// Rejected asynchronous autocomplete responses are handled as autocomplete,
// never by attempting an unsupported normal interaction reply.
let responses=0;
const autocomplete=interaction('autocomplete',{async respond(choices){responses++;if(responses===1)throw Error('test autocomplete failure');this.responded=true;this.choices=choices;},
 async reply(){throw Error('autocomplete must not call reply');}});
await handleInteraction(autocomplete,bot);assert.equal(responses,2);assert.deepEqual(autocomplete.choices,[]);

// Scheduling edits invalidate any in-flight post using the previous revision.
const room=guild('interactions').rooms['control-room']=makeRoom('boys');
const commandOptions={getChannel:()=>({id:'control-room'}),getString:()=>null,getInteger:()=>75};
for(const name of ['إيقاف-روم','تشغيل-روم','مدة-النشر'])await handleInteraction(interaction('command',{commandName:name,options:commandOptions}),bot);
assert.equal(room.revision,3);assert.equal(room.minutes,75);
await handleInteraction(interaction('channel',{customId:'sas:channel:stop',values:['control-room']}),bot);assert.equal(room.revision,4);
await handleInteraction(interaction('modal',{customId:'sas:modal:minutes:control-room',fields:{getTextInputValue:()=> '90'}}),bot);
assert.equal(room.revision,5);assert.equal(room.minutes,90);

// Interactions on an old control panel must acknowledge the removed feature.
const staleMenu=interaction('select',{customId:'sas:menu',values:['packs']});
await handleInteraction(staleMenu,bot);assert.match(staleMenu.state.content,/أزيل/);
assert(staleMenu.state.components.length>0);
const staleCommand=interaction('command',{commandName:'عرض-الصور'});
await handleInteraction(staleCommand,bot);assert.match(staleCommand.state.content,/أزيل/);
await client.destroy();
console.log('PASS: real Discord payload navigation, local/remote previews, deferred deletion, autocomplete errors, scheduling revisions and fresh website previews');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(tmp,{recursive:true,force:true});}
