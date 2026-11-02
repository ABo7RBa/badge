import sharp from 'sharp';
import {readLimited} from './media.js';
import {sourceJson, safeSourceUrl} from './source-utils.js';
import {orientedDimensions} from './quality-gate.js';

const ID=/^[a-z0-9]{6}$/;
const MAX_BYTES=8*1024*1024,MAX_PIXELS=40_000_000;
const MAX_DETAILS=6,DETAILS_PER_QUERY=3,MAX_DOWNLOADS=2;
const SEARCHES=[{query:'video games',categories:'100'},{query:'anime',categories:'010'}];
const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
// Explicit video-game tags or unambiguous game titles. Cross-media names such
// as Batman, Star Wars or The Witcher alone cannot establish game artwork.
const GAME_TAGS=new Set([
 'video games','video game','video game art','genshin impact','honkai: star rail','honkai impact 3rd','zenless zone zero',
 'cyberpunk 2077','elden ring','minecraft','valorant','league of legends','dota 2','overwatch','overwatch 2','apex legends','fortnite',
 'red dead redemption 2','the witcher 3: wild hunt','hollow knight','sekiro: shadows die twice','dark souls','dark souls ii','dark souls iii',
 'bloodborne','armored core vi: fires of rubicon','nier: automata','nier automata','final fantasy vii','final fantasy xiv','final fantasy xvi',
 "assassin's creed odyssey","assassin's creed valhalla",'the last of us part i','the last of us part ii','halo infinite','halo 3',
 'fallout 4','fallout 76','fallout: new vegas','resident evil 4','resident evil village','star wars jedi: fallen order','star wars jedi: survivor'
]);
const ANIME_TAGS=new Set([
 'anime','anime girls','anime boys','anime art','anime scenery','anime landscape','anime screenshot','anime screenshots','anime screencaps','manga',
 'naruto','one piece','bleach','jujutsu kaisen','demon slayer','kimetsu no yaiba','attack on titan','shingeki no kyojin','dragon ball','tokyo ghoul',
 'chainsaw man','death note','neon genesis evangelion','berserk','your name','kimi no na wa','spirited away','studio ghibli'
]);
const PHOTO_TAGS=new Set(['photo','photos','photography','photograph','real people','real person','portrait photography','cosplay','cosplayer','cosplayers']);

function rawId(value){
 const id=String(value||'').replace(/^wallhaven:/i,'').toLowerCase();
 if(!ID.test(id))throw Error('معرف خلفية Wallhaven غير صالح');return id;
}
function apiUrl(path,apiKey){
 const url=new URL(path,'https://wallhaven.cc');
 if(typeof apiKey==='string'&&apiKey.trim())url.searchParams.set('apikey',apiKey.trim());
 return url;
}
function originalUrl(value,id){
 // Check the original spelling as well as URL parsing: URL normalizes default
 // ports and dot segments, which are not accepted original-file paths here.
 if(typeof value!=='string')return null;
 const full=new RegExp(`^https://w\\.wallhaven\\.cc/full/${id.slice(0,2)}/wallhaven-${id}\\.(?:jpg|jpeg|png|webp)$`);
 const path=new RegExp(`^/full/${id.slice(0,2)}/wallhaven-${id}\\.(?:jpg|jpeg|png|webp)$`);
 return full.test(value)&&safeSourceUrl(value,['w.wallhaven.cc'],path)?value:null;
}
function eligibleDetails(data,id){
 if(!data||data.id!==id||normalize(data.purity)!=='sfw'||!Array.isArray(data.tags))return null;
 const category=normalize(data.category);
 if(!['anime','general'].includes(category))return null;
 const size=Number(data.file_size);
 if(Number.isFinite(size)&&(size>MAX_BYTES||size<0))return null;
 const names=[];
 for(const tag of data.tags){
  if(!tag||typeof tag.name!=='string')continue;
  if(tag.purity!=null&&normalize(tag.purity)!=='sfw')return null;
  const name=normalize(tag.name);
  if(PHOTO_TAGS.has(name)||/\bcosplay(?:er|ers)?\b|\bphotograph(?:y|s|ic)?\b/.test(name)||/^(?:nsfw|nudity|nude|hentai|ecchi)$/.test(name))return null;
  names.push(name);
 }
 const game=names.some(name=>GAME_TAGS.has(name)),anime=names.some(name=>ANIME_TAGS.has(name));
 if(category==='general'?!game:!game&&!anime)return null;
 const imageUrl=originalUrl(data.path,id);
 return imageUrl?{rawId:id,imageUrl}:null;
}
function downloadError(){
 const error=Error('Wallhaven: تعذر تنزيل الخلفية الأصلية؛ تحقق من اتصال الاستضافة بخادم الصور');
 error.code='WALLHAVEN_PC_IMAGE_NETWORK';return error;
}
async function detailsFor(id,{apiFetch,apiKey,shouldContinue}){
 if(!shouldContinue())return null;
 try{
  const response=await sourceJson(apiUrl(`/api/v1/w/${id}`,apiKey),{apiFetch,source:'Wallhaven PC'});
  if(!shouldContinue())return null;
  if(!response?.data||typeof response.data!=='object'||Array.isArray(response.data))throw Error('Wallhaven PC: بيانات الخلفية غير صالحة؛ أعد المحاولة لاحقًا');
  return eligibleDetails(response.data,id);
 }catch(error){
  if(!shouldContinue()||error.status===404)return null;
  throw error;
 }
}
async function originalImage(proof,{imageFetch,shouldContinue}){
 if(!shouldContinue())return null;
 let raw;
 try{raw=await imageFetch(proof.imageUrl);}
 catch{if(!shouldContinue())return null;throw downloadError();}
 if(!shouldContinue())return null;
 if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))return null;
 const buffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
 if(!buffer.length||buffer.length>MAX_BYTES)return null;
 try{
  const options={limitInputPixels:MAX_PIXELS,animated:false,failOn:'warning'};
  const metadata=await sharp(buffer,options).metadata();
  if(!shouldContinue())return null;
  if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages!=null&&metadata.pages!==1)return null;
  if(!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS)return null;
  const {width,height}=orientedDimensions(metadata);
  if(width<1920||height<1080||width/height<1.5)return null;
  // Force full decoding, without altering the bytes sent to Discord.
  await sharp(buffer,options).rotate().stats();
  if(!shouldContinue())return null;
  const extension=metadata.format==='jpeg'?'jpg':metadata.format;
  return {id:`wallhaven:${proof.rawId}`,rawId:proof.rawId,category:'pc_wallpapers',buffer,
   filename:`wallhaven-${proof.rawId}.${extension}`,width,height,sourceUrl:`https://wallhaven.cc/w/${proof.rawId}`,provider:'Wallhaven'};
 }catch{return null;}
}

