import {safeSourceUrl,sourceJson} from './source-utils.js';
import {readLimited} from './media.js';
import {validatePair} from './quality-gate.js';

const THEMES=[
 {portrait:'anime portrait cherry blossoms',scene:'anime landscape cherry blossoms',title:'أنمي • ساكورا'},
 {portrait:'anime portrait night',scene:'anime city night',title:'أنمي • ليل'},
 {portrait:'anime portrait sky',scene:'anime landscape clouds',title:'أنمي • سماء'}
];
const BLOCKED=/(?:nsfw|nude|nudity|explicit|erotic|porn|sexual|gore)/i;
export function animePairSearchUrl(kind,theme=0){
 const entry=THEMES[theme%THEMES.length];
 if(!entry||!['avatar','banner'].includes(kind))throw Error('بحث أنمي غير صالح');
 const url=new URL('https://wallhaven.cc/api/v1/search');
 Object.entries({q:kind==='avatar'?entry.portrait:entry.scene,categories:'010',purity:'100',sorting:'random',page:'1',
  atleast:kind==='avatar'?'600x600':'1280x720',ratios:kind==='avatar'?'9x16,3x4,2x3,1x1':'16x9,16x10,21x9'})
  .forEach(([key,value])=>url.searchParams.set(key,value));
 return url;
}
export function acceptAnimeAsset(kind,item){
 if(!item||!/^[a-z0-9]{6}$/i.test(item.id||'')||item.purity!=='sfw'||item.category!=='anime')return false;
 if(item.url!==`https://wallhaven.cc/w/${item.id}`)return false;
 if(!safeSourceUrl(item.path,['w.wallhaven.cc'],new RegExp(`^/full/[a-z0-9]{2}/wallhaven-${item.id}\\.(?:jpg|jpeg|png|webp)$`,'i')))return false;
 if(BLOCKED.test((item.tags||[]).map(t=>String(t.name||'')).join(' ')))return false;
 const w=Number(item.dimension_x),h=Number(item.dimension_y);
 if(!Number.isFinite(w)||!Number.isFinite(h))return false;
 if(kind==='avatar')return Math.min(w,h)>=600&&w/h<=1.3&&h/w<=3;
 return kind==='banner'&&w>=1280&&h>=720&&w/h>=1.45;
}
export async function fetchAnimePair(seen=new Set(),{
 apiFetch=fetch,imageFetch=readLimited,validate=validatePair,seed=0,apiKey=process.env.WALLHAVEN_API_KEY||''
}={}){
 const images=new Map();let failed=false,downloadedPair=false;
 const image=asset=>{
  if(!images.has(asset.path)){
   if(images.size>=8)throw Error('انتهى حد فحص الصور');
   images.set(asset.path,Promise.resolve().then(()=>imageFetch(asset.path)));
  }
  return images.get(asset.path);
 };
 const headers={};if(apiKey&&!/^(?:YOUR_|PUT_|PASTE_)/i.test(apiKey))headers['X-API-Key']=apiKey;
 for(let step=0;step<THEMES.length;step++){
  const theme=(seed+step)%THEMES.length;
  const search=async kind=>{
   const data=await sourceJson(animePairSearchUrl(kind,theme),{apiFetch,headers,source:'Wallhaven'});
   if(!Array.isArray(data?.data))throw Error('رد Wallhaven غير صالح');
   return data.data.filter(item=>acceptAnimeAsset(kind,item)&&!seen.has(`wallhaven:${item.id}`)).slice(0,2);
  };
  const [avatars,banners]=await Promise.all([search('avatar'),search('banner')]);
  for(const a of avatars)for(const b of banners){
   if(a.id===b.id||a.path===b.path)continue;
   let avatar,banner;
   try{[avatar,banner]=await Promise.all([image(a),image(b)]);}catch{failed=true;continue;}
   downloadedPair=true;
   try{await validate(avatar,banner,{minAvatar:350,minBanner:800,maxToneDistance:0.27});}catch{continue;}
   return {avatar,banner,category:'anime',provider:'Wallhaven',verificationSource:'wallhaven-anime-pair',
    sourceId:`wallhaven:${a.id}|wallhaven:${b.id}`,sourceIds:[`wallhaven:${a.id}`,`wallhaven:${b.id}`],
    sourceUrl:a.url,sourceBannerUrl:b.url,title:THEMES[theme].title,
    credit:'Wallhaven — حقوق الصور لأصحابها',license:'حقوق الصور لأصحابها؛ روابط المصدر مرفقة'};
  }
 }
 if(failed&&!downloadedPair)throw Error('Wallhaven: تعذر تحميل صور طقم الأنمي');
 return null;
}
