// Test remote Unsplash pairs and local Fanart cards in isolated storage.
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
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:tmp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {importImages,post} from './src/bot.js';
import {guild,packs,makeRoom} from './src/db.js';
process.env.UNSPLASH_ACCESS_KEY='test-key';process.env.FANART_API_KEY='test-key';
process.env.FANART_MOVIE_IDS='tt1375666';process.env.WALLHAVEN_ENABLED='true';
const av=await fs.readFile('avatar.png'),bn=await fs.readFile('banner.png');
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
 if(u.hostname==='images.unsplash.com')throw Error('Unsplash images must be hotlinked, never fetched or rehosted');
 if(u.hostname==='webservice.fanart.tv')return Response.json({imdb_id:'tt1375666',name:'Inception',
  movieposter:[{id:'1',url:'https://assets.fanart.tv/fanart/movies/27205/poster.png'}],
  moviebackground:[{id:'2',url:'https://assets.fanart.tv/fanart/movies/27205/background.png'}]});
 if(u.hostname==='assets.fanart.tv')return new Response(u.pathname.endsWith('poster.png')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='w.wallhaven.cc')return new Response(u.pathname.includes('a1b2c3')?av:bn,{headers:{'content-type':'image/png'}});
 if(u.hostname==='wallhaven.cc'){
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
 const imported=packs(gid,category)[0];
 if(category==='pc_wallpapers'){
  assert.equal(embed.url,'https://wallhaven.cc/w/d4e5f6');assert(!messages[0].files);
  assert.deepEqual(room.wallhavenUsedIds,['wallhaven:d4e5f6']);
 }else if(category==='movies'||category==='anime'){
  assert(messages[0].files[0].attachment.length>1000);assert(embed.description.includes(category==='movies'?'Fanart.tv':'مصدر البنر'));
  const again=await importImages(gid,category,true);assert(!again.startsWith('✅'),again);
 }else{
  assert(imported.remote);assert(!messages[0].files,'remote pairs must not be rehosted as attachments');
  assert.equal(embed.image.url,imported.bannerURL);assert.equal(embed.thumbnail.url,imported.avatarURL);
  assert(embed.image.url.includes('ixid=original-'));assert(embed.thumbnail.url.includes('ixid=original-'));
  assert(embed.description.includes('Unsplash'));assert(embed.description.includes('Flow Test Artist'));
  assert(embed.description.includes('unsplash.com/@flowartist'));
  assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2);
  assert.equal(requested.some(u=>u.hostname==='images.unsplash.com'),false);
  const again=await importImages(gid,category,true);assert(!again.startsWith('✅'),again);
  assert.equal(requested.filter(u=>u.pathname.endsWith('/download')).length,tracksBefore+2);
 }
}
console.log('PASS: five source routes, remote Unsplash hotlinks/attribution/selection tracking, local Fanart rendering, and saved publish state');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
} finally {await fs.rm(tmp,{recursive:true,force:true});}
