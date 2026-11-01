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
const slashPreview=interaction('command',{commandName:'معاينة',state:{embeds:[{description:'stale'}],attachments:[]},
 options:{getChannel:()=>null,getString:name=>name==='category'?'boys':null}});
await handleInteraction(slashPreview,bot);assert.equal(slashPreview.state.embeds.length,1);assert.deepEqual(slashPreview.state.attachments,[]);

// A download must show exactly one full card, not a three-image Discord gallery.
const download=interaction('button',{customId:'sas:download:'+local.id,memberPermissions:new PermissionsBitField()});
await handleInteraction(download,bot);
assert.equal(download.events[0],'deferReply');assert.equal(download.events.at(-1),'editReply');
assert.deepEqual(download.files.map(file=>file.name),['profile-card.png']);
assert.equal(download.state.attachments.length,1);
assert.equal(download.state.content,'');assert.deepEqual(download.state.embeds,[]);assert.deepEqual(download.state.components,[]);
const cardInfo=await (await import('sharp')).default(download.files[0].data).metadata();
assert.equal(cardInfo.format,'png');assert.equal(cardInfo.width,1080);assert.equal(cardInfo.height,700);
assert(download.files.every(file=>file.data.length>1000));
// Unsplash downloads remain source-hosted images, without captions or link text.
process.env.UNSPLASH_ACCESS_KEY='test-download-key';let tracks=0;
globalThis.fetch=async raw=>{
 const u=new URL(raw);assert.equal(u.hostname,'api.unsplash.com');assert(u.pathname.endsWith('/download'));tracks++;
 return Response.json({url:'https://images.unsplash.com/photo-original'});
};
const remoteDownload=interaction('button',{customId:'sas:download:'+remote.id});
await handleInteraction(remoteDownload,bot);
assert.equal(tracks,2);assert.equal(remoteDownload.events[0],'deferReply');
assert.equal(remoteDownload.state.content,'');assert.equal(remoteDownload.state.embeds.length,1);
assert.equal(remoteDownload.state.embeds[0].image.url,remote.bannerURL);
assert.equal(remoteDownload.state.embeds[0].thumbnail.url,remote.avatarURL);
assert.equal(remoteDownload.state.embeds[0].description,undefined);assert.equal(remoteDownload.state.embeds[0].title,undefined);
assert.deepEqual(remoteDownload.state.components,[]);assert.equal(remoteDownload.files.length,0);
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
