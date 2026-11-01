import assert from 'node:assert/strict';
import {metadataAllowed,isPublishableRecord} from '../src/content-policy.js';
const mk=(description,title='')=>({description,title,width:1920,height:1080});
assert.equal(metadataAllowed('girls',mk('Anime illustration of girl')),false);
assert.equal(metadataAllowed('boys',mk('Anime drawing of boy')),false);
assert.equal(metadataAllowed('movies',mk('digital illustration film screenshot a trip to the moon')),false);
assert.equal(metadataAllowed('girls',mk('Portrait photograph of a woman')),true);
assert.equal(metadataAllowed('boys',mk('Portrait photograph of a man')),true);
assert.equal(metadataAllowed('boys',mk('Portrait photograph of a woman')),false);
assert.equal(metadataAllowed('girls',mk('Portrait photograph of a man')),false);
assert.equal(metadataAllowed('anime',mk('Original anime illustration')),true);
assert.equal(metadataAllowed('anime',mk('Photo of anime cosplay')),false);
assert.equal(metadataAllowed('pc_wallpapers',mk('panorama mountain photography')),true);
assert.equal(metadataAllowed('pc_wallpapers',mk('anime landscape painting')),false);
assert.equal(isPublishableRecord({category:'girls',categoryVerified:true}),false);
assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'commons-photo'}),false);
assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'commons-photo',reviewedWithV86:true}),false);
assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'other'}),false);
assert.equal(isPublishableRecord({category:'movies',categoryVerified:true,filmVerified:false}),false);
assert.equal(isPublishableRecord({category:'movies',categoryVerified:true,filmVerified:true}),false);
assert.equal(isPublishableRecord({category:'movies',categoryVerified:true,filmVerified:true,reviewedWithV86:true}),true);
console.log('PASS: strict classification metadata gate and quarantine rules.');

assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'pexels-photo',reviewedWithV86:true}),true);

assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'pixabay-photo',reviewedWithV86:true}),true);

assert.equal(isPublishableRecord({category:'girls',categoryVerified:true,photoVerified:true,verificationSource:'unsplash-photo',reviewedWithV86:true}),true);
