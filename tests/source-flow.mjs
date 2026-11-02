// Test source-fetched composite cards and the optional Unsplash source view.
// No provider traffic, Discord sends or user state are touched.
import assert from 'node:assert/strict';
process.env.SOURCE_ONLY='false'; // ignored legacy flag
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-source-flow-'));
try {
 await fs.cp(path.join(root,'src'),path.join(tmp,'src'),{recursive:true});
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 // Fanart remains a real download/normalization/rendering path.
 const avatar=await sharp({create:{width:800,height:1000,channels:3,background:'#7c6d88'}})
  .composite([{input:Buffer.from('<svg width="800" height="1000"><circle cx="220" cy="350" r="180" fill="#281d3b"/></svg>')}]).png().toBuffer();
 const banner=await sharp({create:{width:1600,height:900,channels:3,background:'#81708e'}})
  .composite([{input:Buffer.from('<svg width="1600" height="900"><path d="M0 850 L700 80 L1600 850 Z" fill="#392d45"/></svg>')}]).png().toBuffer();
 await fs.writeFile(path.join(tmp,'avatar.png'),avatar);await fs.writeFile(path.join(tmp,'banner.png'),banner);
 await sharp(banner).resize(1920,1080).png().toFile(path.join(tmp,'pc.png'));
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {importImages,post} from './src/bot.js';
import {setupImageButtonEmojis,imageActionButton} from './src/button-icons.js';
import {Collection,ButtonStyle} from 'discord.js';
import {guild,packs,makeRoom} from './src/db.js';
process.env.UNSPLASH_ACCESS_KEY='test-key';process.env.FANART_API_KEY='test-key';
process.env.FANART_MOVIE_IDS='tt1375666';process.env.WALLHAVEN_ENABLED='true';
delete process.env.PHOTO_DISPLAY; // Composite cards are the default, including on old .env files.
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png'),pc=await fs.readFile('pc.png');
for(const key of ['DOWNLOAD_EMOJI_ID','EDIT_EMOJI_ID','DELETE_EMOJI_ID'])delete process.env[key];
const registered=new Collection(),iconImages=[];
const emojis={fetch:async()=>registered,create:async({name,attachment})=>{
 const meta=await (await import('sharp')).default(attachment).metadata();
 assert.equal(meta.width,128);assert.equal(meta.height,128);assert(meta.hasAlpha);
 const emoji={name,id:String(123456789012345678n+BigInt(registered.size))};registered.set(emoji.id,emoji);iconImages.push(attachment);return emoji;
}};
assert.equal((await setupImageButtonEmojis({application:{emojis}})).created,3);
assert.equal((await setupImageButtonEmojis({application:{emojis}})).reused,3,'restart must reuse the existing icons');
assert.equal(iconImages.length,3);
const expectedIconIds=[...registered.keys()];
const requested=[];
function photo(id,label,landscape){return {id,width:landscape?1600:800,height:landscape?900:1000,
 alt_description:label,description:label,color:'#333333',tags:label.split(',').map(title=>({title:title.trim()})),
 urls:{regular:'https://images.unsplash.com/photo-'+id+'?ixid=original-'+id+'&w=1080'},
 links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download?ixid=original-'+id},
 user:{name:'Flow Test Artist',links:{html:'https://unsplash.com/@flowartist'}}};}
globalThis.fetch=async(raw,opts)=>{
 const u=new URL(raw);requested.push(u);
 if(u.hostname==='api.unsplash.com'){
  assert.equal(opts.headers.Authorization,'Client-ID test-key');assert.equal(opts.redirect,'error');
  if(u.pathname.endsWith('/download'))return Response.json({url:'https://images.unsplash.com/download'});
  assert.equal(u.pathname,'/search/photos');
  const landscape=u.searchParams.get('orientation')==='landscape';
  const male=u.searchParams.get('query').startsWith('man ');
  const id=landscape?'scene0001':male?'male00001':'female001';
  return Response.json({total:1,total_pages:5,results:[photo(id,
   landscape?'City street train station and cloudy grass field in black and white at night':male?'Man in black hoodie from behind on a city street at night':'Woman portrait outdoors',landscape)]});
 }
 if(u.hostname==='images.unsplash.com'){
  const id=u.pathname.slice('/photo-'.length);
  assert.equal(u.searchParams.get('ixid'),'original-'+id,'image retrieval must preserve the API-provided URL');
  assert.equal(opts?.headers?.Authorization,undefined,'API credentials must never be sent to the image host');
  assert.equal(opts?.redirect,'error');
  return new Response(id==='scene0001'?bn:av,{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Inception',
  movieposter:[{id:'1',url:'https://assets.fanart.tv/fanart/movies/27205/poster.png'}],
  moviebackground:[{id:'2',url:'https://assets.fanart.tv/fanart/movies/27205/background.png'}]});
 if(u.hostname==='assets.fanart.tv')return new Response(u.pathname.endsWith('poster.png')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='w.wallhaven.cc'){
  assert.equal(opts?.headers?.Authorization,undefined);assert.equal(opts?.headers?.['X-API-Key'],undefined);assert.equal(opts?.redirect,'error');
  return new Response(u.pathname.includes('p1c2g3')?pc:u.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='wallhaven.cc'){
  if(u.pathname==='/api/v1/w/p1c2g3')return Response.json({data:{id:'p1c2g3',url:'https://wallhaven.cc/w/p1c2g3',category:'general',purity:'sfw',dimension_x:2560,dimension_y:1440,tags:[{name:'video games'}],path:'https://w.wallhaven.cc/full/p1/wallhaven-p1c2g3.jpg'}});
  if(u.searchParams.get('atleast')==='1920x1080'){
   assert(['video games','anime'].includes(u.searchParams.get('q')));assert.equal(u.searchParams.get('purity'),'100');
   return Response.json({data:u.searchParams.get('q')==='anime'?[]:[{id:'p1c2g3',url:'https://wallhaven.cc/w/p1c2g3',category:'general',purity:'sfw',dimension_x:2560,dimension_y:1440,path:'https://w.wallhaven.cc/full/p1/wallhaven-p1c2g3.jpg',thumbs:{large:'https://th.wallhaven.cc/lg/p1/p1c2g3.jpg'}}]});
  }
  const anime=u.searchParams.get('categories')==='010',avatar=anime&&u.searchParams.get('atleast')==='600x600',id=avatar?'a1b2c3':'d4e5f6';
  return Response.json({data:[{id,url:'https://wallhaven.cc/w/'+id,category:anime?'anime':'general',purity:'sfw',dimension_x:avatar?800:2560,dimension_y:avatar?1000:1440,
   path:'https://w.wallhaven.cc/full/'+id.slice(0,2)+'/wallhaven-'+id+'.jpg',thumbs:{large:'https://th.wallhaven.cc/lg/'+id.slice(0,2)+'/'+id+'.jpg'}}]});
 }
 throw Error('Unexpected network call: '+u.hostname);
};
for(const category of ['girls','boys','movies','anime','pc_wallpapers']){
 const gid='flow-'+category;const g=guild(gid);const before=packs(gid,category).map(p=>p.id);
 const tracksBefore=requested.filter(u=>u.pathname.endsWith('/download')).length;
 const result='fetch at publication';
 assert(!result.includes('تعذر'),result);
 assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore,'search/import must not track unused candidates');
 const room=g.rooms.room=makeRoom(category);room.usedIds=[...before];
 const messages=[];
 const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,
   permissionsFor:()=>({has:()=>true}),send:async payload=>{
    if(['girls','boys'].includes(category))assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2,'selection tracking must finish before Discord send');
    messages.push(payload);
   }})}};
 const posted=await post(client,gid,'room',{forced:true});
 assert.equal(messages.length,1,posted);assert.equal(room.count,1);
 const embed=messages[0].embeds[0].toJSON();
 for(const field of ['title','description','footer'])assert.equal(embed[field],undefined,'image-only post');
 const buttons=messages[0].components[0].toJSON().components;
 if(category!=='pc_wallpapers'){
  assert.equal(buttons.length,3);
  for(const [index,action] of ['download','edit','delete'].entries()){
   assert.equal(buttons[index].style,ButtonStyle.Secondary);assert.equal(buttons[index].label,undefined);
   assert.equal(buttons[index].emoji.id,expectedIconIds[index]);assert(buttons[index].custom_id.startsWith('sas:'+action+':'));
  }
 }else{
  assert.equal(buttons.length,2);
  for(const [index,action] of ['download','delete'].entries()){
   assert.equal(buttons[index].style,ButtonStyle.Secondary);assert.equal(buttons[index].label,undefined);assert.equal(buttons[index].url,undefined);
   assert.equal(buttons[index].custom_id,'sas:'+action+':wh_p1c2g3');assert.equal(buttons[index].emoji.id,expectedIconIds[index===0?0:2]);
  }
 }
 const imported=packs(gid,category)[0];
 if(category==='pc_wallpapers'){
  assert.equal(embed.url,undefined);assert.equal(messages[0].files.length,1);
  assert.equal(embed.image.url,'attachment://'+messages[0].files[0].name);
  assert(messages[0].files[0].attachment.equals(pc),'PC must attach the exact original source bytes');
  const info=await (await import('sharp')).default(messages[0].files[0].attachment).metadata();assert.equal(info.width,1920);assert.equal(info.height,1080);
  assert(requested.some(url=>url.pathname==='/api/v1/w/p1c2g3'),'PC classification must check detail tags');
  assert(!requested.some(url=>url.hostname==='th.wallhaven.cc'),'PC must never retrieve a thumbnail');
  assert.deepEqual(room.wallhavenUsedIds,['wallhaven:p1c2g3']);
 }else if(category==='movies'||category==='anime'){
  assert(messages[0].files[0].attachment.length>1000);assert.equal(embed.description,undefined);
  const again=await importImages(gid,category,true);assert(!again.startsWith('✅'),again);
 }else{
  assert(imported.remote,'the saved record remains source metadata, not a photo library entry');
  assert.equal(messages[0].files.length,1,'boys/girls publish one composite card');
  const cardInfo=await (await import('sharp')).default(messages[0].files[0].attachment).metadata();
  assert.equal(cardInfo.format,'png');assert.equal(cardInfo.width,1080);assert.equal(cardInfo.height,700);
  assert(embed.image.url.startsWith('attachment://'));assert.equal(embed.thumbnail,undefined);
  assert.equal(embed.description,undefined);assert.equal(embed.title,undefined);
  assert.equal(imported.credits.avatar.name,'Flow Test Artist');
  assert.equal(imported.avatar,undefined);assert.equal(imported.banner,undefined,'remote records keep source URLs only');
  const sourceImageRequests=requested.filter(u=>u.hostname==='images.unsplash.com');
  assert(sourceImageRequests.some(u=>u.toString()===imported.avatarURL));
  assert(sourceImageRequests.some(u=>u.toString()===imported.bannerURL));
  assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2);
  const persisted=await fs.readdir('storage/packs/'+gid).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  assert.deepEqual(persisted,[],'transient source images must not become a stored publication fallback');
  const again=await importImages(gid,category,true);assert(!again.startsWith('✅'),again);
  assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2);
 }
}
// The explicitly selected source view retains original hotlinks and thumbnail,
// without downloading source image bytes, and still tracks before publishing.
process.env.PHOTO_DISPLAY='source';
for(const category of ['girls','boys']){
 const gid='source-view-'+category,g=guild(gid),room=g.rooms.room=makeRoom(category);
 const imagesBefore=requested.filter(u=>u.hostname==='images.unsplash.com').length;
 const tracksBefore=requested.filter(u=>u.pathname.endsWith('/download')).length;
 const messages=[];
 const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async payload=>{
  assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2);messages.push(payload);
 }})}};
 const result=await post(client,gid,'room',{forced:true});assert.equal(messages.length,1,result);assert.equal(room.count,1);
 const embed=messages[0].embeds[0].toJSON(),record=packs(gid,category)[0];
 assert(!messages[0].files);assert.equal(embed.image.url,record.bannerURL);assert.equal(embed.thumbnail.url,record.avatarURL);
 assert.equal(embed.description,undefined);assert.equal(embed.title,undefined);
 assert.equal(requested.filter(u=>u.hostname==='images.unsplash.com').length,imagesBefore);
}
delete process.env.PHOTO_DISPLAY;
// Optional icon overrides and an unavailable emoji API must not break buttons.
process.env.DOWNLOAD_EMOJI_ID='987654321098765432';
assert.equal(imageActionButton('download','sas:download:override').toJSON().emoji.id,process.env.DOWNLOAD_EMOJI_ID);
delete process.env.DOWNLOAD_EMOJI_ID;
const unavailable=await setupImageButtonEmojis({application:{emojis:{fetch:async()=>{throw Error('test API unavailable');}}}});
assert.equal(unavailable.failed.length,3);
for(const action of ['download','edit','delete']){
 const fallback=imageActionButton(action,'sas:'+action+':fallback').toJSON();
 assert.equal(fallback.style,ButtonStyle.Secondary);assert(fallback.label);assert.equal(fallback.emoji,undefined);
}
console.log('PASS: monochrome application icons, reuse, override/fallback and five source routes, Unsplash composite cards/source view/selection tracking, local Fanart rendering, and saved publish state');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
} finally {await fs.rm(tmp,{recursive:true,force:true});}
