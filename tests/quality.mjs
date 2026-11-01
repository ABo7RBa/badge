import assert from 'node:assert/strict';
import sharp from 'sharp';
import {validatePair,visualSignature,distance,toneDistance} from '../src/quality-gate.js';
const make=(color,w,h)=>sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();
const solid=await make('#774455',800,600);
await assert.rejects(validatePair(solid,solid),/متشابهان/);
const small=await make('#774455',200,200);
await assert.rejects(validatePair(small,await make('#343454',900,450)),/منخفضة/);
const vertical=await make('#453559',720,820);
await assert.rejects(validatePair(solid,vertical),/أفقي/);
// Similar palette but genuinely distinct shapes, not simply file-name variation.
const av=await sharp({create:{width:600,height:600,channels:3,background:'#7c6d88'}})
 .composite([{input:Buffer.from('<svg width="600" height="600"><circle cx="160" cy="180" r="140" fill="#281d3b"/></svg>')}]).png().toBuffer();
const banner=await sharp({create:{width:950,height:430,channels:3,background:'#81708e'}})
 .composite([{input:Buffer.from('<svg width="950" height="430"><path d="M0 410 L460 35 L950 390 Z" fill="#392d45"/></svg>')}]).png().toBuffer();
const result=await validatePair(av,banner);assert.ok(result.toneScore>0.6);
assert.ok(distance(await visualSignature(av),await visualSignature(banner))>6);
assert.ok(toneDistance([100,100,100],[110,110,110])<0.1);
console.log('PASS: QA gate accepts distinct matching-color images and rejects duplicates, wrong dimensions');

// EXIF orientation describes the displayed image, not its encoded width/height.
const encodedPortrait=await sharp(banner).rotate(-90).jpeg({quality:95}).withMetadata({orientation:6}).toBuffer();
assert((await sharp(encodedPortrait).metadata()).width<700);
await validatePair(av,encodedPortrait);
const displayedPortrait=await sharp(banner).jpeg().withMetadata({orientation:6}).toBuffer();
await assert.rejects(validatePair(av,displayedPortrait),/منخفضة|أفقي/);
const {normalizeFromUpload,deleteCustom}=await import('../src/media.js');
const {ROOT,mediaPath}=await import('../src/db.js');
const {randomUUID}=await import('node:crypto');
const fs=await import('node:fs/promises');
const path=await import('node:path');
const gid='orientation-'+randomUUID();let files;
try{
 const wallpaper=await sharp(banner).resize(1600,900,{fit:'fill'}).rotate(-90).jpeg().withMetadata({orientation:6}).toBuffer();
 files=await normalizeFromUpload(gid,'rotated','pc_wallpapers',wallpaper);
 const dimensions=await sharp(mediaPath(files.avatar)).metadata();assert.equal(dimensions.width,1600);assert.equal(dimensions.height,900);
}finally{if(files)await deleteCustom(files);await fs.rm(path.join(ROOT,'storage','packs',gid),{recursive:true,force:true});}
console.log('PASS: EXIF-rotated banners and wallpapers use displayed dimensions and do not admit portrait banners');
