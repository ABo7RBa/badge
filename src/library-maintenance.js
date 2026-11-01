import fs from 'node:fs/promises';
import {store,save,mediaPath} from './db.js';
import {visualSignature} from './quality-gate.js';
import {visualHash} from './media.js';
/** Recover missing fingerprints for older user-owned images.
 * Does not delete or reclassify user files; unsuitable records remain quarantined
 * by the existing isPublishableRecord() policy.
 */
export async function upgradeLibraryFingerprints(){
 let updated=0,skipped=0;
 for(const g of Object.values(store.guilds||{}))for(const p of g.packs||[]){
  if(p.remote)continue;
  if(p.avatarDHash&&p.bannerDHash&&p.bannerVisualHash)continue;
  try{
   const a=await fs.readFile(mediaPath(p.avatar));
   const b=p.avatar===p.banner?a:await fs.readFile(mediaPath(p.banner));
   p.avatarDHash=(await visualSignature(a)).toString(16).padStart(16,'0');
   p.bannerDHash=(await visualSignature(b)).toString(16).padStart(16,'0');
   p.bannerVisualHash=await visualHash(b);
   if(!p.visualHash)p.visualHash=await visualHash(a);
   updated++;
  }catch(err){skipped++;console.warn('Library fingerprint skipped:',p.id,err.message);}
 }
 if(updated)save();
 return {updated,skipped};
}
