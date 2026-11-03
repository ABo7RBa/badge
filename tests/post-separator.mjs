import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {AttachmentBuilder,Client,MessagePayload} from 'discord.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-separator-'));
const previousFlag=process.env.POST_SEPARATOR_ENABLED;
const previousWarn=console.warn,warnings=[];
const client=new Client({intents:[]});
const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const delivered=[];
const channel={send:async options=>{
 const keys=Object.keys(options).sort();
 assert.equal(options.files.length,1);
 assert(options.files[0] instanceof AttachmentBuilder);
 const payload=MessagePayload.create({client},options).resolveBody();
 await payload.resolveFiles();
 delivered.push({keys,body:payload.body,files:payload.files});
 return {id:String(delivered.length)};
}};
const asset=extension=>path.join(tmp,'media',`separator.${extension}`);
const assertOriginal=(message,bytes,name)=>{
 assert.deepEqual(message.keys,['allowedMentions','files']);
 assert.equal(message.files.length,1);
 assert.equal(message.files[0].name,name);
 assert.deepEqual(message.files[0].data,bytes,'Discord receives the exact original file bytes');
 assert.equal(message.body.attachments.length,1);
 assert.deepEqual(message.body.allowed_mentions,{parse:[]});
 for(const field of ['content','embeds','components','flags','message_reference']){
  assert.equal(message.body[field],undefined,`${field} must not add text, UI, or reply/private behavior`);
 }
};

try{
 await fs.mkdir(path.join(tmp,'src'));
 await fs.copyFile(path.join(root,'src/post-separator.js'),path.join(tmp,'src/post-separator.js'));
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
 const {sendPostSeparator}=await import(pathToFileURL(path.join(tmp,'src/post-separator.js')).href);
 console.warn=(...args)=>warnings.push(args);
 delete process.env.POST_SEPARATOR_ENABLED;

 // Existing deployments may have no supplied divider asset at all.
 assert.equal(await sendPostSeparator(channel),false);
 assert.equal(delivered.length,0);assert.deepEqual(warnings,[]);
 await fs.mkdir(path.join(tmp,'media'));
 await fs.writeFile(path.join(tmp,'media','unrelated.png'),original);
 assert.equal(await sendPostSeparator(channel),false,'only the fixed separator filename is used');

 // All supported extensions retain their filename and original bytes, with no
 // Discord text, buttons, embed, or image conversion added by the helper.
 for(const extension of ['png','jpg','jpeg','webp']){
  const bytes=Buffer.concat([original,Buffer.from(`original-${extension}`)]);
  await fs.writeFile(asset(extension),bytes);
  const before=await fs.stat(asset(extension));
  const count=delivered.length;
  assert.equal(await sendPostSeparator(channel),true);
  assert.equal(delivered.length,count+1);
  assertOriginal(delivered.at(-1),bytes,`separator.${extension}`);
  assert.deepEqual(await fs.readFile(asset(extension)),bytes);
  assert.equal((await fs.stat(asset(extension))).mtimeMs,before.mtimeMs,'reading must not rewrite the asset');
  await fs.rm(asset(extension));
 }

 await fs.writeFile(asset('png'),original);
 await fs.writeFile(asset('jpg'),Buffer.from('second fixed filename'));
 assert.equal(await sendPostSeparator(channel),true);
 assertOriginal(delivered.at(-1),original,'separator.png');
 await fs.rm(asset('jpg'));

 let count=delivered.length;
 process.env.POST_SEPARATOR_ENABLED='false';
 assert.equal(await sendPostSeparator(channel),false);
 assert.equal(delivered.length,count);
 delete process.env.POST_SEPARATOR_ENABLED;

 let checks=0;
 assert.equal(await sendPostSeparator(channel,{shouldContinue:()=>{checks++;return false;}}),false);
 assert.equal(checks,1,'cancellation before reading skips the send');
 checks=0;
 assert.equal(await sendPostSeparator(channel,{shouldContinue:()=>++checks<2}),false);
 assert.equal(checks,2,'cancellation after reading skips the send');
 assert.equal(delivered.length,count);assert.deepEqual(warnings,[]);
 assert.deepEqual(await fs.readFile(asset('png')),original);

 // The inclusive size boundary is allowed; a larger file is rejected before
 // sending and stays untouched. No real Discord/network requests are made.
 const limit=8*1024*1024;
 const maximum=Buffer.alloc(limit,0x35);
 await fs.writeFile(asset('png'),maximum);
 assert.equal(await sendPostSeparator(channel),true);
 assertOriginal(delivered.at(-1),maximum,'separator.png');
 const oversized=await fs.open(asset('png'),'r+');
 await oversized.truncate(limit+1);await oversized.close();
 count=delivered.length;
 assert.equal(await sendPostSeparator(channel),false);
 assert.equal(delivered.length,count);
 assert.equal((await fs.stat(asset('png'))).size,limit+1);
 assert.deepEqual(warnings.splice(0),[['Post separator could not be sent.']]);

 // Failures are contained and logs never include raw read/send error details.
 await fs.writeFile(asset('png'),original);
 const before=await fs.stat(asset('png'));
 assert.equal(await sendPostSeparator({send:async()=>{throw Error('private send error detail');}}),false);
 assert.deepEqual(warnings.splice(0),[['Post separator could not be sent.']]);
 assert.deepEqual(await fs.readFile(asset('png')),original);
 assert.equal((await fs.stat(asset('png'))).mtimeMs,before.mtimeMs);
 await fs.rm(asset('png'));
 await fs.mkdir(asset('png'));
 assert.equal(await sendPostSeparator(channel),false,'non-file read errors stay local');
 assert.deepEqual(warnings.splice(0),[['Post separator could not be sent.']]);
 assert.equal(delivered.length,count);
 await assert.rejects(fs.stat(path.join(tmp,'storage')),{code:'ENOENT'});
 console.log('PASS: original separator bytes, attachment-only Discord payload, cancellation, opt-out, size limit and contained failures');
}finally{
 console.warn=previousWarn;
 if(previousFlag===undefined)delete process.env.POST_SEPARATOR_ENABLED;else process.env.POST_SEPARATOR_ENABLED=previousFlag;
 client.destroy();
 await fs.rm(tmp,{recursive:true,force:true});
}
