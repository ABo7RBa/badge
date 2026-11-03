// Configure a divider through the real private slash handler, then verify it is
// used only by that guild's public image posts. Transport is fully mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-separator-command-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 for(const [name,color] of [['blue','#1b54eb'],['red','#c73344'],['green','#35a16b']]){
  await sharp({create:{width:640,height:36,channels:4,background:color}}).png().toFile(path.join(temp,name+'.png'));
 }
 await sharp({create:{width:1920,height:1080,channels:3,background:'#2a324a'}}).jpeg().toFile(path.join(temp,'pc.jpg'));
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PermissionsBitField,PermissionFlagsBits,MessageFlags,ApplicationCommandOptionType} from 'discord.js';
import {handleInteraction,post} from './src/bot.js';
import {cmds} from './src/commands.js';
import {guild,makeRoom} from './src/db.js';
const gidA='11111111111111111',gidB='22222222222222222',gidUnauthorized='33333333333333333';
const images={blue:await fs.readFile('blue.png'),red:await fs.readFile('red.png'),green:await fs.readFile('green.png'),bad:Buffer.from('not a valid image')};
const pc=await fs.readFile('pc.jpg');let pcId='p1c2g3',uploadRequests=0,uploadInteraction=null;
process.env.WALLHAVEN_ENABLED='true';process.env.AUTO_FETCH='true';delete process.env.POST_SEPARATOR_ENABLED;
const metadata=id=>({id,url:'https://wallhaven.cc/w/'+id,category:'general',purity:'sfw',tags:[{name:'video games'}],
 dimension_x:1920,dimension_y:1080,path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg'});
globalThis.fetch=async(raw,options={})=>{
 const url=new URL(raw);
 if(url.hostname==='cdn.discordapp.com'){
  uploadRequests++;assert(uploadInteraction?.deferred,'the upload must be acknowledged before network or storage work');
  assert.equal(uploadInteraction.events[0],'deferReply');assert.equal(options.redirect,'error');
  assert.equal(options.headers?.Authorization,undefined);
  const name=url.pathname.split('/').at(-1).split('.')[0],bytes=images[name];assert(bytes);
  return new Response(bytes,{headers:{'content-type':'image/png','content-length':String(bytes.length)}});
 }
 if(url.hostname==='wallhaven.cc'&&url.pathname==='/api/v1/search')return Response.json({data:url.searchParams.get('q')==='anime'?[]:[metadata(pcId)]});
 if(url.hostname==='wallhaven.cc'&&url.pathname.startsWith('/api/v1/w/'))return Response.json({data:metadata(url.pathname.split('/').at(-1))});
 if(url.hostname==='w.wallhaven.cc')return new Response(pc,{headers:{'content-type':'image/jpeg'}});
 throw Error('Unexpected live network destination');
};
function destination(gid){
 const g=guild(gid),room=g.rooms.room=makeRoom('pc_wallpapers'),messages=[];
 const client={user:{id:'test-bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),
  send:async payload=>{messages.push(payload);}})}};
 return {gid,g,room,messages,client};
}
const a=destination(gidA),b=destination(gidB),unauthorized=destination(gidUnauthorized);
function interaction(gid,{admin=true,name='blue',commandName='تعيين-الفاصل',kind='command',customId}={}){
 const attachment={id:'44444444444444444',url:'https://cdn.discordapp.com/attachments/55555555555555555/44444444444444444/'+name+'.png',
  name:name+'.png',contentType:'image/png',size:images[name].length};
 const i={guildId:gid,channelId:'room',commandName,customId,deferred:false,replied:false,events:[],response:null,
  memberPermissions:new PermissionsBitField(admin?[PermissionFlagsBits.ManageGuild]:[]),
  options:{getChannel:()=>null,getString:()=> 'pc_wallpapers',getAttachment:(option,required)=>{assert.equal(option,'image');assert(required);return attachment;}},
  isAutocomplete:()=>false,isChatInputCommand:()=>kind==='command',isStringSelectMenu:()=>false,isChannelSelectMenu:()=>false,isButton:()=>kind==='button',isModalSubmit:()=>false,
  async deferReply(payload){assert.equal(payload.flags,MessageFlags.Ephemeral);this.deferred=true;this.events.push('deferReply');},
  async reply(payload){this.replied=true;this.events.push('reply');this.response=payload;},
  async editReply(payload){this.events.push('editReply');this.response=typeof payload==='string'?{content:payload}:payload;}};
 return i;
}
async function configure(destination,name='blue',admin=true){
 const i=interaction(destination.gid,{name,admin});uploadInteraction=i;
 const before=destination.messages.length;await handleInteraction(i,destination.client);uploadInteraction=null;
 assert.equal(destination.messages.length,before,'configuration must never publish the uploaded divider');
 assert(i.response?.content);return i;
}
function assertDivider(payload,expected){
 assert.equal(payload.files.length,1);assert.equal(payload.files[0].name,'separator.png');
 assert.deepEqual(payload.files[0].attachment,expected,'the uploaded asset is sent without re-encoding');
 assert.equal(payload.content||'','');assert.deepEqual(payload.embeds||[],[]);assert.deepEqual(payload.components||[],[]);
}
const command=cmds.find(item=>item.name==='تعيين-الفاصل');assert(command);
assert.equal(command.default_member_permissions,String(PermissionFlagsBits.ManageGuild));
assert.equal(command.options[0].name,'image');assert.equal(command.options[0].type,ApplicationCommandOptionType.Attachment);assert.equal(command.options[0].required,true);

