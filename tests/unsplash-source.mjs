import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unsplashSearchUrl, acceptUnsplashPhoto, fetchUnsplashPair, trackUnsplashPair} from '../src/unsplash-source.js';

const key = 'private-unsplash-test-key';
const photo = (id, label, banner = false) => ({id, width: banner ? 2400 : 900, height: banner ? 1350 : 1200,
  alt_description: label, description: null, color: '#30343a', tags: [{title: banner ? 'city' : 'portrait'}],
  urls: {regular: `https://images.unsplash.com/photo-${id}?ixid=keep-me&auto=format&fit=crop&w=1080&q=80`},
  links: {html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=track-me`},
  user: {name: 'Test Photographer', links: {html: 'https://unsplash.com/@test_artist'}}});
const woman = photo('woman001', 'Woman portrait outdoors'), man = photo('man001', 'Man in black hoodie from behind on city street at night');
const scene = photo('scene001', 'City street train station and cloudy grass field at night', true);
const url = unsplashSearchUrl('man hoodie', {monochrome: true});
assert.equal(url.hostname, 'api.unsplash.com');assert.equal(url.searchParams.get('orientation'), 'portrait');
assert.equal(url.searchParams.get('content_filter'), 'high');assert.equal(url.searchParams.get('color'), 'black_and_white');
assert.equal(url.searchParams.has('client_id'), false);
assert.equal(unsplashSearchUrl('forest', {kind: 'banner'}).searchParams.get('orientation'), 'landscape');
assert(acceptUnsplashPhoto('girls', 'avatar', woman));assert(acceptUnsplashPhoto('boys', 'avatar', man));
assert(!acceptUnsplashPhoto('girls', 'avatar', man));assert(!acceptUnsplashPhoto('boys', 'avatar', woman));
assert(acceptUnsplashPhoto('boys', 'banner', scene));
for (const bad of [{...woman, premium:true}, {...woman, id: '../evil'}, {...woman, alt_description: 'Woman anime illustration'},
  {...woman, alt_description: '', tags: []}, {...woman, width: 100}, {...woman, urls: {regular: 'https://plus.unsplash.com/premium_photo-test'}},
  {...woman, urls: {regular: 'https://images.unsplash.com.evil.test/photo-test'}},
  {...woman, urls: {regular: 'https://x@images.unsplash.com/photo-test'}},
  {...woman, links: {...woman.links, html: 'https://evil.test/photos/a'}},
  {...woman, user: {...woman.user, links: {html: 'https://evil.test/@test'}}},
  {...woman, links: {...woman.links, download_location: 'https://api.unsplash.com/photos/another/download'}}]) {
  assert(!acceptUnsplashPhoto('girls', 'avatar', bad));
}
let calls = 0, tracking = 0;
const apiFetch = async (raw, opts) => {
  const u = new URL(raw);calls++;
  assert.equal(u.hostname, 'api.unsplash.com');assert.equal(opts.headers.Authorization, 'Client-ID ' + key);
  assert.equal(opts.redirect, 'error');
  if (u.pathname.endsWith('/download')) {tracking++;assert.equal(u.searchParams.get('ixid'), 'track-me');return {ok: true, json: async () => ({url: 'https://images.unsplash.com/photo-unused'})};}
  assert.equal(u.pathname, '/search/photos');
  return {ok: true, json: async () => ({total: 3, total_pages: 1,
    results: u.searchParams.get('orientation') === 'landscape' ? [scene] : [woman, man]})};
};
const options = {accessKey: key, apiFetch, cacheDir: false};
const girls = await fetchUnsplashPair('girls', new Set(), options);
assert.equal(girls.provider, 'Unsplash');assert.equal(girls.remote, true);assert.equal(girls.kind, 'profile');
assert.equal(girls.avatarURL, woman.urls.regular);assert.equal(girls.bannerURL, scene.urls.regular);
assert.equal(girls.credits.avatar.name, woman.user.name);
for (const link of [girls.sourceUrl, girls.sourceBannerUrl, girls.credits.avatar.url, girls.credits.banner.url]) {
  const u = new URL(link);assert.equal(u.searchParams.get('utm_source'), 'abo7rb');assert.equal(u.searchParams.get('utm_medium'), 'referral');
}
assert.equal(tracking, 0, 'searching candidates never triggers tracking');
const boys = await fetchUnsplashPair('boys', new Set(), options);
assert.equal(boys.boysStyle, 'dark-street-v1');assert.equal(boys.boysTheme, 'mono-streetwear');
assert.equal(await trackUnsplashPair(girls, options), 2);assert.equal(tracking, 2);
const beforeForged = calls;
for (const location of ['http://api.unsplash.com/photos/woman001/download', 'https://evil.test/photos/woman001/download',
  'https://api.unsplash.com.evil.test/photos/woman001/download', 'https://x@api.unsplash.com/photos/woman001/download',
  'https://api.unsplash.com:444/photos/woman001/download', 'https://api.unsplash.com/photos/other/download']) {
  await assert.rejects(trackUnsplashPair({...girls, downloadLocations: [location, girls.downloadLocations[1]]}, options), /غير صالحة/);
}
assert.equal(calls, beforeForged, 'validate both locations before any authenticated request');
assert.equal(await fetchUnsplashPair('girls', new Set(girls.sourceIds), options), null);
assert.equal(await fetchUnsplashPair('girls', new Set(), {...options, apiFetch: async () => ({ok: true, json: async () => ({results: []})})}), null);
const mismatch={...options,accessKey:'color-test-key',apiFetch:async raw=>({ok:true,json:async()=>({results:new URL(raw).searchParams.get('orientation')==='landscape'?[{...scene,color:'#ffffff'}]:[woman]})})};
assert.equal(await fetchUnsplashPair('girls',new Set(),mismatch),null,'reject incompatible provider color metadata without downloading images');
await assert.rejects(fetchUnsplashPair('girls', new Set(), {accessKey: ''}), /UNSPLASH_ACCESS_KEY/);
await assert.rejects(fetchUnsplashPair('girls', new Set(), {...options, apiFetch: async () => {throw Error('leaked ' + key);}}), error => !error.message.includes(key));
await assert.rejects(fetchUnsplashPair('girls', new Set(), {...options, apiFetch: async () => ({ok: false, status: 401, json: async () => ({errors: [key]})})}), /401/);

// Sparse queries often have only one page; rotating onto pages2–4 must not
// silently miss valid images that are available on page1.
const sparsePages=[];
const sparse=await fetchUnsplashPair('girls',new Set(),{accessKey:'sparse-page-key',cacheDir:false,seed:1,
 apiFetch:async raw=>{
  const u=new URL(raw),page=Number(u.searchParams.get('page'));sparsePages.push(page);
  return {ok:true,json:async()=>({total:1,total_pages:1,
   results:page===1?[u.searchParams.get('orientation')==='landscape'?scene:woman]:[]})};
 }});
assert.equal(sparse.provider,'Unsplash');assert.deepEqual(sparsePages.sort(),[1,1,2,2]);
let zeroPageCalls=0;
assert.equal(await fetchUnsplashPair('girls',new Set(),{accessKey:'zero-page-key',cacheDir:false,seed:1,
 apiFetch:async()=>{zeroPageCalls++;return {ok:true,json:async()=>({total:0,total_pages:0,results:[]})};}}),null);
assert.equal(zeroPageCalls,6,'known zero-result searches should not waste page1 fallbacks');
const invalidPage=await fetchUnsplashPair('girls',new Set(),{accessKey:'invalid-page-key',cacheDir:false,seed:1,
 apiFetch:async raw=>{
  const u=new URL(raw);return u.searchParams.get('page')!=='1'?{ok:false,status:400,json:async()=>({errors:['invalid page']})}:
   {ok:true,json:async()=>({total_pages:1,results:[u.searchParams.get('orientation')==='landscape'?scene:woman]})};
 }});
assert.equal(invalidPage.provider,'Unsplash');

const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abo-unsplash-cache-'));
try {
  let requests = 0;const cachedKey = 'cache-key-private';
  const cached = {accessKey: cachedKey, cacheDir, apiFetch: async () => {requests++;return {ok: true, json: async () => ({results: [woman, scene]})};}};
  await fetchUnsplashPair('girls', new Set(), cached);assert.equal(requests, 2);
  await fetchUnsplashPair('girls', new Set(), cached);assert.equal(requests, 2);
  const files = await fs.readdir(cacheDir);assert(files.some(f => f.startsWith('budget-')));
  for (const file of files) {assert(!(await fs.readFile(path.join(cacheDir, file), 'utf8')).includes(cachedKey));assert.equal((await fs.stat(path.join(cacheDir, file))).mode & 0o777, 0o600);}
  const rateKey = 'rate-guard-key';let rateCalls = 0;
  const limited = {accessKey: rateKey, cacheDir: false, apiFetch: async () => {rateCalls++;return {ok: true, json: async () => ({total:0,total_pages:0,results: []})};}};
  for (let n = 0; n < 7; n++)await fetchUnsplashPair('girls', new Set(), limited);
  assert.equal(rateCalls, 42);
  await assert.rejects(fetchUnsplashPair('girls', new Set(), limited), /ساعة/);assert.equal(rateCalls, 45);
  const partialKey='partial-tracking-key';
  const budgetFile=path.join(cacheDir,'budget-'+createHash('sha256').update(partialKey).digest('hex')+'.json');
  await fs.writeFile(budgetFile,JSON.stringify({start:Date.now(),requests:44,blockedUntil:0}));
  let partialCalls=0;
  await assert.rejects(trackUnsplashPair(girls,{accessKey:partialKey,cacheDir,apiFetch:async()=>{
    partialCalls++;return {ok:true,json:async()=>({url:'https://images.unsplash.com/photo-unused'})};
  }}),error=>error.trackedCount===1&&/ساعة/.test(error.message));
  assert.equal(partialCalls,1,'tracking requests count toward the same conservative quota as searches');
  const headerKey = 'header-limit-key';let headersCalls = 0;
  const exhausted = {accessKey: headerKey, cacheDir: false, apiFetch: async () => {headersCalls++;return {ok: false, status: 403,
    headers: {get: name => name === 'x-ratelimit-remaining' ? '0' : null}, json: async () => ({errors: ['Rate Limit Exceeded']})};}};
  await assert.rejects(fetchUnsplashPair('girls', new Set(), exhausted), /ساعة/);
  const atLimit = headersCalls;await assert.rejects(fetchUnsplashPair('girls', new Set(), exhausted), /ساعة/);assert.equal(headersCalls, atLimit);

  const budgetPath=value=>path.join(cacheDir,'budget-'+createHash('sha256').update(value).digest('hex')+'.json');
  const legacyKey='legacy-search-counter-key';let legacyCalls=0;
  await fs.writeFile(budgetPath(legacyKey),JSON.stringify({start:Date.now(),searches:44,blockedUntil:0}));
  await assert.rejects(trackUnsplashPair(girls,{accessKey:legacyKey,cacheDir,apiFetch:async()=>{
    legacyCalls++;return {ok:true,json:async()=>({url:'https://images.unsplash.com/photo-unused'})};
  }}),error=>error.trackedCount===1&&/ساعة/.test(error.message));
  assert.equal(legacyCalls,1,'valid legacy counters migrate without resetting quota');
  assert.equal(JSON.parse(await fs.readFile(budgetPath(legacyKey),'utf8')).requests,45);
  for(const [index,value] of [null,-1,'bad',null].entries()){
    const invalidKey='invalid-budget-counter-'+index;let invalidCalls=0;
    const data={start:Date.now(),requests:value,blockedUntil:0};if(index===3)delete data.requests;
    await fs.writeFile(budgetPath(invalidKey),JSON.stringify(data));
    await assert.rejects(trackUnsplashPair(girls,{accessKey:invalidKey,cacheDir,apiFetch:async()=>{
      invalidCalls++;return {ok:true,json:async()=>({})};
    }}),/ساعة/);assert.equal(invalidCalls,0,'malformed active counter must fail closed');
    assert.equal(JSON.parse(await fs.readFile(budgetPath(invalidKey),'utf8')).requests,45);
  }
  const corruptKey='corrupt-budget-json-key';
  await fs.writeFile(budgetPath(corruptKey),'{not JSON');
  await assert.rejects(trackUnsplashPair(girls,{accessKey:corruptKey,cacheDir,apiFetch:async()=>{assert.fail('corrupt budget must block network');}}),/ساعة/);
  const expiredKey='expired-budget-key';let expiredCalls=0;
  await fs.writeFile(budgetPath(expiredKey),JSON.stringify({start:Date.now()-3600001,requests:45,blockedUntil:0}));
  assert.equal(await trackUnsplashPair(girls,{accessKey:expiredKey,cacheDir,apiFetch:async()=>{
    expiredCalls++;return {ok:true,json:async()=>({url:'https://images.unsplash.com/photo-unused'})};
  }}),2);assert.equal(expiredCalls,2,'expired valid window starts a new quota');
  const backoffKey='rollover-backoff-key';
  await fs.writeFile(budgetPath(backoffKey),JSON.stringify({start:Date.now()-3600001,requests:45,blockedUntil:Date.now()+1800000}));
  await assert.rejects(trackUnsplashPair(girls,{accessKey:backoffKey,cacheDir,apiFetch:async()=>{assert.fail('backoff must survive window rollover');}}),/ساعة/);
} finally {await fs.rm(cacheDir, {recursive: true, force: true});}
console.log('PASS: Unsplash schema/auth, hotlinks, attribution, styles, strict tracking, duplicate prevention, cache/budget and key privacy');
