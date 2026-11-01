import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const doctor=fileURLToPath(new URL('../tools/check-config.mjs',import.meta.url));
const env={...process.env,DISCORD_TOKEN:'',UNSPLASH_ACCESS_KEY:'',FANART_API_KEY:'',GUILD_ID:'',AUTO_FETCH:'true',SOURCE_ONLY:'true',WALLHAVEN_ENABLED:'true',ENABLE_SOURCE_CHANNELS:'false',FANART_MOVIE_IDS:'tt1375666'};
function run(extra={}){
 const result=spawnSync(process.execPath,[doctor],{env:{...env,...extra},encoding:'utf8'});
 if(result.error)throw result.error;return result;
}
const missing=run();assert.equal(missing.status,1);assert(missing.stdout.includes('DISCORD_TOKEN'));
const privateValues={DISCORD_TOKEN:'dummy-token-never-display',UNSPLASH_ACCESS_KEY:'dummy-access-never-display',FANART_API_KEY:'dummy-fanart-never-display'};
const configured=run(privateValues);assert.equal(configured.status,0,configured.stdout);
for(const value of Object.values(privateValues))assert(!configured.stdout.includes(value));
assert.equal(run({...privateValues,SOURCE_ONLY:'yes'}).status,1);
assert.equal(run({...privateValues,GUILD_ID:'wrong'}).status,1);
assert.equal(run({...privateValues,FANART_API_KEY:'YOUR_FANART_API_KEY'}).status,1);
assert.equal(run({...privateValues,FANART_MOVIE_IDS:'not-an-imdb-id'}).status,1);
console.log('PASS: startup configuration diagnostics identify missing/placeholders and invalid settings without exposing secrets');
