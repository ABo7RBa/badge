// Existing profile buttons must download their two exact source originals,
// stacked vertically, without requiring cropped files or changing post history.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {generatedPair} from './fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-original-downloads-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 for(const [index,category] of ['girls','boys','movies','anime'].entries()){
  const fixture=await generatedPair(51+index);
  await fs.writeFile(path.join(temp,category+'-avatar.png'),fixture.avatar);
  await fs.writeFile(path.join(temp,category+'-banner.png'),fixture.banner);
 }
 await fs.mkdir(path.join(temp,'media'));
 await sharp({create:{width:640,height:36,channels:4,background:'#175aef'}}).png().toFile(path.join(temp,'media','separator.png'));
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {Client,MessagePayload,MessageFlags} from 'discord.js';
import {handleInteraction,post} from './src/bot.js';
import {guild,store,makeRoom,save} from './src/db.js';
const categories=['girls','boys','movies','anime'],bytes={};
for(const category of categories)bytes[category]={avatar:await fs.readFile(category+'-avatar.png'),banner:await fs.readFile(category+'-banner.png')};
process.env.UNSPLASH_ACCESS_KEY='original-download-photo-key';process.env.FANART_API_KEY='original-download-film-key';
process.env.FANART_MOVIE_IDS='tt1375666';process.env.AUTO_FETCH='true';process.env.WALLHAVEN_ENABLED='true';
process.env.SHOW_IMAGE_CREDITS='false';process.env.PHOTO_DISPLAY='card';delete process.env.POST_SEPARATOR_ENABLED;
const requests=[];let activeInteraction=null,allowSearch=false,failure=null;
const flatPoster='https://assets.fanart.tv/fanart/inception-52df821bd2a9f.jpg',flatBanner='https://assets.fanart.tv/fanart/inception-4fdb7d192f166.jpg';
const animeAsset=(id,avatar)=>({id,url:'https://wallhaven.cc/w/'+id,category:'anime',purity:'sfw',tags:[],
 dimension_x:avatar?800:1600,dimension_y:avatar?1000:900,path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.png'});
function photo(category,kind){
 const id='old'+category+(kind==='avatar'?'av':'bn'),landscape=kind==='banner';
 return {id,width:landscape?1600:800,height:landscape?900:1000,color:'#333333',
  alt_description:landscape?'City street train station cloudy grass field at night':category==='boys'?'Man in black hoodie from behind at night':'Woman portrait outdoors',
  urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=original'},
  links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
  user:{name:'Fixture Photographer',links:{html:'https://unsplash.com/@fixture'}}};
}
globalThis.fetch=async(raw,options={})=>{
 const url=new URL(raw);requests.push(url);
 if(activeInteraction)assert(activeInteraction.deferred,'button is acknowledged before source requests');
 if(url.hostname==='api.unsplash.com'){
  if(url.pathname.endsWith('/download'))return Response.json({url:'https://images.unsplash.com/photo-original'});
  assert(allowSearch,'a download must not search for a replacement photo');
  const category=url.searchParams.get('query').startsWith('man ')?'boys':'girls',kind=url.searchParams.get('orientation')==='landscape'?'banner':'avatar';
  return Response.json({total:1,total_pages:5,results:[photo(category,kind)]});
 }
 if(url.hostname==='images.unsplash.com'){
  assert.equal(options.headers?.Authorization,undefined);assert.equal(options.redirect,'error');
  const category=url.pathname.includes('oldboys')?'boys':'girls',kind=url.pathname.endsWith('bn')?'banner':'avatar';
  if(failure==='photo-banner'&&kind==='banner')return new Response('unavailable',{status:503});
  return new Response(bytes[category][kind],{headers:{'content-type':'image/png'}});
 }
 if(url.hostname==='webservice.fanart.tv'){
  const posters=[{id:'111',url:flatPoster}],backgrounds=[{id:'222',url:flatBanner}];
  if(failure==='missing-movie-id')posters.length=0;
  if(!allowSearch){posters.unshift({id:'999',url:'https://assets.fanart.tv/fanart/wrong-poster.jpg'});backgrounds.unshift({id:'888',url:'https://assets.fanart.tv/fanart/wrong-banner.jpg'});}
  return Response.json({imdb_id:'tt1375666',name:'Inception',movieposter:posters,moviebackground:backgrounds});
 }
 if(url.hostname==='assets.fanart.tv'){
  assert.equal(options.headers?.Authorization,undefined);assert.equal(options.headers?.['api-key'],undefined);
  assert([flatPoster,flatBanner].includes(url.toString()),'must use the posted artwork IDs, never the first or newest alternate');
  return new Response(url.toString()===flatPoster?bytes.movies.avatar:bytes.movies.banner,{headers:{'content-type':'image/png'}});
 }
 if(url.hostname==='wallhaven.cc'){
  if(url.pathname.startsWith('/api/v1/w/')){
   const id=url.pathname.split('/').at(-1);assert(['a1b2c3','d4e5f6'].includes(id));
   const item=animeAsset(id,id==='a1b2c3');if(failure==='anime-id-mismatch')item.id='z9y8x7';
   return Response.json({data:item});
  }
  assert(allowSearch,'a download must revalidate the saved anime IDs rather than search alternatives');
  const avatar=url.searchParams.get('atleast')==='600x600';return Response.json({data:[animeAsset(avatar?'a1b2c3':'d4e5f6',avatar)]});
 }
 if(url.hostname==='w.wallhaven.cc'){
  assert.equal(options.headers?.Authorization,undefined);assert.equal(options.headers?.['X-API-Key'],undefined);
  const avatar=url.pathname.includes('a1b2c3');assert(avatar||url.pathname.includes('d4e5f6'));
  return new Response(avatar?bytes.anime.avatar:bytes.anime.banner,{headers:{'content-type':'image/png'}});
 }
 throw Error('Unexpected live network destination');
};
let sequence=0;
function context(category){
 const gid=String(10000000000000000n+BigInt(++sequence)),g=guild(gid),room=g.rooms.room=makeRoom(category),messages=[];
 const client={user:{id:'test-bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async payload=>messages.push(payload)})}};
 return {gid,g,room,messages,client};
}
function record(category,id){
 const common={id,category,kind:'profile',reviewedWithV86:true,importedAutomatically:true,categoryVerified:true,
  avatar:'storage/packs/missing/'+id+'-avatar.jpg',banner:'storage/packs/missing/'+id+'-banner.jpg'};
 if(category==='movies')return {...common,provider:'Fanart.tv',verificationSource:'fanart-movie',filmVerified:true,
  sourceIds:['fanart:art:111','fanart:art:222'],sourceId:'fanart:movie:tt1375666|fanart:art:111|fanart:art:222',sourceUrl:'https://www.imdb.com/title/tt1375666/',deliveryState:'published'};
 if(category==='anime')return {...common,provider:'Wallhaven',verificationSource:'wallhaven-anime-pair',
  sourceIds:['wallhaven:a1b2c3','wallhaven:d4e5f6'],sourceId:'wallhaven:a1b2c3|wallhaven:d4e5f6',sourceUrl:'https://wallhaven.cc/w/a1b2c3',sourceBannerUrl:'https://wallhaven.cc/w/d4e5f6'};
 const a=photo(category,'avatar'),b=photo(category,'banner');
 return {...common,remote:true,provider:'Unsplash',verificationSource:'unsplash-photo',photoVerified:true,boysStyle:'dark-street-v1',boysTheme:'mono-urban',
  sourceIds:['unsplash:'+a.id,'unsplash:'+b.id],sourceId:'unsplash:'+a.id+'|unsplash:'+b.id,avatarURL:a.urls.regular,bannerURL:b.urls.regular,
  sourceUrl:a.links.html,sourceBannerUrl:b.links.html,downloadLocations:[a.links.download_location,b.links.download_location],
  credits:{avatar:{name:a.user.name,url:a.user.links.html},banner:{name:b.user.name,url:b.user.links.html}}};
}
const serializationClient=new Client({intents:[]});
function interaction(ctx,{id,commandName}={}){
 const i={guildId:ctx.gid,channelId:'room',customId:id?'sas:download:'+id:undefined,commandName,deferred:false,replied:false,files:[],state:{},events:[],
  memberPermissions:{has:()=>true},options:{getChannel:()=>null,getString:()=>ctx.room.category},
  isAutocomplete:()=>false,isChatInputCommand:()=>Boolean(commandName),isStringSelectMenu:()=>false,isChannelSelectMenu:()=>false,isButton:()=>Boolean(id),isModalSubmit:()=>false,
  async deferReply(payload){assert.equal(payload.flags,MessageFlags.Ephemeral);this.deferred=true;this.events.push('deferReply');},
  async apply(method,payload){
   const value=typeof payload==='string'?{content:payload}:payload;
   const resolved=MessagePayload.create({client:serializationClient},value).resolveBody();await resolved.resolveFiles();
   this.state=resolved.body;this.files=resolved.files;this.events.push(method);
  },
  async reply(payload){this.replied=true;return this.apply('reply',payload);},async editReply(payload){return this.apply('editReply',payload);}};
 return i;
}
async function click(ctx,saved){
 const i=interaction(ctx,{id:saved.id}),before=JSON.stringify(store);save();
 const persisted=await fs.readFile('storage/state.json','utf8'),publicCount=ctx.messages.length;
 activeInteraction=i;await handleInteraction(i,ctx.client);activeInteraction=null;
 assert.equal(JSON.stringify(store),before,'downloading originals must not change records or publication history');
 assert.equal(await fs.readFile('storage/state.json','utf8'),persisted);assert.equal(ctx.messages.length,publicCount,'private downloads must not post separators');
 return i;
}
async function assertOriginals(i,category){
 assert.equal(i.events[0],'deferReply');assert.equal(i.state.content||'','');assert.equal(i.files.length,2);
 assert.deepEqual(i.files.map(file=>file.name),['avatar-original.png','banner-original.png']);
 assert.deepEqual(i.files[0].data,bytes[category].avatar);assert.deepEqual(i.files[1].data,bytes[category].banner);
 const [a,b]=await Promise.all(i.files.map(file=>sharp(file.data).metadata()));
 assert.equal(a.width,800);assert.equal(a.height,1000);assert.equal(b.width,1600);assert.equal(b.height,900);
 assert.equal(i.state.attachments.length,2);assert.equal(i.state.embeds.length,2);assert.deepEqual(i.state.components||[],[]);
 for(const [index,embed] of i.state.embeds.entries()){
  assert.equal(embed.image.url,'attachment://'+i.files[index].name,'avatar is above the separate banner');
  for(const field of ['title','description','footer','thumbnail','url'])assert.equal(embed[field],undefined);
 }
}
const old={};
for(const category of categories){
 const ctx=context(category),saved=record(category,'old-'+category);ctx.g.packs.push(saved);
 ctx.room.usedIds=[saved.id];ctx.room.lastId=saved.id;ctx.room.count=3;old[category]={ctx,saved};
 const before=requests.length;const i=await click(ctx,saved);await assertOriginals(i,category);
 const calls=requests.slice(before);
 if(['girls','boys'].includes(category)){
  assert.equal(calls.filter(url=>url.hostname==='images.unsplash.com').length,2);
  assert.equal(calls.filter(url=>url.hostname==='api.unsplash.com'&&url.pathname.endsWith('/download')).length,2);
 }else if(category==='movies')assert(calls.some(url=>url.pathname.endsWith('/movies/tt1375666')));
 else assert.deepEqual(calls.filter(url=>url.hostname==='wallhaven.cc').map(url=>url.pathname).sort(),['/api/v1/w/a1b2c3','/api/v1/w/d4e5f6']);
}
process.env.PHOTO_DISPLAY='source';await assertOriginals(await click(old.boys.ctx,old.boys.saved),'boys');process.env.PHOTO_DISPLAY='card';
assert.deepEqual(await fs.readdir('storage/packs').catch(error=>{if(error.code==='ENOENT')return [];throw error;}),[],'old cropped-file paths are neither required nor recreated');

// Partial source failures and changed/missing asset IDs must fail privately,
// with no random replacements, half-pair output or Unsplash tracking on failure.
for(const [mode,category] of [['photo-banner','girls'],['missing-movie-id','movies'],['anime-id-mismatch','anime']]){
 failure=mode;const beforeTracks=requests.filter(url=>url.hostname==='api.unsplash.com'&&url.pathname.endsWith('/download')).length;
 const i=await click(old[category].ctx,old[category].saved);assert.equal(i.files.length,0);assert(i.state.content);
 assert.equal(requests.filter(url=>url.hostname==='api.unsplash.com'&&url.pathname.endsWith('/download')).length,beforeTracks);
 failure=null;
}
const removed=context('movies'),removedRecord={...record('movies','removed-provider'),sourceId:'tmdb:movie:123'};
removed.g.packs.push(removedRecord);const beforeRemoved=requests.length;
const denied=await click(removed,removedRecord);assert.equal(denied.files.length,0);assert.equal(requests.length,beforeRemoved);

// Public and private previews continue rendering one framed1080x700card; only
// the download action changes to the two untouched original files.
allowSearch=true;
for(const category of categories){
 const preview=context(category),i=interaction(preview,{commandName:'معاينة'});
 process.env.UNSPLASH_ACCESS_KEY='preview-original-key-'+preview.gid;
 activeInteraction=i;await handleInteraction(i,preview.client);activeInteraction=null;
 assert.equal(preview.messages.length,0);assert.equal(i.files.length,1,i.state.content);
 const info=await sharp(i.files[0].data).metadata();assert.equal(info.width,1080);assert.equal(info.height,700);
 const published=context(category);process.env.UNSPLASH_ACCESS_KEY='public-original-key-'+published.gid;
 assert.match(await post(published.client,published.gid,'room',{forced:true}),/تم النشر/);
 assert.equal(published.messages.length,2,'one public card followed by its ordinary standalone separator');
 assert.equal(published.messages[0].files.length,1);assert.equal(published.messages[1].files[0].name,'separator.png');
 const card=await sharp(published.messages[0].files[0].attachment).metadata();assert.equal(card.width,1080);assert.equal(card.height,700);
 assert.equal(published.messages[0].components[0].toJSON().components.length,3);
}
await serializationClient.destroy();
console.log('PASS: four-category exact original downloads, vertical image-only layout, saved-ID revalidation, missing cropped files, unchanged history and unchanged public/private cards');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(temp,{recursive:true,force:true});}
