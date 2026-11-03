import sharp from 'sharp';
import {readLimited} from './media.js';
import {isWebsiteRecord,isRemovedSource} from './db.js';
import {isPublishableRecord} from './content-policy.js';
import {isUnsplashRecord} from './unsplash-record.js';
import {acceptAnimeAsset} from './anime-pairs.js';
import {fanartMovieUrl,validArtwork} from './fanart-source.js';
import {sourceJson,requireApiKey} from './source-utils.js';

const MAX_BYTES=8*1024*1024,MAX_PIXELS=40_000_000;
const ROLES=['avatar','banner'];
function failure(code,message){const error=Error(message);error.code=code;return error;}
const invalidRecord=()=>failure('ORIGINAL_RECORD_INVALID','لا تتوفر بيانات مصدر موثوقة للصور الأصلية لهذا المنشور');
const unavailable=()=>failure('ORIGINAL_SOURCE_UNAVAILABLE','لم تعد الصور الأصلية نفسها متاحة في المصدر؛ لن أستبدلها بصور أخرى');
const invalidImage=()=>failure('ORIGINAL_IMAGE_INVALID','ملف الصورة الأصلية غير صالح أو يتجاوز حدود الحجم والدقة');
function requireWebsiteRecord(record){
 if(record?.kind!=='profile'||!isWebsiteRecord(record)||!isPublishableRecord(record)||isRemovedSource(record))throw invalidRecord();
}
function pairIds(record,prefix,pattern){
 if(!Array.isArray(record.sourceIds)||record.sourceIds.length!==2)throw invalidRecord();
 const ids=record.sourceIds.map(value=>typeof value==='string'&&value.startsWith(prefix)?value.slice(prefix.length):'');
 if(ids.some(id=>!pattern.test(id))||ids[0]===ids[1])throw invalidRecord();
 return ids;
}
function filmId(record){
 const match=typeof record.sourceId==='string'?record.sourceId.match(/^fanart:movie:(tt\d{7,10})(?:\||$)/):null;
 const page=typeof record.sourceUrl==='string'?record.sourceUrl.match(/^https:\/\/(?:www\.)?imdb\.com\/title\/(tt\d{7,10})\/?$/i):null;
 const fromId=match?.[1],fromPage=page?.[1]?.toLowerCase();
 if(fromId&&record.sourceId!==`fanart:movie:${fromId}`&&record.sourceId!==[`fanart:movie:${fromId}`,...record.sourceIds].join('|'))throw invalidRecord();
 if(fromId&&fromPage&&fromId!==fromPage)throw invalidRecord();
 if(!fromId&&!fromPage)throw invalidRecord();return fromId||fromPage;
}
async function movieUrls(record,{apiFetch,fanartApiKey}){
 const ids=pairIds(record,'fanart:art:',/^\d+$/),id=filmId(record),key=requireApiKey(fanartApiKey,'FANART_API_KEY');
 const json=await sourceJson(fanartMovieUrl(id,key),{apiFetch,headers:{'api-key':key},source:'Fanart.tv'});
 if(json&&String(json.status).toLowerCase()==='error')throw failure('ORIGINAL_SOURCE_ERROR','Fanart.tv: أعاد المصدر خطأ عند طلب الصور الأصلية؛ راجع المفتاح أو حاول لاحقًا');
 if(json?.imdb_id!==id||typeof json.name!=='string'||!json.name.trim())throw unavailable();
 const arrays=[json.movieposter,json.moviebackground];
 return ids.map((assetId,index)=>{
  const item=Array.isArray(arrays[index])?arrays[index].find(asset=>String(asset?.id)===assetId&&validArtwork(asset)):null;
  if(!item)throw unavailable();
  // validArtwork already binds the exact official CDN and accepted current or
  // legacy paths. Upgrade its legacy HTTP record without rewriting the asset.
  const url=new URL(item.url);url.protocol='https:';return url.toString();
 });
}
async function animeUrls(record,{apiFetch,wallhavenApiKey}){
 const ids=pairIds(record,'wallhaven:',/^[a-z0-9]{6}$/i);
 if(record.sourceId&&record.sourceId!==record.sourceIds.join('|'))throw invalidRecord();
 const urls=[];
 for(const [index,id]of ids.entries()){
  const url=new URL(`https://wallhaven.cc/api/v1/w/${id}`);
  if(typeof wallhavenApiKey==='string'&&wallhavenApiKey.trim())url.searchParams.set('apikey',wallhavenApiKey.trim());
  const json=await sourceJson(url,{apiFetch,source:'Wallhaven'}),item=json?.data;
  const path=new RegExp(`^https://w\\.wallhaven\\.cc/full/${id.slice(0,2)}/wallhaven-${id}\\.(?:jpg|jpeg|png|webp)$`,'i');
  let accepted=false;
  try{accepted=item?.id===id&&acceptAnimeAsset(ROLES[index],item)&&typeof item.path==='string'&&path.test(item.path);}catch{ /* Malformed API metadata is never a replacement source. */ }
  if(!accepted)throw unavailable();
  urls.push(item.path);
 }
 return urls;
}
async function originalFile(raw,role){
 if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw invalidImage();
 const buffer=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
 if(!buffer.length||buffer.length>MAX_BYTES)throw invalidImage();
 try{
  const options={limitInputPixels:MAX_PIXELS,animated:false,failOn:'warning'};
  const metadata=await sharp(buffer,options).metadata();
  if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages!=null&&metadata.pages!==1||!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS)throw invalidImage();
  await sharp(buffer,options).stats();
  const extension=metadata.format==='jpeg'?'jpg':metadata.format;
  return {buffer,filename:`${role}-original.${extension}`};
 }catch{throw invalidImage();}
}

// Recover precisely the two source images belonging to this saved post. Never
// render a card, read a normalized local crop, search for replacements, or alter
// publishing history. Download tracking is deliberately left to the caller.
export async function downloadOriginalPair(record,{
 apiFetch=fetch,imageFetch=readLimited,fanartApiKey=process.env.FANART_API_KEY,wallhavenApiKey=process.env.WALLHAVEN_API_KEY
}={}){
 requireWebsiteRecord(record);
 let urls;
 if(record.provider==='Unsplash'){
  if(!isUnsplashRecord(record))throw invalidRecord();
  urls=[record.avatarURL,record.bannerURL];
 }else if(record.provider==='Fanart.tv'&&record.category==='movies')urls=await movieUrls(record,{apiFetch,fanartApiKey});
 else if(record.provider==='Wallhaven'&&record.category==='anime')urls=await animeUrls(record,{apiFetch,wallhavenApiKey});
 else throw invalidRecord();
 let originals;
 try{originals=await Promise.all(urls.map(url=>imageFetch(url)));}
 catch{throw failure('ORIGINAL_DOWNLOAD_FAILED','تعذر تنزيل الصور الأصلية من مصدرها؛ حاول لاحقًا');}
 const files=[];
 for(const [index,buffer]of originals.entries())files.push(await originalFile(buffer,ROLES[index]));
 return files;
}
