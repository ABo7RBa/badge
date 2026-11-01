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
