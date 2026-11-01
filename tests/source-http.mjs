import assert from 'node:assert/strict';
import {sourceJson} from '../src/source-utils.js';
const secret='test-private-value-never-echo';
for(const status of [401,403,404,429,500]){
 await assert.rejects(sourceJson('https://service.test/',{source:'Test Source',apiFetch:async()=>({ok:false,status,json:async()=>{throw Error(secret);}})}),error=>error.status===status&&!error.message.includes(secret));
}
for(const apiFetch of [async()=>{throw Error(secret);},async()=>({ok:true,json:async()=>{throw SyntaxError(secret);}})]){
 await assert.rejects(sourceJson('https://service.test/',{source:'Test Source',apiFetch}),error=>error.message.includes('Test Source')&&!error.message.includes(secret));
}
const result=await sourceJson(new URL('https://service.test/data'),{source:'Test',headers:{'api-key':secret},apiFetch:async(url,options)=>{
 assert.equal(url,'https://service.test/data');assert.equal(options.redirect,'error');assert.equal(options.headers['api-key'],secret);assert(options.signal instanceof AbortSignal);
 return {ok:true,json:async()=>({valid:true})};
}});
assert.equal(result.valid,true);
console.log('PASS: source transport preserves HTTP status, uses verified HTTPS configuration and never exposes raw request/response errors');
