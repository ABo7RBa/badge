import fs from 'node:fs/promises';
import {AttachmentBuilder} from 'discord.js';
import sharp from 'sharp';

const MAX_BYTES=8*1024*1024;
const extensions=['png','jpg','jpeg','webp'];

async function readSeparator(directory,validate=false){
 for(const extension of extensions){
  const name=`separator.${extension}`;
  let file;
  try{file=await fs.open(new URL(name,directory),'r');}
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  try{
   const stat=await file.stat();
   if(!stat.isFile()||stat.size<1||stat.size>MAX_BYTES)throw Error('Invalid separator size');
   // Read at most the expected size plus one byte, also rejecting a file that
   // changes while being read. The original image bytes are never transformed.
   const bytes=Buffer.alloc(stat.size+1);let length=0;
   while(length<bytes.length){
    const {bytesRead}=await file.read(bytes,length,bytes.length-length,null);
    if(!bytesRead)break;
    length+=bytesRead;
   }
   if(length!==stat.size)throw Error('Separator changed while reading');
   const original=bytes.subarray(0,length);
   if(validate){
    const options={limitInputPixels:40_000_000,animated:false,failOn:'warning'};
    const info=await sharp(original,options).metadata();
    const format=info.format==='jpeg'?'jpg':info.format;
    if(!['png','jpg','webp'].includes(format)||info.pages!=null&&info.pages!==1||
     !info.width||!info.height||info.width*info.height>40_000_000||
     format!==(extension==='jpeg'?'jpg':extension))throw Error('Invalid saved separator');
    await sharp(original,options).stats();
   }
   return {name,bytes:original};
  }finally{await file.close();}
 }
 return null;
}

export async function sendPostSeparator(channel,{guildId,shouldContinue=()=>true}={}){
 try{
  if(process.env.POST_SEPARATOR_ENABLED==='false'||!shouldContinue())return false;
  let image;
  if(typeof guildId==='string'&&/^\d{17,22}$/.test(guildId)){
   image=await readSeparator(new URL(`../storage/separators/${guildId}/`,import.meta.url),true);
  }
  if(!image)image=await readSeparator(new URL('../media/',import.meta.url));
  if(!image||!shouldContinue())return false;
  await channel.send({files:[new AttachmentBuilder(image.bytes,{name:image.name})],allowedMentions:{parse:[]}});
  return true;
 }catch{
  console.warn('Post separator could not be sent.');
  return false;
 }
}