export async function fetchPcWallpaper(seen=new Set(),{
 apiFetch=fetch,imageFetch=readLimited,seed=0,apiKey=process.env.WALLHAVEN_API_KEY,shouldContinue=()=>true
}={}){
 if(!shouldContinue())return null;
 const supplied=Number(seed),value=Number.isFinite(supplied)?Math.abs(Math.trunc(supplied)):0;
 const used=new Set(seen),checked=new Set();let details=0,downloads=0,imageFailure=false;
 searches:for(let index=0;index<SEARCHES.length;index++){
  if(!shouldContinue())return null;
  const search=SEARCHES[(value+index)%SEARCHES.length],url=apiUrl('/api/v1/search',apiKey);
  for(const [key,parameter]of Object.entries({q:search.query,categories:search.categories,purity:'100',atleast:'1920x1080',ratios:'16x9,16x10,21x9',sorting:'random',seed:value.toString(36).padStart(6,'0').slice(-6),page:String(1+Math.floor(value/2)%3)}))url.searchParams.set(key,parameter);
  let result;
  try{result=await sourceJson(url,{apiFetch,source:'Wallhaven PC'});}
  catch(error){if(!shouldContinue())return null;throw error;}
  if(!shouldContinue())return null;
  if(!Array.isArray(result?.data))throw Error('Wallhaven PC: رد البحث غير صالح؛ أعد المحاولة لاحقًا');
  const items=result.data,offset=value%Math.max(1,items.length);
  const candidates=[...items.slice(offset),...items.slice(0,offset)];let queryDetails=0;
  for(const candidate of candidates){
   if(!shouldContinue())return null;
   if(details>=MAX_DETAILS||downloads>=MAX_DOWNLOADS)break searches;
   if(queryDetails>=DETAILS_PER_QUERY)break;
   const id=typeof candidate?.id==='string'?candidate.id.toLowerCase():'';
   if(!ID.test(id)||checked.has(id)||used.has(id)||used.has(`wallhaven:${id}`))continue;
   checked.add(id);details++;queryDetails++;
   const proof=await detailsFor(id,{apiFetch,apiKey,shouldContinue});
   if(!shouldContinue())return null;
   if(!proof)continue;
   downloads++;
   try{
    const image=await originalImage(proof,{imageFetch,shouldContinue});
    if(!shouldContinue())return null;
    if(image)return image;
   }catch(error){
    if(!shouldContinue())return null;
    if(error.code!=='WALLHAVEN_PC_IMAGE_NETWORK')throw error;
    imageFailure=true;
   }
  }
 }
 if(!shouldContinue())return null;
 if(imageFailure)throw downloadError();return null;
}
export async function fetchPcWallpaperById(id,{
 apiFetch=fetch,imageFetch=readLimited,apiKey=process.env.WALLHAVEN_API_KEY,shouldContinue=()=>true
}={}){
 if(!shouldContinue())return null;
 const proof=await detailsFor(rawId(id),{apiFetch,apiKey,shouldContinue});
 if(!shouldContinue()||!proof)return null;
 const image=await originalImage(proof,{imageFetch,shouldContinue});
 return shouldContinue()?image:null;
}
