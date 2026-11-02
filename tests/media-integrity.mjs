import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {ROOT} from '../src/db.js';
import {normalizeFromUpload,renderCard,deleteCustom} from '../src/media.js';
import {generatedPair,remotePair} from './fixtures.mjs';
const gid='test-render-'+randomUUID();
try{
 for(const category of ['anime','movies']){
  const raw=await generatedPair(category==='anime'?1:2);
  const record={...await normalizeFromUpload(gid,category,category,raw.avatar,raw.banner),category};
  const output=await renderCard(record),info=await sharp(output.buffer).metadata();
  assert.equal(info.format,'png');assert.equal(info.width,1080);assert.equal(info.height,700);
  assert(output.buffer.length>1000);assert.notEqual(record.visualHash,record.bannerVisualHash);
  await deleteCustom(record);
 }
 const raw=await generatedPair(29),remote=remotePair('renderremote','boys');
 const dir=path.join(ROOT,'storage','packs',gid);await fs.mkdir(dir,{recursive:true});
 const avatarFile=path.join(dir,'original-avatar.png'),bannerFile=path.join(dir,'original-banner.png');
 await fs.writeFile(avatarFile,raw.avatar);await fs.writeFile(bannerFile,raw.banner);
 const requested=[];const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{
   requested.push(url);assert([remote.avatarURL,remote.bannerURL].includes(url),'only exact validated source URLs are requested');
   assert.equal(options.redirect,'error');assert(!Object.keys(options.headers).some(key=>key.toLowerCase()==='authorization'));
   return new Response(url===remote.avatarURL?raw.avatar:raw.banner,{headers:{'content-type':'image/png'}});
  };
  const rendered=await renderCard(remote,{bannerFile:'../must-not-override-source-pair'});
  const local=await renderCard({kind:'profile',category:'boys',avatar:path.relative(ROOT,avatarFile),banner:path.relative(ROOT,bannerFile)});
  assert.deepEqual(rendered.buffer,local.buffer,'remote and anime-style local inputs must use the exact same layout');
  assert.equal(requested.length,2);assert(requested.every(url=>new URL(url).searchParams.get('ixid')==='original'));
  const before=requested.length;
  await assert.rejects(renderCard({...remote,avatarURL:'https://evil.test/photo-invalid'}),/غير صالحة/);
  assert.equal(requested.length,before,'invalid records are rejected before any network access');
  globalThis.fetch=async()=>new Response('x',{headers:{'content-type':'image/png','content-length':String(9*1024*1024)}});
  await assert.rejects(renderCard(remote),/تعذر تنزيل صور Unsplash/);
  const huge=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50000" height="1000"><rect width="50000" height="1000" fill="black"/></svg>');
  globalThis.fetch=async url=>new Response(url===remote.avatarURL?huge:raw.banner,{headers:{'content-type':'image/png'}});
  await assert.rejects(renderCard(remote),/pixel limit|exceeds|too large/i);
 }finally{globalThis.fetch=originalFetch;}
 console.log('PASS: remote source validation, transient bytes, source query privacy, body/pixel limits and identical card layout');
 console.log('PASS: generated website-pair fixtures normalize, render saveable cards and clean up without any packaged photos');
}finally{await fs.rm(path.join(ROOT,'storage','packs',gid),{recursive:true,force:true});}
