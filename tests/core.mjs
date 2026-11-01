import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {guild,packs,choose,makeRoom,sent,addPack,loadStore,saveStore,kindFor,ROOT,store,DEFAULT_CATEGORIES,ALLOWED_CATEGORIES,migrateLegacySettings} from '../src/db.js';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shine-rebuilt-'));
try{
 const state={version:8,guilds:{}};const a='test-1';const b='test-2';
 const g=guild(a,state),g2=guild(b,state);assert.notEqual(g,g2);
 assert.equal(kindFor('pc_wallpapers'),'wallpaper');
 assert.equal(packs(a,'movies',state).length,0,'no fake movies are bundled');
 assert.equal(packs(a,'anime',state).length,4);
 assert.equal(packs(a,'girls',state).length,3,'three distinct girl sets are bundled');
 assert.equal(packs(a,'boys',state).length,0,'old generic bundled boys must not preempt the new streetwear style');
 assert.equal(choose(a,makeRoom('boys'),state),null,'wait for a styled import or reviewed owner upload');
 const ownerState={guilds:{}};
 const originalBoy=JSON.parse(fs.readFileSync(path.join(ROOT,'assets','seed.json'),'utf8')).find(p=>p.category==='boys');
 const ownerBoy=addPack('owner-style',{...originalBoy,id:'owner-picked-boy',bundled:false,importedAutomatically:false,
  categoryVerified:true,photoVerified:true,verificationSource:'moderator-photo'},ownerState);
 assert.equal(choose('owner-style',makeRoom('boys'),ownerState).id,ownerBoy.id,'reviewed owner photos remain publishable');
 assert.equal(packs(a,'cinematic',state).length,0);
 assert.equal(packs(a,'movies',state).length,0);
 assert.deepEqual(Object.keys(g.categories),['anime','movies','girls','boys','pc_wallpapers']);
 assert.deepEqual([...ALLOWED_CATEGORIES],['anime','movies','girls','boys','pc_wallpapers']);
 assert.equal(packs(a,'pc_wallpapers',state).length,4,'near-duplicate wallpapers are quarantined');
 let room=makeRoom('anime',40,0);g.rooms.room1=room;
 let ids=[];
 for(let i=0;i<4;i++){const p=choose(a,room,state);assert.equal(p.category,'anime');assert(!ids.includes(p.id));ids.push(p.id);sent(room,p.id,1000+i*60000);}
 assert.equal(new Set(ids).size,4);
 assert.equal(choose(a,room,state),null,'V12 must stop after all available images are used');
 const r2=makeRoom('girls',40,0);g.rooms.room2=r2;
 assert.equal(choose(a,r2,state)?.category,'girls','only girl portraits are eligible');
 assert.equal(choose(b,makeRoom('pc_wallpapers'),state).category,'pc_wallpapers');
 assert.throws(()=>makeRoom('anime',0));
 assert.throws(()=>makeRoom('dark',40));
 g.packs.push({id:'old-girl-image',category:'girls',kind:'profile',avatar:'assets/packs/anime-01-avatar.jpg',banner:'assets/packs/anime-01-banner.jpg',importedAutomatically:true,categoryVerified:true});
 assert.equal(choose(a,r2,state)?.category,'girls','old unverified imports are quarantined');
 g.packs.push({id:'real-girl-test',category:'girls',kind:'profile',avatar:'assets/packs/anime-01-avatar.jpg',banner:'assets/packs/anime-01-banner.jpg',photoVerified:true,categoryVerified:true,verificationSource:'commons-photo'});
 assert.equal(packs(a,'girls',state).length,3,'legacy records without V8.6 review must remain quarantined');
 const newPhoto=addPack(a,{category:'girls',kind:'profile',avatar:'assets/packs/girls-realistic-01-avatar.jpg',banner:'assets/packs/girls-realistic-01-banner.jpg',visualHash:'a'.repeat(64),bannerVisualHash:'b'.repeat(64),avatarDHash:'0123456789abcdef',bannerDHash:'fedcba9876543210',categoryVerified:true,photoVerified:true,verificationSource:'moderator-photo'},state);
 assert.equal(newPhoto.reviewedWithV86,true,'new verified images are eligible');
 assert.equal(packs(a,'girls',state).length,4,'new import remains publishable');
 assert.throws(()=>addPack(a,{category:'anime',kind:'wallpaper',visualHash:'0'.repeat(64)},state));
 const file=path.join(tmp,'state.json');saveStore(state,file);assert.deepEqual(loadStore(file),state);
 // Legacy settings from prior V8 versions are sanitized. No extra room may post.
 const old={version:8,guilds:{'old-server':{
  categories:{...DEFAULT_CATEGORIES,cinematic:'cinematic',dark:'dark'},
  rooms:{abc:{...makeRoom('anime',40,0),category:'cinematic'},good:makeRoom('girls',40,0),bad:{...makeRoom('anime',40,0),category:'dark'}},
  packs:[],sources:{src1:'dark',src2:'anime'},titleOverrides:{},fetchAt:{},migrations:{stableV8:true}
 }}};
 old.guilds['old-server'].fetchAt.girls=12345;
 old.guilds['old-server'].fetchStatus={girls:{state:'error',error:'old provider key missing',retryAt:Date.now()+300000}};
 assert.equal(migrateLegacySettings(undefined,old),true);
 assert.equal(old.guilds['old-server'].fetchAt.girls,0,'new provider starts without old provider cooldown');
 assert.equal(old.guilds['old-server'].fetchStatus.girls,undefined,'old provider errors cannot block the new source');
 assert.equal(old.guilds['old-server'].fetchAt.boys,0,'new style can fetch immediately after upgrade');
 old.guilds['old-server'].fetchAt.boys=12345;
 assert.equal(migrateLegacySettings(undefined,old),false,'style migration must be repeatable');
 assert.equal(old.guilds['old-server'].fetchAt.boys,12345,'later starts preserve fetch cooldown');
 assert.deepEqual(Object.keys(old.guilds['old-server'].categories),['anime','movies','girls','boys','pc_wallpapers']);
 assert.deepEqual(Object.keys(old.guilds['old-server'].rooms),['good']);
 assert.deepEqual(Object.values(old.guilds['old-server'].sources),['anime']);
 assert.deepEqual(packs('old-server',null,old).every(p=>ALLOWED_CATEGORIES.has(p.category)),true);
 assert.throws(()=>addPack('old-server',{category:'dark',kind:'profile',visualHash:'a'.repeat(64)},old));
 assert.equal(fs.existsSync(path.join(ROOT,'assets','seed.json')),true);
 console.log('PASS: five categories, 40min default, legacy quarantine, strict photo gate, independent rooms, no repeats.');
} finally{fs.rmSync(tmp,{recursive:true,force:true});}
