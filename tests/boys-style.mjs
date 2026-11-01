import assert from 'node:assert/strict';
import sharp from 'sharp';
import {BOYS_STYLE_VERSION, BOYS_THEMES, scoreBoysCandidate, styleBoysPair, isCurrentBoysStyle} from '../src/boys-style.js';

const mono = BOYS_THEMES[0], night = BOYS_THEMES.find(t => t.monochrome === false);
assert.equal(BOYS_THEMES.length, 4);
assert.equal(BOYS_THEMES.filter(t => t.monochrome).length, 3);
for (const t of BOYS_THEMES) {
  assert(t.portrait && t.scene && t.mood);
  assert.equal(typeof t.monochrome, 'boolean');
}
const photo = alt => ({alt});
const rank = alt => scoreBoysCandidate('avatar', photo(alt), mono);
assert.equal(rank('Man portrait outdoors'), 0);
assert(rank('Man in black hoodie') > 0, 'sparse hoodie description should pass');
assert(rank('Man in black hoodie from behind') > rank('Man in black hoodie'));
assert(rank('Man in black hoodie from behind in black and white') > rank('Man in black hoodie from behind'));
assert(rank('Man streetwear side profile') > 0);
assert(rank('Male silhouette outdoors') > 0);
assert(rank('Man in dark jacket') > 0);
for (const label of ['Man in a business suit', 'Man in formal black jacket', 'Smiling man in black hoodie',
  'Man selfie in a hoodie', 'Man headshot with black jacket', 'Woman in black hoodie',
  'Child in black hoodie', 'Man anime hoodie illustration', 'A hoodie on a chair']) assert.equal(rank(label), 0, label);
assert.equal(scoreBoysCandidate('avatar', photo('Man in black hoodie'), night), 0);
assert(scoreBoysCandidate('avatar', photo('Man in black hoodie on a city street at night'), night) > 0);
assert.equal(scoreBoysCandidate('avatar', photo('Man in dark jacket in bright daylight'), night), 0);
assert(scoreBoysCandidate('banner', photo('City street train station and cloudy grass field in black and white'), mono) > 0);
assert(scoreBoysCandidate('banner', photo('Cloudy grass field landscape'), mono) > 0);
assert(scoreBoysCandidate('banner', photo('City street and train station at night'), night) > 0);
assert.equal(scoreBoysCandidate('banner', photo('Sunny city street and train station'), night), 0);
assert.equal(scoreBoysCandidate('banner', photo('City street architecture'), night), 0);
assert.equal(scoreBoysCandidate('banner', photo('Man portrait in a city street at night'), night), 0);

const create = (width, height, background) => sharp({create: {width, height, channels: 3, background}}).png().toBuffer();
const avatar = await create(200, 260, {r: 85, g: 100, b: 125});
const banner = await create(400, 180, {r: 100, g: 110, b: 130});
const greys = await styleBoysPair(avatar, banner, mono);
const nights = await styleBoysPair(avatar, banner, night);
async function sample(buffer) {
  const {data, info} = await sharp(buffer).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject: true});
  return {rgb: Array.from(data.subarray(0, 3)), width: info.width, height: info.height};
}
for (const [buffer, width, height] of [[greys.avatar, 200, 260], [greys.banner, 400, 180], [nights.avatar, 200, 260], [nights.banner, 400, 180]]) {
  const pixels = await sample(buffer);assert.equal(pixels.width, width);assert.equal(pixels.height, height);
}
for (const buffer of [greys.avatar, greys.banner]) {
  const {rgb} = await sample(buffer);assert(Math.max(...rgb) - Math.min(...rgb) <= 1, 'monochrome is actual grayscale');
}
for (const buffer of [nights.avatar, nights.banner]) {
  const {rgb} = await sample(buffer);assert(rgb[2] > rgb[0] + 5, 'night remains cool color, not grayscale');
  assert(rgb.reduce((a, b) => a + b, 0) / 3 < 130);
}
const bright = await create(200, 260, '#eeeeee');
await assert.rejects(styleBoysPair(bright, banner, night), /ساطعة/);
await assert.rejects(styleBoysPair(avatar, bright, night), /ساطعة/);
const lifted = await styleBoysPair(await create(100, 150, '#000000'), await create(200, 100, '#000000'), mono);
assert((await sample(lifted.avatar)).rgb.every(v => v > 0), 'lowest tones are lifted instead of crushed');

assert(isCurrentBoysStyle({category: 'girls'}));
assert(!isCurrentBoysStyle({category: 'boys', bundled: true}));
assert(!isCurrentBoysStyle({category: 'boys', importedAutomatically: true, boysStyle: 'older-version'}));
assert(isCurrentBoysStyle({category: 'boys', importedAutomatically: true, boysStyle: BOYS_STYLE_VERSION}));
assert(isCurrentBoysStyle({category: 'boys', bundled: false, importedAutomatically: false,
  verificationSource: 'moderator-photo', photoVerified: true, categoryVerified: true}));
assert(isCurrentBoysStyle({category: 'boys', verificationSource: 'manual', photoVerified: true, categoryVerified: true}));
assert(!isCurrentBoysStyle({category: 'boys', verificationSource: 'moderator-photo', photoVerified: false, categoryVerified: true}));
assert(!isCurrentBoysStyle({category: 'boys', verificationSource: 'pexels-photo', photoVerified: true, categoryVerified: true}));
console.log('PASS: boys streetwear ranking, real monochrome/cool-night pixels, brightness guard, preserved dimensions and manual uploads');

assert(scoreBoysCandidate('avatar',{tags:'man, jacket, black, street'},mono)>0);
assert(scoreBoysCandidate('avatar',{tags:'man, hoodie, from behind, black and white'},mono)>0);
assert.equal(scoreBoysCandidate('avatar',{tags:'man, outdoors, portrait'},mono),0);
