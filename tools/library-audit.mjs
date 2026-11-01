// Run after npm install: npm run audit-library. Does not modify your stored data.
import sharp from 'sharp';
import {packs,mediaPath,DEFAULT_CATEGORIES} from '../src/db.js';
import {validatePair} from '../src/quality-gate.js';
const published=packs('library-audit');
let fail=0;
for(const [cat,display] of Object.entries(DEFAULT_CATEGORIES)){
 const list=published.filter(p=>p.category===cat);
 console.log(`\n${display} | ${cat} | ${list.length} eligible images`);
 if(!list.length){console.log('⚠️  No stored images: automatic post will pause until a source supplies new verified content');continue;}
 for(const p of list){
  try {
   const a=mediaPath(p.avatar),b=mediaPath(p.banner);
   const [am,bm]=await Promise.all([sharp(a).metadata(),sharp(b).metadata()]);
   if(p.kind==='wallpaper'){
    if(am.width<1280||am.height<720||am.width/am.height<1.5)throw Error('PC wallpaper too small or not wide');
   }else{
    await validatePair(a,b,{minAvatar:320,minBanner:700,maxToneDistance:.40});
   }
   console.log(`  OK ${p.id} | ${am.width}x${am.height} | ${bm.width}x${bm.height}`);
  }catch(e){fail++;console.log(`  ERROR ${p.id}: ${e.message}`);}
 }
}
console.log(`\n${fail?'FAIL':'PASS'}: ${published.length} approved assets, ${fail} failed image checks. This is NOT a visual classifier or live Discord/API test.`);
if(fail)process.exitCode=1;
