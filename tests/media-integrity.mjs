import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {ROOT} from '../src/db.js';
import {normalizeFromUpload,renderCard,deleteCustom} from '../src/media.js';
import {generatedPair} from './fixtures.mjs';
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
 console.log('PASS: generated website-pair fixtures normalize, render saveable cards and clean up without any packaged photos');
}finally{await fs.rm(path.join(ROOT,'storage','packs',gid),{recursive:true,force:true});}