// Non-administrators cannot trigger an attachment request or create storage.
const requestsBefore=uploadRequests;const blocked=await configure(unauthorized,'blue',false);
assert.deepEqual(blocked.events,['reply']);assert.equal(blocked.response.flags,MessageFlags.Ephemeral);
assert.equal(uploadRequests,requestsBefore);assert.match(blocked.response.content,/صلاحية|مشرف|إدارة/);
assert.deepEqual(await fs.readdir('storage/separators/'+gidUnauthorized).catch(error=>{if(error.code==='ENOENT')return [];throw error;}),[]);

// An accepted image is stored exactly after the interaction is deferred.
const configuredA=await configure(a,'blue');assert.deepEqual(configuredA.events,['deferReply','editReply']);
assert.match(configuredA.response.content,/✅/);assert(!configuredA.response.files?.length);
assert.deepEqual(await fs.readFile('storage/separators/'+gidA+'/separator.png'),images.blue);
assert.deepEqual(a.g.packs,[],'uploading a separator is not adding a photograph library entry');

// Without a global asset, an unconfigured guild receives only its main image.
assert.match(await post(b.client,gidB,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(b.messages.length,1);assert.equal(b.room.count,1);
assert.match(await post(a.client,gidA,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(a.messages.length,2);assertDivider(a.messages[1],images.blue);assert.equal(a.room.count,1);

// Different guilds keep different divider bytes even when both run one bot.
const configuredB=await configure(b,'red');assert.match(configuredB.response.content,/✅/);
pcId='p2c3g4';assert.match(await post(b.client,gidB,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(b.messages.length,3);assertDivider(b.messages[2],images.red);
assert.deepEqual(await fs.readFile('storage/separators/'+gidA+'/separator.png'),images.blue);

// Invalid attachment bytes cannot overwrite a previously usable separator.
const invalid=await configure(a,'bad');assert.match(invalid.response.content,/❌/);
assert.deepEqual(await fs.readFile('storage/separators/'+gidA+'/separator.png'),images.blue);
pcId='p3c4g5';assert.match(await post(a.client,gidA,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(a.messages.length,4);assertDivider(a.messages[3],images.blue);

// Preview and download interactions remain private even with a saved divider.
const beforePrivate=a.messages.length;
pcId='p4c5g6';const preview=interaction(gidA,{commandName:'معاينة'});
await handleInteraction(preview,a.client);assert.equal(preview.response.files.length,1);assert.equal(a.messages.length,beforePrivate);
const main=a.messages[2],button=main.components[0].toJSON().components.find(button=>button.custom_id.startsWith('sas:download:'));
const download=interaction(gidA,{kind:'button',customId:button.custom_id});
await handleInteraction(download,a.client);assert.equal(download.response.files.length,1);assert.equal(a.messages.length,beforePrivate);

// Explicit disablement does not discard an admin's upload: the acknowledgement
// explains the setting, and re-enabling uses the saved bytes without re-upload.
process.env.POST_SEPARATOR_ENABLED='false';const disabledUpload=await configure(a,'green');
assert.match(disabledUpload.response.content,/POST_SEPARATOR_ENABLED|معطل|متوقف/);
assert.deepEqual(await fs.readFile('storage/separators/'+gidA+'/separator.png'),images.green);
pcId='p5c6g7';const beforeDisabled=a.messages.length;
assert.match(await post(a.client,gidA,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(a.messages.length,beforeDisabled+1);
process.env.POST_SEPARATOR_ENABLED='true';pcId='p6c7g8';
assert.match(await post(a.client,gidA,'room',{forced:true}),/نشرت|تم النشر/);
assert.equal(a.messages.length,beforeDisabled+3);assertDivider(a.messages.at(-1),images.green);
assert.deepEqual(await fs.readFile('storage/separators/'+gidB+'/separator.png'),images.red);
assert.deepEqual(a.g.packs,[]);assert.deepEqual(b.g.packs,[]);
console.log('PASS: admin-only private divider upload, defer-before-download, exact storage/public delivery, guild isolation, invalid-upload preservation and disabled/private behavior');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(temp,{recursive:true,force:true});}
