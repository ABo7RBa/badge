// The on-host diagnostic must be useful without disclosing keys, request URLs,
// provider bodies, Discord tokens, or writing any bot state.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runMovieDiagnostics} from '../tools/check-movies.mjs';
import {generatedPair} from './fixtures.mjs';
import {formatMovieReport,explainMovieReport,sanitizeMovieReport} from '../src/movie-diagnostics.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const secret='diagnostic-secret-key+/do-not-display';
const discordSecret='discord-token-never-display';
const report={configuredFilms:2,legacySkippedFilms:0,filmsChecked:2,invalidMetadata:0,
 validPosters:2,validBackgrounds:2,unusedPosters:2,unusedBackgrounds:2,
 imagesAttempted:2,imagesFailed:0,pairsChecked:1,
 rejections:{colors:0,duplicate:0,avatar_resolution:0,banner_resolution:0,banner_aspect:0,invalid_image:0,other:0},continuation:false};
const fixture=await generatedPair(31);
const candidate={...fixture,provider:'Fanart.tv',category:'movies'};
async function run(fetchMovie,extra={}){
 const lines=[];
 const code=await runMovieDiagnostics({fetchMovie,env:{FANART_API_KEY:secret,FANART_MOVIE_IDS:'tt1375666,tt0816692',DISCORD_TOKEN:discordSecret,...extra},write:line=>lines.push(line)});
 const text=lines.join('\n');
 for(const value of [secret,encodeURIComponent(secret),discordSecret,'RAW_PROVIDER_BODY'])assert(!text.includes(value),'diagnostic leaked private data');
 assert(!/https?:\/\//i.test(text),'diagnostic must not print request/source URLs');
 return {code,text,lines};
}
let calls=0;
const success=await run(async(seen,options)=>{
 calls++;assert(seen instanceof Set);assert.equal(seen.size,0);
 assert.equal(options.apiKey,secret);assert.deepEqual(options.ids,['tt1375666','tt0816692']);
 assert.equal(typeof options.onReport,'function');await options.onReport({...report});return candidate;
});
assert.equal(success.code,0);assert.equal(calls,1);assert.match(success.text,/Node\.js/);assert.match(success.text,/نسخة البوت/);
assert.match(success.text,/عدد الأفلام المضبوطة: 2/);assert.match(success.text,/✅/);assert.match(success.text,/لم تُرسل أي رسالة/);

const missing=await run(async()=>assert.fail('missing key must not call the provider'),{FANART_API_KEY:''});
assert.equal(missing.code,1);assert.match(missing.text,/FANART_API_KEY/);
const placeholder=await run(async()=>assert.fail('placeholder must not call provider'),{FANART_API_KEY:'YOUR_FANART_API_KEY'});
assert.equal(placeholder.code,1);
const invalidIds=await run(async()=>assert.fail('invalid film list must not call provider'),{FANART_MOVIE_IDS:secret});
assert.equal(invalidIds.code,1);assert.match(invalidIds.text,/FANART_MOVIE_IDS/);
const empty=await run(async(seen,{onReport})=>{await onReport({...report,pairsChecked:0,validPosters:0,validBackgrounds:0});return null;});
assert.equal(empty.code,1);assert.match(empty.text,/لم يجد الفحص/);
const malformed=await run(async()=>({provider:'Fanart.tv'}));assert.equal(malformed.code,1);assert.match(malformed.text,/غير مكتملة/);

for(const fields of [{status:401},{status:403},{status:429},{status:503},{code:'FANART_IMAGE_NETWORK'},{code:'FANART_SEARCH_CONTINUES'},{code:'FANART_API_AUTH'},{code:'FANART_API_ERROR'},{}]){
 const result=await run(async(seen,{onReport})=>{
  await onReport({...report});
  throw Object.assign(Error('RAW_PROVIDER_BODY https://provider.invalid/?api_key='+encodeURIComponent(secret)+' Authorization: '+discordSecret),fields);
 });
 assert.equal(result.code,1);assert.match(result.text,/❌/);
 if(fields.status)assert(result.text.includes(String(fields.status)));
}

// Running the real CLI with a missing key exits safely without network activity
// or creating/changing storage, even when unrelated private settings exist.
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'abo-movie-diagnostic-'));
try{
 await fs.cp(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
 await fs.mkdir(path.join(temp,'tools'));
 await fs.copyFile(path.join(root,'tools','check-movies.mjs'),path.join(temp,'tools','check-movies.mjs'));
 await fs.copyFile(path.join(root,'package.json'),path.join(temp,'package.json'));
 await fs.symlink(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
 await fs.mkdir(path.join(temp,'storage'));
 const original=JSON.stringify({version:9,guilds:{}});await fs.writeFile(path.join(temp,'storage','state.json'),original);
 const result=spawnSync(process.execPath,['tools/check-movies.mjs'],{cwd:temp,env:{...process.env,FANART_API_KEY:'',DISCORD_TOKEN:discordSecret},encoding:'utf8',timeout:10000});
 if(result.error)throw result.error;
 assert.equal(result.status,1,result.stderr);assert.match(result.stdout,/FANART_API_KEY/);
 assert(!result.stdout.includes(discordSecret));assert.equal(result.stderr,'');
 assert.equal(await fs.readFile(path.join(temp,'storage','state.json'),'utf8'),original);
 assert.deepEqual((await fs.readdir(path.join(temp,'storage'))).sort(),['state.json']);
}finally{await fs.rm(temp,{recursive:true,force:true});}
console.log('PASS: movie-host diagnostic reports status safely, distinguishes empty/auth/CDN failures, hides raw secrets/URLs and preserves state');

// Reports explain the empty-result branches and discard unexpected secret fields.
assert.match(explainMovieReport({...report,configuredFilms:2,legacySkippedFilms:2}),/سجل استخدام قديم/);
assert.match(explainMovieReport({...report,invalidMetadata:2}),/لا يطابق/);
assert.match(explainMovieReport({...report,unusedPosters:0}),/مسجلة مستخدمة/);
assert.match(explainMovieReport({...report,pairsChecked:2,rejections:{colors:2}}),/ألوان غير متناسقة/);
const sanitized=sanitizeMovieReport({...report,requestURL:'https://private.invalid/?api_key='+secret,apiStatus:200,apiContentType:'json',schema:{imdbMatches:false,nameType:secret,postersArray:false,backgroundsArray:false}});
assert(!JSON.stringify(sanitized).includes(secret));assert.equal(sanitized.schema.nameType,'unknown');
assert.match(formatMovieReport(sanitized),/HTTP 200/);
console.log('PASS: explicit movie empty-result explanations, source HTTP metadata and report-field allowlisting');
