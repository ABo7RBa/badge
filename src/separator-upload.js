import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {readLimited} from './media.js';

const MAX_BYTES=8*1024*1024;
const MAX_PIXELS=40_000_000;
const pending=new Map();
const extensions=['png','jpg','jpeg','webp'];
const SAFE_ERROR='تعذر حفظ الفاصل. ارفع صورة PNG أو JPEG أو WebP ثابتة لا تتجاوز 8MB.';

function validAttachmentUrl(value){
 if(typeof value!=='string'||value.length>4096||/[\u0000-\u0020\u007f\\]/.test(value)||
  !/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/[0-9]{17,22}\/[0-9]{17,22}\/[^/?#]+(?:\?[^#]*)?$/.test(value))return false;
 try{
  const url=new URL(value);
  if(url.username||url.password||url.port||url.hash||
   !/^\/attachments\/[0-9]{17,22}\/[0-9]{17,22}\/[^/]+$/.test(url.pathname))return false;
  const filename=decodeURIComponent(url.pathname.split('/').at(-1));
  return filename!=='.'&&filename!=='..'&&!/[\u0000-\u001f\u007f/\\]/.test(filename);
 }catch{return false;}
}

async function save(guildId,url,imageFetch){
 const supplied=await imageFetch(url);
 if(!Buffer.isBuffer(supplied)&&!(supplied instanceof Uint8Array))throw Error('Invalid separator bytes');
 const bytes=Buffer.from(supplied);
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('Invalid separator size');
 const options={limitInputPixels:MAX_PIXELS,animated:false,failOn:'warning'};
 const info=await sharp(bytes,options).metadata();
 if(!['jpeg','png','webp'].includes(info.format)||info.pages!=null&&info.pages!==1||
  !info.width||!info.height||info.width*info.height>MAX_PIXELS)throw Error('Invalid separator image');
 // Full decoding validates the upload; the saved data remains byte-for-byte
 // identical to the original attachment, without resizing or re-encoding.
 await sharp(bytes,options).stats();
 const name=`separator.${info.format==='jpeg'?'jpg':info.format}`;
 const directory=new URL(`../storage/separators/${guildId}/`,import.meta.url);
 const target=new URL(name,directory);
 const temporary=new URL(`${name}.${randomUUID()}.tmp`,directory);
 try{
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});
  await fs.rename(temporary,target);
  // The previous separator survives every download/decode/write failure. Only
  // remove another format once the new original has been committed atomically.
  for(const extension of extensions){
   if(`separator.${extension}`!==name)await fs.rm(new URL(`separator.${extension}`,directory),{force:true});
  }
 }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 return {name,size:bytes.length};
}

export async function saveGuildSeparator(guildId,attachment,{imageFetch=readLimited}={}){
 try{
  const url=attachment?.url;
  if(typeof guildId!=='string'||!/^\d{17,22}$/.test(guildId)||
   !Number.isSafeInteger(attachment?.size)||attachment.size<1||attachment.size>MAX_BYTES||
   !validAttachmentUrl(url))throw Error('Invalid separator upload');
  // Keep commit and old-format cleanup in upload order for each server.
  const previous=pending.get(guildId)||Promise.resolve();
  const operation=previous.catch(()=>{}).then(()=>save(guildId,url,imageFetch));
  pending.set(guildId,operation);
  try{return await operation;}
  finally{if(pending.get(guildId)===operation)pending.delete(guildId);}
 }catch{throw Error(SAFE_ERROR);}
}
