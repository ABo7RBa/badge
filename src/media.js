import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ROOT,mediaPath,sha,kindFor} from './db.js';
import {validatePair,visualSignature} from './quality-gate.js';

const safeSVG=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=s=>Buffer.from(s,'utf8');
const MB=8*1024*1024;
export async function downloadAttachment(a){
 if(!a?.url||a.size>MB)throw Error('الصورة يجب أن تكون أقل من 8MB');
 const u=new URL(a.url);if(!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||u.protocol!=='https:')throw Error('ارفع الصورة كمرفق في ديسكورد');
 return await readLimited(u.toString());
}
export async function readLimited(url){
 const u=new URL(url);if(u.protocol!=='https:')throw Error('HTTPS مطلوب');
 const resp=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'ABO7RB/16.0 (Discord image bot)'}});
 if(!resp.ok||!(resp.headers.get('content-type')||'').startsWith('image/'))throw Error('الصورة غير متاحة');
 if(Number(resp.headers.get('content-length')||0)>MB)throw Error('الصورة كبيرة');
 const chunks=[];let n=0;for await(const chunk of resp.body){n+=chunk.length;if(n>MB)throw Error('الصورة تجاوزت 8MB');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
export async function normalizeFromUpload(gid,recordId,category,raw,bannerRaw=null){
 const info=await sharp(raw,{limitInputPixels:40_000_000,animated:false}).rotate().metadata();
 if(!info.width||!info.height)throw Error('الصورة غير صالحة');
 const dir=path.join(ROOT,'storage','packs',gid);await fs.mkdir(dir,{recursive:true});
 const wallpaper=kindFor(category)==='wallpaper';
 const av=path.join(dir,`${recordId}-${wallpaper?'wallpaper':'avatar'}.jpg`),bn=path.join(dir,`${recordId}-banner.jpg`);
 const targetFiles=[];
 try{
  if(wallpaper){
   if(info.width<1280||info.height<720||info.width/info.height<1.5)throw Error('خلفيات الكمبيوتر يجب أن تكون أفقية بدقة 1280×720 أو أكثر');
   await sharp(raw).rotate().resize({width:2560,height:1440,fit:'inside',withoutEnlargement:true}).jpeg({quality:89}).toFile(av);targetFiles.push(av);
   return {avatar:path.relative(ROOT,av).replaceAll('\\','/'),banner:path.relative(ROOT,av).replaceAll('\\','/'),kind:'wallpaper',visualHash:await visualHash(raw),bannerVisualHash:await visualHash(raw),avatarDHash:(await visualSignature(raw)).toString(16).padStart(16,'0'),bannerDHash:(await visualSignature(raw)).toString(16).padStart(16,'0')};
  }
  await sharp(raw).rotate().resize(512,512,{fit:'cover',position:'attention'}).jpeg({quality:91}).toFile(av);targetFiles.push(av);
  // Independent but approved image: both must be explicitly supplied.
  if(!bannerRaw)throw Error('ارفع بنر منفصلًا ومتناسقًا مع الأفتار، منعًا للدمج العشوائي.');
  // Fail closed if the two supplied images are indistinguishable or have
  // incompatible color mood. This does not replace manual review of content.
  const qa=await validatePair(raw,bannerRaw);
  const avHash=await visualHash(raw),bnHash=await visualHash(bannerRaw);
  if(Buffer.compare(raw,bannerRaw)===0||avHash===bnHash)throw Error('الأفتار والبنر متطابقان بصريًا. ارفع صورتين مختلفتين.');
  await sharp(bannerRaw,{limitInputPixels:40_000_000,animated:false}).rotate().resize(1200,480,{fit:'cover'}).jpeg({quality:91}).toFile(bn);
  targetFiles.push(bn);
  return {avatar:path.relative(ROOT,av).replaceAll('\\','/'),banner:path.relative(ROOT,bn).replaceAll('\\','/'),kind:'profile',visualHash:await visualHash(raw),bannerVisualHash:await visualHash(bannerRaw),avatarDHash:qa.avatarHash.padStart(16,'0'),bannerDHash:qa.bannerHash.padStart(16,'0'),pairing:'approved-static-pair',qualityScore:qa.toneScore};
 }catch(e){await Promise.all(targetFiles.map(f=>fs.rm(f,{force:true})));throw e;}
}
export async function visualHash(image){
 const buf=await sharp(image,{limitInputPixels:40_000_000}).rotate().resize(32,32,{fit:'fill'}).greyscale().raw().toBuffer();
 return sha(Buffer.from(Uint8Array.from(buf, x=>Math.floor(x/16))));
}
/** Only the banner stored in the same approved pair is shown/downloaded. */
export async function effectiveBannerPath(p){return mediaPath(p.banner);}
export async function renderCard(p,options={}) {
 const avatarFile=mediaPath(p.avatar),bannerFile=options.bannerFile ? mediaPath(options.bannerFile) : await effectiveBannerPath(p);
 if(p.kind==='wallpaper')return {buffer:await fs.readFile(avatarFile),filename:'wallpaper.jpg'};
 const W=1080,H=700;
 // Unlike older versions, show an actual independent scene at the top.
 const banner=await sharp(bannerFile).rotate().resize(1036,402,{fit:'cover',position:'centre'}).png().toBuffer();
 const banMask=svg(`<svg width="1036" height="402" xmlns="http://www.w3.org/2000/svg"><rect width="1036" height="402" rx="29" fill="#fff"/></svg>`);
 const roundedBanner=await sharp(banner).composite([{input:banMask,blend:'dest-in'}]).png().toBuffer();
 const avatar=await sharp(avatarFile).rotate().resize(298,298,{fit:'cover',position:'attention'}).png().toBuffer();
 const avMask=svg(`<svg width="298" height="298" xmlns="http://www.w3.org/2000/svg"><circle cx="149" cy="149" r="139" fill="white"/></svg>`);
 const circ=await sharp(avatar).composite([{input:avMask,blend:'dest-in'}]).png().toBuffer();
 const frame=svg(`<svg width="1080" height="700" xmlns="http://www.w3.org/2000/svg">
 <rect x="0" y="0" width="1080" height="700" rx="29" fill="#08090b"/>
 <rect x="22" y="22" width="1036" height="402" rx="29" fill="none" stroke="#9d879d" stroke-width="4"/>
 <circle cx="216" cy="404" r="160" fill="#08090b"/>
 </svg>`);
 const overlay=svg(`<svg width="1080" height="700" xmlns="http://www.w3.org/2000/svg">
 <defs><mask id="outside-avatar"><rect width="1080" height="700" fill="white"/><circle cx="216" cy="404" r="150" fill="black"/></mask></defs>
 <rect x="22" y="22" width="1036" height="402" rx="29" fill="none" stroke="#d7c8df" stroke-opacity=".88" stroke-width="4" mask="url(#outside-avatar)"/>
 <circle cx="216" cy="404" r="150" fill="none" stroke="#eee6ed" stroke-width="9"/>
 <circle cx="367" cy="505" r="21" fill="#fa485e"/>
 <rect x="357" y="502" width="20" height="6" rx="3" fill="#15151b"/>
 <path d="M25 565 v94" stroke="#bd9ece" stroke-width="4"/>
 <text x="49" y="611" font-family="Arial,DejaVu Sans,sans-serif" font-size="47" font-weight="bold" fill="#fff">ABO 7RB</text>
 <text x="53" y="652" font-family="Arial,DejaVu Sans,sans-serif" font-size="23" fill="#9b9da5">${safeSVG(p.category||'profiles')}  ✦</text>
 <text x="973" y="656" font-family="Arial,DejaVu Sans,sans-serif" font-size="55" font-weight="bold" fill="#d0b8dc">✦</text>
 </svg>`);
 // Important layer order: dark footer is underneath the portrait ring.
 const base=await sharp({create:{width:W,height:H,channels:4,background:'#08090b'}}).png().toBuffer();
 const out=await sharp(base).composite([
   {input:roundedBanner,left:22,top:22},
   {input:circ,left:67,top:255},
   {input:overlay,left:0,top:0}
 ]).png().toBuffer();
 // Rounded clipping for overall card; no descriptive caption above the image.
 const round=svg('<svg width="1080" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="700" rx="29" fill="white"/></svg>');
 return {buffer:await sharp(out).composite([{input:round,blend:'dest-in'}]).png().toBuffer(),filename:'abo-7rb.png'};
}
export async function deleteCustom(p){
 if(p.remote)return;
 for(const rel of new Set([p.avatar,p.banner])){
  const file=mediaPath(rel);if(file.startsWith(path.join(ROOT,'storage','packs')+path.sep))await fs.rm(file,{force:true});
 }
}
