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
 await fs.symlink(path.join(root,'assets'),path.join(tmp,'assets'),'dir');
 const avatar=await sharp({create:{width:800,height:1000,channels:3,background:'#7c6d88'}})
  .composite([{input:Buffer.from('<svg width="800" height="1000"><circle cx="220" cy="350" r="180" fill="#281d3b"/></svg>')}]).png().toBuffer();
 const banner=await sharp({create:{width:1600,height:900,channels:3,background:'#81708e'}})
  .composite([{input:Buffer.from('<svg width="1600" height="900"><path d="M0 850 L700 80 L1600 850 Z" fill="#392d45"/></svg>')}]).png().toBuffer();
 await fs.writeFile(path.join(tmp,'avatar.png'),avatar);await fs.writeFile(path.join(tmp,'banner.png'),banner);
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Client,Collection,MessagePayload,PermissionsBitField,PermissionFlagsBits} from 'discord.js';
import {handleInteraction,handleSourceMessage} from './src/bot.js';
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
assert.equal(navigation.state.embeds[0].image.url,remote.bannerURL);
assert.equal(navigation.state.embeds[0].thumbnail.url,remote.avatarURL);
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
 options:{getChannel:()=>null,getString:name=>name==='id'?local.id:null}});
await handleInteraction(slashPreview,bot);assert.deepEqual(slashPreview.state.embeds,[]);assert.equal(slashPreview.state.attachments.length,1);

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

// A configured source room plus an administrator's upload is the review. Only
// CDN attachments are downloaded; movie attribution must be supplied explicitly.
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png');let downloads=0;
globalThis.fetch=async raw=>{
 const u=new URL(raw);assert.equal(u.hostname,'cdn.discordapp.com');downloads++;
 if(u.pathname.endsWith('invalid.png'))return new Response('not an image',{headers:{'content-type':'image/png'}});
 return new Response(u.pathname.endsWith('banner.png')?bn:av,{headers:{'content-type':'image/png'}});
};
function sourceMessage(category,{gid='source-'+category,authorized=true,botAuthor=false,configured=true,content='',missingBanner=false,invalidImage=false}={}){
 const channelId=gid+'-room';if(configured)guild(gid).sources[channelId]=category;
 const first=category==='pc_wallpapers'?'banner.png':invalidImage?'invalid.png':'avatar.png';
 const values=[['a',{url:'https://cdn.discordapp.com/attachments/test/'+first,size:av.length,contentType:'image/png'}]];
 if(category!=='pc_wallpapers'&&!missingBanner)values.push(['b',{url:'https://cdn.discordapp.com/attachments/test/banner.png',size:bn.length,contentType:'image/png'}]);
 return {guildId:gid,channelId,author:{bot:botAuthor},content,attachments:new Collection(values),reactions:[],
 member:{permissions:new PermissionsBitField(authorized?[PermissionFlagsBits.ManageGuild]:[])},
 async reply(payload){this.errorReply=payload;},
 async react(emoji){this.reactions.push(emoji);}};
}
for(const category of ['girls','boys','anime','movies','pc_wallpapers']){
 const message=sourceMessage(category,{content:category==='movies'?'فيلم https://www.imdb.com/title/tt1375666/':''});
 const result=await handleSourceMessage(message);assert(result.startsWith('✅'),result);
 const record=guild(message.guildId).packs[0];assert(record);assert.equal(record.category,category);
 assert.deepEqual(message.reactions,['✅']);
 if(['girls','boys'].includes(category))assert.equal(record.verificationSource,'moderator-photo');
 if(category==='movies'){assert.equal(record.filmVerified,true);assert.equal(record.sourceUrl,'https://www.imdb.com/title/tt1375666/');}
}
for(const settings of [{authorized:false},{botAuthor:true},{configured:false}]){
 const before=downloads,message=sourceMessage('boys',{...settings,gid:'blocked-'+JSON.stringify(settings)});
 assert.equal(await handleSourceMessage(message),undefined);assert.equal(downloads,before);assert.deepEqual(message.reactions,[]);
}
for(const [category,settings,pattern] of [['movies',{content:'لا يوجد رابط'},/HTTPS/],['boys',{missingBanner:true},/بنر/],['anime',{invalidImage:true},/تعذر/]]){
 const message=sourceMessage(category,{...settings,gid:'invalid-'+category});const result=await handleSourceMessage(message);
 assert.match(result,pattern);assert.match(message.errorReply.content,/تعذر استيراد/);assert.deepEqual(message.reactions,['⚠️']);assert.equal(guild(message.guildId).packs.length,0);
}
await client.destroy();
console.log('PASS: real Discord payload navigation, local/remote previews, deferred deletion, autocomplete errors, scheduling revisions and reviewed source-room imports');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(tmp,{recursive:true,force:true});}
