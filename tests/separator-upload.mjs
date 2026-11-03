import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {Client,MessagePayload} from 'discord.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-separator-upload-'));
const first='123456789012345678',second='223456789012345678',absent='923456789012345678';
const source='https://cdn.discordapp.com/attachments/323456789012345678/423456789012345678/divider.png?ex=123&is=456&hm=signed-test-value';
const attachment=(bytes,url=source)=>({url,size:bytes.length,name:'untrusted-name.gif',contentType:'application/octet-stream'});
const stored=(gid,name)=>path.join(tmp,'storage','separators',gid,name);
const safeErrors={
 SEPARATOR_INVALID_ATTACHMENT:'تعذر قراءة المرفق. استخدم الأمر داخل السيرفر وأرفق الصورة من جهازك.',
 SEPARATOR_INVALID_SIZE:'حجم صورة الفاصل يجب أن يكون أكبر من صفر ولا يتجاوز 8MB.',
 SEPARATOR_UNSUPPORTED_URL:'رابط المرفق غير مدعوم. ارفع الصورة مباشرة في خيار image للأمر.',
 SEPARATOR_DOWNLOAD_FAILED:'تعذر تنزيل صورة الفاصل من Discord. أعد رفع الصورة وحاول مرة أخرى.',
 SEPARATOR_IMAGE_INVALID:'صورة الفاصل غير صالحة. استخدم PNG أو JPEG أو WebP ثابتة لا تتجاوز 40 مليون بكسل.',
 SEPARATOR_STORAGE_FAILED:'تعذر حفظ صورة الفاصل على الاستضافة. تحقق من صلاحية الكتابة ومساحة القرص.'
};
const oldFetch=globalThis.fetch,oldWarn=console.warn,oldFlag=process.env.POST_SEPARATOR_ENABLED;
const warnings=[],client=new Client({intents:[]});
try{
 await fs.cp(path.join(root,'src'),path.join(tmp,'src'),{recursive:true});
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 const {saveGuildSeparator}=await import(pathToFileURL(path.join(tmp,'src/separator-upload.js')).href);
 const {sendPostSeparator}=await import(pathToFileURL(path.join(tmp,'src/post-separator.js')).href);
 delete process.env.POST_SEPARATOR_ENABLED;
 console.warn=(...args)=>warnings.push(args);
 const canvas=color=>sharp({create:{width:96,height:12,channels:3,background:color}});
 const png=await canvas('#183b87').png().toBuffer();
 const texture=Buffer.from(Array.from({length:96*12*3},(_,index)=>index*37%256));
 const jpeg=await sharp(texture,{raw:{width:96,height:12,channels:3}}).jpeg().toBuffer();
 const webp=await canvas('#3b8718').webp().toBuffer();
 const reject=(operation,code)=>assert.rejects(operation,error=>{
  assert.equal(error.code,code);assert.equal(error.message,safeErrors[code]);
  assert.equal(error.cause,undefined);assert.deepEqual(Object.keys(error),['code']);
  assert(!error.stack.includes('signed-test-value'));assert(!error.stack.includes('private failure detail'));
  assert(!JSON.stringify(error).includes('https://'));
  return true;
 });
 let reads=0;
 const fetchPng=async url=>{reads++;assert.equal(url,source);return png;};

 // Untrusted routing, declared sizes and URLs must fail before downloading.
 for(const gid of ['../outside','123','1'.repeat(23),123456789012345678,null]){
  await reject(saveGuildSeparator(gid,attachment(png),{imageFetch:fetchPng}),'SEPARATOR_INVALID_ATTACHMENT');
 }
 for(const value of [null,undefined,'not an attachment',[]]){
  await reject(saveGuildSeparator(first,value,{imageFetch:fetchPng}),'SEPARATOR_INVALID_ATTACHMENT');
 }
 for(const size of [undefined,null,0,-1,1.5,8*1024*1024+1,'12']){
  await reject(saveGuildSeparator(first,{...attachment(png),size},{imageFetch:fetchPng}),'SEPARATOR_INVALID_SIZE');
 }
 for(const url of [
  'http://cdn.discordapp.com/attachments/323456789012345678/423456789012345678/divider.png',
  source.replace('cdn.discordapp.com','cdn.discordapp.com.evil.example'),
  source.replace('cdn.discordapp.com','user:password@cdn.discordapp.com'),
  source.replace('cdn.discordapp.com','cdn.discordapp.com:443'),
  source.replace('/attachments/','/other/'),
  source.replace('/attachments/','/ephemeral-attachments-evil/'),
  source.replace('/attachments/','/attachments/ephemeral-attachments/'),
  source.replace('divider.png','../divider.png'),
  source.replace('divider.png','%2e%2e'),
  source.replace('divider.png','bad%2ffile.png'),
  source.replace('divider.png','bad\\file.png'),
  source+'#fragment','file:///tmp/separator.png'
 ]){
  await reject(saveGuildSeparator(first,attachment(png,url),{imageFetch:fetchPng}),'SEPARATOR_UNSUPPORTED_URL');
  await reject(saveGuildSeparator(first,attachment(png,url.replace('/attachments/','/ephemeral-attachments/')),
   {imageFetch:fetchPng}),'SEPARATOR_UNSUPPORTED_URL');
 }
 assert.equal(reads,0);

 const saved=await saveGuildSeparator(first,attachment(png),{imageFetch:fetchPng});
 assert.deepEqual(saved,{name:'separator.png',size:png.length});
 assert.deepEqual(await fs.readFile(stored(first,saved.name)),png,'stored data is the original upload, not re-encoded');
 assert.equal((await fs.stat(stored(first,saved.name))).mode&0o777,0o600);
 const mutable=attachment(png);
 const validated=saveGuildSeparator(first,mutable,{imageFetch:fetchPng});
 mutable.url='https://example.com/unvalidated-image.png';
 await validated; // Queued work must retain the URL that was actually validated.
 for(const host of ['cdn.discordapp.com','media.discordapp.net']){
  for(const prefix of ['attachments','ephemeral-attachments']){
   const url=source.replace('cdn.discordapp.com',host).replace('/attachments/',`/${prefix}/`);
   assert.deepEqual(await saveGuildSeparator(first,attachment(png,url),{imageFetch:async received=>{
    assert.equal(received,url,'signed regular and slash-command attachment URLs are preserved');return png;
   }}),{name:'separator.png',size:png.length});
  }
 }
 const tiny=await sharp({create:{width:1,height:1,channels:3,background:'#183b87'}}).png().toBuffer();
 const tinyUrl=source.replace('/attachments/','/ephemeral-attachments/');
 assert.deepEqual(await saveGuildSeparator(first,attachment(tiny,tinyUrl),{imageFetch:async()=>tiny}),
  {name:'separator.png',size:tiny.length},'tiny valid dividers have no minimum dimensions');
 assert.deepEqual(await fs.readFile(stored(first,'separator.png')),tiny);
 const proxy=source.replace('cdn.discordapp.com','media.discordapp.net');
 assert.deepEqual(await saveGuildSeparator(second,attachment(webp,proxy),{imageFetch:async url=>{
  assert.equal(url,proxy);return new Uint8Array(webp);
 }}),{name:'separator.webp',size:webp.length});

 // Default transport preserves signed URLs, bounds reads, rejects redirects,
 // and never includes authorization in an image request.
 const ephemeral=source.replace('/attachments/','/ephemeral-attachments/');
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,ephemeral);assert.equal(options.redirect,'error');
  assert.equal(new Headers(options.headers).get('authorization'),null);
  return new Response(jpeg,{headers:{'content-type':'image/jpeg','content-length':String(jpeg.length)}});
 };
 assert.deepEqual(await saveGuildSeparator(first,attachment(jpeg,ephemeral)),{name:'separator.jpg',size:jpeg.length});
 assert.deepEqual(await fs.readdir(path.dirname(stored(first,'separator.jpg'))),['separator.jpg']);
 await reject(saveGuildSeparator('../outside',attachment(png),{imageFetch:fetchPng}),'SEPARATOR_INVALID_ATTACHMENT');
 await reject(saveGuildSeparator(first,{...attachment(png),size:0},{imageFetch:fetchPng}),'SEPARATOR_INVALID_SIZE');
 await reject(saveGuildSeparator(first,attachment(png,'https://example.com/image.png'),{imageFetch:fetchPng}),'SEPARATOR_UNSUPPORTED_URL');
 assert.deepEqual(await fs.readFile(stored(first,'separator.jpg')),jpeg,'invalid upload metadata leaves the saved image intact');
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://example.com/image.png'}});
 await reject(saveGuildSeparator(first,attachment(png)),'SEPARATOR_DOWNLOAD_FAILED');
 globalThis.fetch=async()=>new Response(Buffer.alloc(8*1024*1024+1),{headers:{'content-type':'image/png'}});
 await reject(saveGuildSeparator(first,attachment(png)),'SEPARATOR_DOWNLOAD_FAILED');
 assert.deepEqual(await fs.readFile(stored(first,'separator.jpg')),jpeg);

 const frames=Buffer.alloc(8*16*3,20);frames.fill(220,8*8*3);
 const animated=await sharp(frames,{raw:{width:8,height:16,channels:3,pageHeight:8}})
  .webp({loop:0,delay:[100,100]}).toBuffer();
 assert.equal((await sharp(animated).metadata()).pages,2);
 const truncated=jpeg.subarray(0,Math.floor(jpeg.length*.85));
 assert.equal((await sharp(truncated).metadata()).width,96,'the damaged fixture still has readable metadata');
 const tiff=await canvas('#123456').tiff().toBuffer();
 const tooManyPixels=await sharp({create:{width:8001,height:5000,channels:3,background:'#123456'}}).jpeg({quality:10}).toBuffer();
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(8*1024*1024+1),Buffer.from('corrupt image'),truncated,tiff,animated,tooManyPixels]){
  const code=!bytes.length||bytes.length>8*1024*1024?'SEPARATOR_INVALID_SIZE':'SEPARATOR_IMAGE_INVALID';
  await reject(saveGuildSeparator(first,attachment(png),{imageFetch:async()=>bytes}),code);
  assert.deepEqual(await fs.readFile(stored(first,'separator.jpg')),jpeg,'failed image validation preserves the previous divider');
 }
 for(const value of [null,'not image bytes',{}]){
  await reject(saveGuildSeparator(first,attachment(png),{imageFetch:async()=>value}),'SEPARATOR_IMAGE_INVALID');
 }
 await reject(saveGuildSeparator(first,attachment(png),{imageFetch:async()=>{
  throw Object.assign(Error('private failure detail '+source),{code:'SEPARATOR_IMAGE_INVALID'});
 }}),'SEPARATOR_DOWNLOAD_FAILED');
 assert.deepEqual(await fs.readFile(stored(first,'separator.jpg')),jpeg);

 // A failed atomic rename leaves the previous file usable and removes its temp.
 const originalRename=fs.rename;
 fs.rename=async()=>{throw Error('private failure detail '+source);};
 try{await reject(saveGuildSeparator(first,attachment(png),{imageFetch:async()=>png}),'SEPARATOR_STORAGE_FAILED');}
 finally{fs.rename=originalRename;}
 assert.deepEqual(await fs.readdir(path.dirname(stored(first,'separator.jpg'))),['separator.jpg']);
 assert.deepEqual(await fs.readFile(stored(first,'separator.jpg')),jpeg);

 // Concurrent format changes finish in invocation order and leave one asset.
 let release,started;
 const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
 const slow=saveGuildSeparator(first,attachment(png),{imageFetch:async()=>{started();await gate;return png;}});
 await ready;
 let secondStarted=false;
 const latest=saveGuildSeparator(first,attachment(webp),{imageFetch:async()=>{secondStarted=true;return webp;}});
 await Promise.resolve();assert.equal(secondStarted,false);
 release();await Promise.all([slow,latest]);
 assert.deepEqual(await fs.readdir(path.dirname(stored(first,'separator.webp'))),['separator.webp']);
 assert.deepEqual(await fs.readFile(stored(first,'separator.webp')),webp);
 assert.deepEqual(await fs.readFile(stored(second,'separator.webp')),webp,'another server is never modified');
 const failed=saveGuildSeparator(first,attachment(png),{imageFetch:async()=>{throw Error(source);}});
 const retried=saveGuildSeparator(first,attachment(webp),{imageFetch:async()=>webp});
 await Promise.all([reject(failed,'SEPARATOR_DOWNLOAD_FAILED'),retried]);
 assert.deepEqual(await fs.readFile(stored(first,'separator.webp')),webp,'a failed queued upload does not block a later valid upload');

 await fs.mkdir(path.join(tmp,'media'));
 await fs.writeFile(path.join(tmp,'media','separator.png'),png);
 const delivered=[];
 const channel={send:async options=>{
  assert.equal(options.content,undefined);assert.equal(options.embeds,undefined);assert.equal(options.components,undefined);
  const message=MessagePayload.create({client},options).resolveBody();await message.resolveFiles();
  assert.equal(message.files.length,1);delivered.push(message.files[0]);
 }};
 assert.equal(await sendPostSeparator(channel,{guildId:first}),true);
 assert.equal(delivered.at(-1).name,'separator.webp');assert.deepEqual(delivered.at(-1).data,webp);
 await saveGuildSeparator(second,attachment(jpeg),{imageFetch:async()=>jpeg});
 assert.equal(await sendPostSeparator(channel,{guildId:second}),true);
 assert.deepEqual(delivered.at(-1).data,jpeg);
 assert.equal(await sendPostSeparator(channel,{guildId:absent}),true);
 assert.deepEqual(delivered.at(-1).data,png,'only a missing guild asset uses the global fallback');
 const before=delivered.length;
 await fs.writeFile(stored(first,'separator.webp'),Buffer.from('corrupt saved file'));
 assert.equal(await sendPostSeparator(channel,{guildId:first}),false);
 assert.equal(delivered.length,before,'a corrupt saved asset must not silently send a different global image');
 assert.deepEqual(warnings.splice(0),[['Post separator could not be sent.']]);
 await saveGuildSeparator(first,attachment(webp),{imageFetch:async()=>webp});

 // Reload the delivery module to recover solely from persisted guild storage.
 const {sendPostSeparator:restarted}=await import(pathToFileURL(path.join(tmp,'src/post-separator.js')).href+'?restart=1');
 const restartBefore=delivered.length;
 assert.equal(await restarted(channel,{guildId:first}),true);
 assert.equal(delivered.length,restartBefore+1);
 assert.equal(delivered.at(-1).name,'separator.webp');assert.deepEqual(delivered.at(-1).data,webp);
 assert.deepEqual(await fs.readFile(stored(first,'separator.webp')),webp);
 assert.deepEqual(warnings,[]);
 console.log('PASS: signed regular/ephemeral separator uploads, private stage errors, exact bytes, atomic replacement and per-server recovery');
}finally{
 globalThis.fetch=oldFetch;console.warn=oldWarn;
 if(oldFlag===undefined)delete process.env.POST_SEPARATOR_ENABLED;else process.env.POST_SEPARATOR_ENABLED=oldFlag;
 client.destroy();await fs.rm(tmp,{recursive:true,force:true});
}
