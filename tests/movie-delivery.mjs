// A fetched movie pair is not consumed until Discord actually accepts the post.
// All requests/sends are mocked; Fanart parsing, sharp and persisted state are real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generatedPair} from './fixtures.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-movie-delivery-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 const fixture=await generatedPair(13);
 await fs.writeFile(path.join(temp,'poster.png'),fixture.avatar);
 await fs.writeFile(path.join(temp,'background.png'),fixture.banner);
 const alternative=await generatedPair(27);
 await fs.writeFile(path.join(temp,'alternative-poster.png'),alternative.avatar);
 await fs.writeFile(path.join(temp,'alternative-background.png'),alternative.banner);
 const output=execFileSync(process.execPath,['--input-type=module','-'],{cwd:temp,encoding:'utf8',input:`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {importImages,post,handleInteraction} from './src/bot.js';
import {MessageFlags} from 'discord.js';
import {guild,makeRoom,store,save,loadStore,migrateLegacySettings} from './src/db.js';
process.env.FANART_API_KEY='movie-delivery-test-key';
process.env.FANART_MOVIE_IDS='tt1375666';process.env.AUTO_FETCH='true';
process.env.SHOW_IMAGE_CREDITS='false';
const poster=await fs.readFile('poster.png'),background=await fs.readFile('background.png');
const alternativePoster=await fs.readFile('alternative-poster.png'),alternativeBackground=await fs.readFile('alternative-background.png');
let mode='ok',apiCalls=0,imageCalls=0;
globalThis.fetch=async raw=>{
 const url=new URL(raw);
 if(url.hostname==='webservice.fanart.tv'){
  apiCalls++;
  if(mode==='api-error')return Response.json({}, {status:503});
  if(mode==='duplicate-artwork')return Response.json({imdb_id:'tt1375666',name:'Example Movie',
   movieposter:[{id:'333',url:'https://assets.fanart.tv/fanart/movies/27205/duplicate-poster.png'},{id:'444',url:'https://assets.fanart.tv/fanart/movies/27205/alternative-poster.png'}],
   moviebackground:[{id:'555',url:'https://assets.fanart.tv/fanart/movies/27205/duplicate-background.png'},{id:'666',url:'https://assets.fanart.tv/fanart/movies/27205/alternative-background.png'}]});
  return Response.json({imdb_id:'tt1375666',name:'Example Movie',
   movieposter:[{id:'111',url:'https://assets.fanart.tv/fanart/movies/27205/poster.png'}],
   moviebackground:[{id:'222',url:'https://assets.fanart.tv/fanart/movies/27205/background.png'}]});
 }
 if(url.hostname==='assets.fanart.tv'){
  imageCalls++;
  const bytes=url.pathname.endsWith('alternative-poster.png')?alternativePoster:url.pathname.endsWith('alternative-background.png')?alternativeBackground:url.pathname.endsWith('poster.png')?poster:background;
  return new Response(bytes,{headers:{'content-type':'image/png'}});
 }
 throw Error('Unexpected live network destination');
};
function destination(gid,{fail=false}={}){
 const messages=[],g=guild(gid),room=g.rooms.room=makeRoom('movies');
 const state={fail,attempts:0};
 const client={user:{id:'bot'},channels:{fetch:async()=>({guildId:gid,isTextBased:()=>true,
  permissionsFor:()=>({has:()=>true}),send:async payload=>{
   state.attempts++;if(state.sendGate)await state.sendGate();
   if(state.fail)throw Error('test Discord send denied');messages.push(payload);
  }})}};
 return {gid,g,room,messages,state,client};
}

// The documented manual fetch -> publish sequence must send the freshly fetched
// movie even when this film has just one usable poster/background pair.
const manual=destination('manual-then-post');
assert.match(await importImages(manual.gid,'movies',true),/^✅/);
assert.equal(manual.g.packs.length,1);
const prepared=manual.g.packs[0];
assert.equal(prepared.deliveryState,'pending');
const callsBefore=apiCalls,imagesBefore=imageCalls;
assert.match(await post(manual.client,manual.gid,'room',{forced:true}),/تم النشر/);
assert(apiCalls>callsBefore,'a prepared pair must be revalidated at the website');
assert(imageCalls>imagesBefore,'publication must use freshly downloaded website image bytes');
assert.equal(manual.messages.length,1);assert.equal(manual.room.count,1);
assert.equal(manual.g.packs.length,1,'refreshing an unused pair does not duplicate its stored record');
assert.equal(manual.g.packs[0].id,prepared.id);assert.equal(manual.g.packs[0].deliveryState,'published');
assert.deepEqual(manual.room.usedIds,[prepared.id]);
assert.equal(manual.messages[0].files.length,1);
assert(manual.messages[0].files[0].attachment.length>1000);
assert.equal(manual.messages[0].embeds[0].toJSON().description,undefined);
const noRepeat=await post(manual.client,manual.gid,'room',{forced:true});
assert.equal(manual.messages.length,1,'published movie images must never be recycled');
assert(!noRepeat.includes('تم النشر'));
// Fanart can assign new IDs to visually identical artwork. A rejected duplicate
// must let the adapter try the next pair rather than failing the whole import.
mode='duplicate-artwork';
assert.match(await post(manual.client,manual.gid,'room',{forced:true}),/تم النشر/);
assert.equal(manual.messages.length,2);assert.equal(manual.room.count,2);
assert.deepEqual(manual.g.packs.at(-1).sourceIds,['fanart:art:444','fanart:art:666']);
mode='ok';

// A rejected Discord send is not publication. Persisted pending metadata survives
// a restart, but the retry still needs a successful live provider request.
const retry=destination('failed-send-retry',{fail:true});
assert.match(await post(retry.client,retry.gid,'room',{forced:true}),/test Discord send denied/);
assert.equal(retry.messages.length,0);assert.equal(retry.room.count,0);
assert.deepEqual(retry.room.usedIds,[]);assert.equal(retry.g.packs.length,1);
assert.equal(retry.g.packs[0].deliveryState,'pending');
save();const reloaded=loadStore();
assert.equal(reloaded.guilds[retry.gid].packs[0].deliveryState,'pending');
store.guilds[retry.gid]=reloaded.guilds[retry.gid];
retry.state.fail=false;
const beforeRetry=apiCalls;
assert.match(await post(retry.client,retry.gid,'room',{forced:true}),/تم النشر/);
assert(apiCalls>beforeRetry);assert.equal(retry.state.attempts,2);
assert.equal(retry.messages.length,1);assert.equal(store.guilds[retry.gid].rooms.room.count,1);
assert.equal(store.guilds[retry.gid].packs[0].deliveryState,'published');

// Two movie rooms in the same guild cannot race to publish the same pending
// pair while the first Discord request is still in flight.
mode='ok';const simultaneous=destination('concurrent-movie-rooms');
simultaneous.g.rooms.second=makeRoom('movies');
let release,reached;
const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{reached=resolve;});
simultaneous.state.sendGate=async()=>{reached();await gate;};
const firstPost=post(simultaneous.client,simultaneous.gid,'room',{forced:true});
await ready;const requestsWhileSending=apiCalls;
const secondPost=post(simultaneous.client,simultaneous.gid,'second',{forced:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(apiCalls,requestsWhileSending,'second room waits until the first pair is committed as published');
assert.equal(simultaneous.state.attempts,1);
release();await Promise.all([firstPost,secondPost]);
assert.equal(simultaneous.messages.length,1,'a shared one-pair movie catalogue can produce only one publication');
assert.equal(simultaneous.room.count+simultaneous.g.rooms.second.count,1);

// An online failure may never silently send the cached/prepared image instead.
const unavailable=destination('pending-source-failure');
mode='ok';assert.match(await importImages(unavailable.gid,'movies',true),/^✅/);
assert.equal(unavailable.g.packs[0].deliveryState,'pending');
mode='api-error';const beforeFailure=apiCalls;
const failure=await post(unavailable.client,unavailable.gid,'room',{forced:true});
assert(apiCalls>beforeFailure);assert.equal(unavailable.messages.length,0);
assert.equal(unavailable.room.count,0);assert.equal(unavailable.g.packs[0].deliveryState,'pending');
assert.match(failure,/503|تعذر/);
// An explicit /نشر-الآن retries immediately after the operator fixes a source.
mode='ok';const afterFailure=apiCalls;
assert.match(await post(unavailable.client,unavailable.gid,'room',{forced:true}),/تم النشر/);
assert(apiCalls>afterFailure);assert.equal(unavailable.messages.length,1);

// A legacy successful fetch can recover its one known-unused pending record.
// Older ambiguous records remain consumed; existing history is never reset.
const template=manual.g.packs[0];
const legacy={guilds:{old:{rooms:{room:{...makeRoom('movies'),usedIds:['old-sent'],lastId:'old-sent'}},
 packs:['old-sent','old-pending','old-unknown'].map(id=>({...template,id,deliveryState:undefined})),
 fetchStatus:{movies:{state:'success',recordId:'old-pending',retryAt:Date.now()+300000}},fetchAt:{movies:Date.now()}}}};
assert(migrateLegacySettings(undefined,legacy));
const upgraded=legacy.guilds.old;
assert.equal(upgraded.packs[0].deliveryState,'published');assert.equal(upgraded.packs[1].deliveryState,'pending');
assert.equal(upgraded.packs[2].deliveryState,'published');assert.deepEqual(upgraded.rooms.room.usedIds,['old-sent']);
assert.equal(upgraded.fetchStatus.movies,undefined);assert.equal(upgraded.fetchAt.movies,0);
assert.equal(migrateLegacySettings(undefined,legacy),false);
// The real diagnostic handler is private and never publishes to its target.
mode='ok';const diagnostic=destination('private-movie-diagnostic');
let diagnosticReply;
const interaction={guildId:diagnostic.gid,channelId:'room',commandName:'فحص-الأفلام',deferred:false,
 memberPermissions:{has:()=>true},options:{getChannel:()=>({id:'room'}),getString:()=> 'movies'},
 isAutocomplete:()=>false,isChatInputCommand:()=>true,
 async deferReply(payload){assert.equal(payload.flags,MessageFlags.Ephemeral);this.deferred=true;},
 async editReply(payload){diagnosticReply=typeof payload==='string'?payload:payload.content;},
 async reply(payload){diagnosticReply=payload.content;}};
await handleInteraction(interaction,diagnostic.client);
assert.match(diagnosticReply,/فحص الأفلام/);assert.match(diagnosticReply,/غير المستخدمة/);
assert.match(diagnosticReply,/نجح تجهيز بطاقة الفيلم/);assert.match(diagnosticReply,/لم يُرسل أي منشور/);
assert(!diagnosticReply.includes(process.env.FANART_API_KEY));
assert.equal(diagnostic.messages.length,0);assert.equal(diagnostic.state.attempts,0);assert.equal(diagnostic.room.count,0);
assert.equal(diagnostic.g.packs[0].deliveryState,'pending');
// The already-registered fetch command also returns the useful report, so users
// can diagnose without waiting for a new global slash command to appear.
interaction.commandName='جلب-صور';interaction.options.getChannel=()=>null;
await handleInteraction(interaction,diagnostic.client);
assert.match(diagnosticReply,/غير المستخدمة/);assert.equal(diagnostic.messages.length,0);
assert.equal(diagnostic.g.packs.length,1);assert.equal(diagnostic.g.packs[0].deliveryState,'pending');
console.log('PASS: manual-fetch movie delivery, online pending refresh, persisted failed-send retry, concurrent room locking, no repetition and no cached-image fallback');
`});
 process.stdout.write(output);assert(output.includes('PASS:'));
}finally{await fs.rm(temp,{recursive:true,force:true});}
