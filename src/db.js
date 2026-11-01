import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isPublishableRecord} from './content-policy.js';
import {isCurrentBoysStyle,BOYS_STYLE_VERSION} from './boys-style.js';
import {isUnsplashRecord} from './unsplash-record.js';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const STORE_FILE=path.join(ROOT,'storage','state.json');
export const DEFAULT_CATEGORIES=Object.freeze({
 anime:'🎌 أنمي',movies:'🎬 أفلام',girls:'🌸 بنات',boys:'🖤 شباب',pc_wallpapers:'🖥️ خلفيات PC'
});
export const ALLOWED_CATEGORIES=new Set(Object.keys(DEFAULT_CATEGORIES));
export function loadStore(file=STORE_FILE){
 try {const s=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!s||!s.guilds||typeof s.guilds!=='object'||Array.isArray(s.guilds))throw Error('ملف غير صحيح');
  for(const g of Object.values(s.guilds)){
   if(!g||typeof g!=='object'||Array.isArray(g))throw Error('بيانات السيرفر غير صحيحة');
   if(g.packs!=null&&!Array.isArray(g.packs))throw Error('قائمة الصور غير صحيحة');
   if((g.packs||[]).some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw Error('بيانات صورة محفوظة غير صحيحة');
   for(const key of ['rooms','categories','sources','fetchAt','fetchStatus','titleOverrides','migrations'])
    if(g[key]!=null&&(typeof g[key]!=='object'||Array.isArray(g[key])))throw Error('إعدادات السيرفر غير صحيحة');
   if(Object.values(g.rooms||{}).some(room=>!room||typeof room!=='object'||Array.isArray(room)))throw Error('بيانات روم محفوظ غير صحيحة');
  }
  return s;}
 catch(e){if(e.code==='ENOENT')return {version:9,guilds:{}};throw Error('تعذر قراءة بيانات البوت، لا تحذف الملف! '+e.message);}
}
export function saveStore(s,file=STORE_FILE){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(temp,file);
}
export const store=loadStore();
export function save(){saveStore(store);}
export function guild(gid,s=store){
 const g=s.guilds[gid]??=( {categories:{...DEFAULT_CATEGORIES},rooms:{},packs:[],titleOverrides:{},fetchAt:{},sources:{}} );
 // Fixed categories: ignore any legacy or user-created extra categories.
 g.categories={...DEFAULT_CATEGORIES};
 g.rooms??={};g.packs??=[];g.titleOverrides??={};g.fetchAt??={};g.sources??={};
 for(const [cid,room] of Object.entries(g.rooms))if(!ALLOWED_CATEGORIES.has(room?.category))delete g.rooms[cid];
 for(const room of Object.values(g.rooms)){if(!Array.isArray(room.usedIds))room.usedIds=room.lastId?[room.lastId]:[];}
 for(const [cid,category] of Object.entries(g.sources))if(!ALLOWED_CATEGORIES.has(category))delete g.sources[cid];
 return g;
}
export function kindFor(cat){return cat==='pc_wallpapers'?'wallpaper':'profile';}
export function mediaPath(rel){
 if(!rel||typeof rel!=='string')throw Error('مسار صورة غير صالح');
 const full=path.resolve(ROOT,rel);
 if(!full.startsWith(ROOT+path.sep))throw Error('مسار غير آمن');
 return full;
}
// Very close dHash values mean the same photograph was often resized/cropped.
// Reject the whole pack if EITHER image is already used by a different pack.
export function nearPictureHash(a,b,maxDistance=5){
 if(!/^[0-9a-f]{1,16}$/i.test(String(a||''))||!/^[0-9a-f]{1,16}$/i.test(String(b||'')))return false;
 let x=BigInt('0x'+a)^BigInt('0x'+b),distance=0;
 while(x){x&=x-1n;distance++;if(distance>maxDistance)return false;}
 return true;
}
export function samePhoto(a,b){
 if(!a||!b)return false;
 return Boolean(a.sourceId&&b.sourceId&&a.sourceId===b.sourceId) ||
  Boolean(Array.isArray(a.sourceIds)&&Array.isArray(b.sourceIds)&&a.sourceIds.some(id=>b.sourceIds.includes(id))) ||
  Boolean(a.visualHash&&b.visualHash&&a.visualHash===b.visualHash) ||
  Boolean(a.bannerVisualHash&&b.bannerVisualHash&&a.bannerVisualHash===b.bannerVisualHash) ||
  Boolean(a.visualHash&&b.bannerVisualHash&&a.visualHash===b.bannerVisualHash) ||
  Boolean(a.bannerVisualHash&&b.visualHash&&a.bannerVisualHash===b.visualHash) ||
  nearPictureHash(a.avatarDHash,b.avatarDHash) || nearPictureHash(a.bannerDHash,b.bannerDHash) ||
  nearPictureHash(a.avatarDHash,b.bannerDHash) || nearPictureHash(a.bannerDHash,b.avatarDHash);
}
export function isRemovedSource(p){
 const values=[p.sourceId,...(p.sourceIds||[]),p.verificationSource,p.sourceUrl,p.sourceBannerUrl];
 return values.some(x=>/^(?:openverse:|tmdb:|openverse-|tmdb-|commons-|File:)/i.test(String(x||'')) ||
  /(?:^|[./])(?:wikimedia\.org|themoviedb\.org|tmdb\.org|openverse\.org)(?:[/:]|$)/i.test(String(x||'')));
}
// Stored website records support download buttons and duplicate history only.
// They are never a publication queue or a fallback when a website is unavailable.
export function isWebsiteRecord(p){
 const provider={girls:'Unsplash',boys:'Unsplash',movies:'Fanart.tv',anime:'Wallhaven'}[p?.category];
 return Boolean(provider&&p.importedAutomatically===true&&p.categoryVerified===true&&p.provider===provider&&
  (provider==='Unsplash'?isUnsplashRecord(p):!p.remote&&Array.isArray(p.sourceIds)&&p.sourceIds.length===2&&
   p.sourceIds.every(id=>String(id).startsWith(provider==='Fanart.tv'?'fanart:art:':'wallhaven:'))));
}
export function packs(gid,cat=null,s=store){
 const g=guild(gid,s);const combined=g.packs;const seen=new Set(),out=[];
 for(const p of combined){
  if(!isWebsiteRecord(p)||!g.categories[p.category]||p.kind!==kindFor(p.category)||!isPublishableRecord(p))continue;
  // Images imported automatically by older versions were misclassified; fail closed.
  if(p.categoryVerified!==true)continue;
  // Removed providers remain on disk for backups, but cannot be republished.
  if(isRemovedSource(p))continue;
  // Keep old files for backups, but use the requested dark streetwear style for boys.
  // Old styles stay in history only.
  if(!isCurrentBoysStyle(p))continue;
  if(p.remote){if(!isUnsplashRecord(p))continue;}
  else if(!p.avatar || !p.banner || !fs.existsSync(mediaPath(p.avatar))||!fs.existsSync(mediaPath(p.banner)))continue;
  const hash=p.visualHash||p.sourceId||p.id;
  if(seen.has(hash)||out.some(prev=>samePhoto(prev,p)))continue;seen.add(hash);
  out.push({...p,title:g.titleOverrides[p.id]||p.title});
 }
 return cat ? out.filter(p=>p.category===cat) : out;
}
export function pack(gid,id,s=store){return packs(gid,null,s).find(p=>p.id===id);}
export function makeRoom(category,minutes=40,now=Date.now()){
 if(!ALLOWED_CATEGORIES.has(category))throw Error('التصنيف غير مدعوم. الأقسام المسموحة: anime, movies, girls, boys, pc_wallpapers');
 if(!Number.isInteger(minutes)||minutes<5||minutes>1440)throw Error('مدة النشر من 5 إلى 1440 دقيقة');
 return {category,minutes,enabled:true,revision:0,nextAt:now,lastPostAt:0,lastId:null,queue:[],usedIds:[],error:null,count:0};
}
export function sent(room,id,now=Date.now()){
 room.queue=(room.queue||[]).filter(k=>k!==id);
 room.usedIds??=[];if(!room.usedIds.includes(id))room.usedIds.push(id);room.lastId=id;room.count=(room.count||0)+1;room.lastPostAt=now;
 room.nextAt=now+(room.minutes||40)*60000;room.error=null;
}
export function addPack(gid,record,s=store){
 const g=guild(gid,s);if(!g.categories[record.category])throw Error('التصنيف غير موجود');
 if(isRemovedSource(record))throw Error('هذا المصدر محذوف؛ استخدم أحد المصادر الحالية');
 if(!isWebsiteRecord(record))throw Error('يجب جلب الصور مباشرة من المواقع المعتمدة');
 if(!isPublishableRecord({...record,reviewedWithV86:true}))throw Error('الصورة غير مؤكدة التصنيف؛ يجب أن تكون صورة فوتوغرافية موثقة، وليس أنمي أو رسمًا.');
 if(!isCurrentBoysStyle(record))throw Error('قسم الشباب يحتاج طقمًا من الستايل الجديد');
 if(record.kind!==kindFor(record.category))throw Error('خطأ: نوع الصورة لا يطابق التصنيف');
 if(record.remote){if(!isUnsplashRecord(record))throw Error('بيانات صور Unsplash غير صالحة');}
 else if(!/^[0-9a-f]{64}$/i.test(record.visualHash||'')||!record.bannerVisualHash||!record.avatarDHash||!record.bannerDHash)throw Error('بصمة الأفتار أو البنر ناقصة');
 if(packs(gid,null,s).some(p=>samePhoto(p,record)||(p.sourceId&&p.sourceId===record.sourceId)))throw Error('الأفتار أو البنر موجود سابقًا، حتى لو تغير اسم الملف أو الحجم');
 const p={...record,reviewedWithV86:true,id:record.id||'sas-'+randomUUID().replaceAll('-','').slice(0,14)};g.packs.push(p);
 return p;
}
export function sha(buffer){return createHash('sha256').update(buffer).digest('hex');}
export function migrateLegacySettings(legacyPath=STORE_FILE,s=store){
 // Convert saved configs to five categories, even if an older upgrade had run.
 // Do not delete custom images from other categories: keep their metadata on disk
 // so the owner can make a backup, but never publish them in this version.
 let changed=false;
 for(const g of Object.values(s.guilds||{})){
  g.categories??={};g.packs??=[];g.titleOverrides??={};g.rooms??={};g.fetchAt??={};g.sources??={};
  // Older versions used a film-wide source ID and stopped after one pair.
  // Preserve pack IDs/history while identifying each pair by its actual images.
  for(const p of g.packs){
   if(p?.category==='movies'&&/^fanart:movie:tt\d{7,10}$/.test(p.sourceId||'')&&
    Array.isArray(p.sourceIds)&&p.sourceIds.length===2&&p.sourceIds.every(id=>/^fanart:art:\d+$/.test(id))){
    p.sourceId=[p.sourceId,...p.sourceIds].join('|');changed=true;
   }
  }
  if(g.migrations?.photoProvider!=='unsplash-v1'){
   for(const category of ['girls','boys']){
    g.fetchAt[category]=0;
    if(g.fetchStatus)delete g.fetchStatus[category];
   }
   g.migrations??={};g.migrations.photoProvider='unsplash-v1';changed=true;
  }
  if(g.migrations?.boysStyle!==BOYS_STYLE_VERSION){
   g.fetchAt.boys=0;
   g.migrations??={};g.migrations.boysStyle=BOYS_STYLE_VERSION;changed=true;
  }
  if(!g.migrations?.stableV8){
   for(const room of Object.values(g.rooms)){
    if(room.minutes===60)room.minutes=40;
    room.queue=[];room.nextAt=Date.now()+10_000;room.error=null;
   }
   // Preserve legacy records for user backups. Unverified ones are quarantined by isPublishableRecord().
   g.migrations??={};g.migrations.stableV8=true;changed=true;
  }
  if(!g.migrations?.onlyFiveV82 || Object.keys(g.categories).some(k=>!ALLOWED_CATEGORIES.has(k)) ||
     Object.values(g.rooms).some(r=>!ALLOWED_CATEGORIES.has(r?.category)) ||
     Object.values(g.sources).some(c=>!ALLOWED_CATEGORIES.has(c))){
   g.categories={...DEFAULT_CATEGORIES};
   for(const [cid,room] of Object.entries(g.rooms))if(!ALLOWED_CATEGORIES.has(room?.category))delete g.rooms[cid];
   for(const [cid,category] of Object.entries(g.sources))if(!ALLOWED_CATEGORIES.has(category))delete g.sources[cid];
   g.migrations??={};g.migrations.onlyFiveV82=true;changed=true;
  }
 }
 if(changed && s===store)save();return changed;
}
