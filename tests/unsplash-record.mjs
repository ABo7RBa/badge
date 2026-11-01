import assert from 'node:assert/strict';
import {isUnsplashRecord} from '../src/unsplash-record.js';
import {addPack,packs,choose,makeRoom,guild,samePhoto} from '../src/db.js';
import {unsplashEmbeds} from '../src/bot.js';
import {deleteCustom} from '../src/media.js';

const pair=(a='avatar01',b='banner01')=>({
 id:'remote-'+a,remote:true,provider:'Unsplash',kind:'profile',category:'girls',
 verificationSource:'unsplash-photo',categoryVerified:true,photoVerified:true,importedAutomatically:true,
 sourceIds:[`unsplash:${a}`,`unsplash:${b}`],sourceId:`unsplash:${a}|unsplash:${b}`,
 avatarURL:`https://images.unsplash.com/photo-${a}?ixid=retain&w=1080`,
 bannerURL:`https://images.unsplash.com/photo-${b}?ixid=retain&w=1080`,
 sourceUrl:`https://unsplash.com/photos/${a}?utm_source=abo7rb&utm_medium=referral`,
 sourceBannerUrl:`https://unsplash.com/photos/${b}?utm_source=abo7rb&utm_medium=referral`,
 credits:{avatar:{name:'Avatar Artist',url:'https://unsplash.com/@avatarartist?utm_source=abo7rb&utm_medium=referral'},
  banner:{name:'Banner Artist',url:'https://unsplash.com/@bannerartist?utm_source=abo7rb&utm_medium=referral'}},
 downloadLocations:[`https://api.unsplash.com/photos/${a}/download?ixid=retain`,`https://api.unsplash.com/photos/${b}/download?ixid=retain`]
});
const valid=pair();assert(isUnsplashRecord(valid));
for(const patch of [
 {provider:'another'}, {category:'movies'}, {remote:false}, {sourceIds:['unsplash:avatar01']},
 {sourceId:'forged'}, {avatarURL:'https://evil.test/photo-avatar01'},
 {bannerURL:valid.avatarURL+'&w=400'}, {sourceUrl:'https://evil.test/photos/avatar01'},
 {downloadLocations:['https://api.unsplash.com.evil.test/photos/avatar01/download',valid.downloadLocations[1]]},
 {downloadLocations:['https://api.unsplash.com/photos/another1/download',valid.downloadLocations[1]]},
 {credits:{...valid.credits,avatar:{name:'Artist',url:'https://evil.test/@artist'}}}
]){
 assert(!isUnsplashRecord({...valid,...patch}),JSON.stringify(patch));
 assert.throws(()=>unsplashEmbeds({...valid,...patch}),/غير صالحة/);
}
const state={guilds:{}};guild('remote-tests',state);
const count=packs('remote-tests','girls',state).length;
const imported=addPack('remote-tests',valid,state);
assert.equal(packs('remote-tests','girls',state).length,count+1,'remote pairs need no local paths or fingerprints');
const room=makeRoom('girls');room.usedIds=packs('remote-tests','girls',state).filter(p=>p.id!==imported.id).map(p=>p.id);
assert.equal(choose('remote-tests',room,state).id,imported.id);
assert(samePhoto(valid,pair('banner01','avatar02')),'photo IDs cannot be recycled across avatar/banner roles');
assert.throws(()=>addPack('remote-tests',pair('banner01','avatar02'),state),/موجود/);
const rendered=unsplashEmbeds(imported)[0].toJSON();
assert.equal(rendered.image.url,valid.bannerURL);assert.equal(rendered.thumbnail.url,valid.avatarURL);
assert(rendered.description.includes('Avatar Artist'));assert(rendered.description.includes('Banner Artist'));
assert(rendered.description.includes('utm_source=abo7rb'));assert(rendered.description.includes('https://unsplash.com/?'));
await deleteCustom(imported); // Removing remote metadata must never try to unlink absent local files.
console.log('PASS: saved Unsplash records validate remote origins/IDs, persist without image files, preserve attribution and reject duplicate assets');
