import assert from 'node:assert/strict';
import {packs,mediaPath,makeRoom,choose,sent} from '../src/db.js';
import {visualSignature,distance} from '../src/quality-gate.js';
import {renderCard} from '../src/media.js';
import sharp from 'sharp';
import fs from 'node:fs';
const originalBoys=JSON.parse(fs.readFileSync(new URL('../assets/seed.json',import.meta.url))).filter(p=>p.category==='boys');
const guildId='packaged-visual-audit';
const categories=['anime','girls','boys','pc_wallpapers'];
const published=packs(guildId);
const hashes={avatar:[],banner:[]};
for (const cat of categories) {
 const eligible=packs(guildId,cat);
 if(cat==='boys')assert.equal(eligible.length,0,'generic boys seed photos are excluded from the new style');
 const items=cat==='boys'?originalBoys:eligible;
 assert(items.length>0,`No bundled image for ${cat}`);
 const room=makeRoom(cat,40);const used=new Set();
 for (const item of items){
  assert.equal(item.category,cat);
  const rendered=await renderCard(item);
  const m=await sharp(rendered.buffer).metadata();
  assert(m.width>=1000 && m.height>=500,`Render has low resolution ${item.id}`);
  if(item.kind==='profile'){
   const av=await visualSignature(mediaPath(item.avatar));
   const bn=await visualSignature(mediaPath(item.banner));
   assert(distance(av,bn)>7,`Avatar and banner too similar ${item.id}`);
   hashes.avatar.push({id:item.id,signature:av});
   hashes.banner.push({id:item.id,signature:bn});
  }
  if(cat!=='boys'){
   const pick=choose(guildId,room);
   assert(pick && !used.has(pick.id),`Repeated before completing cycle ${cat}`);
   used.add(pick.id);sent(room,pick.id);
  }
 }
 assert.equal(used.size,eligible.length);
}
for(const field of ['avatar','banner']){
 const s=hashes[field];
 for(let i=0;i<s.length;i++)for(let j=i+1;j<s.length;j++){
  assert(distance(s[i].signature,s[j].signature)>=13,`Visually duplicated ${field} ${s[i].id} ~ ${s[j].id}`);
 }
}
assert.equal(published.filter(x=>x.category==='movies').length,0,'Film stills are downloaded and verified at run time, not falsely bundled');
console.log('PASS: all packaged image files rendered, distinct avatars/banners, no duplicate visuals and no repeat within each cycle.');
