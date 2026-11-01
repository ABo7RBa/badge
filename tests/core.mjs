import assert from 'node:assert/strict';
import {remotePair} from './fixtures.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {guild,packs,makeRoom,sent,addPack,loadStore,saveStore,kindFor,ROOT,store,DEFAULT_CATEGORIES,ALLOWED_CATEGORIES,migrateLegacySettings} from '../src/db.js';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shine-rebuilt-'));
try{
 const state={version:8,guilds:{}};const a='test-1';const b='test-2';
 const g=guild(a,state),g2=guild(b,state);assert.notEqual(g,g2);
 assert.equal(kindFor('pc_wallpapers'),'wallpaper');
 assert.deepEqual(Object.keys(g.categories),['anime','movies','girls','boys','pc_wallpapers']);
 assert.deepEqual([...ALLOWED_CATEGORIES],Object.keys(g.categories));
 assert.equal(packs(a,null,state).length,0,'new installation starts with no images');
 assert.equal(packs(b,null,state).length,0,'no hidden bundled fallback');
 assert.equal(fs.existsSync(path.join(ROOT,'assets')),false,'packaged image directory removed');
 const photo=addPack(a,remotePair('corephoto'),state);
 assert.equal(packs(a,'girls',state).length,1);
 assert.equal(packs(b,'girls',state).length,0,'guild records stay isolated');
 assert.throws(()=>addPack(a,{...remotePair('manual'),importedAutomatically:false},state),/المواقع/);
 assert.throws(()=>addPack(a,{...remotePair('wrongprovider'),provider:'Openverse'},state),/المواقع/);
 const room=g.rooms.room1=makeRoom('girls',40,0);sent(room,photo.id,1000);sent(room,photo.id,2000);
 assert.deepEqual(room.usedIds,[photo.id]);assert.equal(room.nextAt,2000+40*60000);
 assert.throws(()=>makeRoom('anime',0));assert.throws(()=>makeRoom('dark',40));
 g.packs.push({...remotePair('legacy'),bundled:true,importedAutomatically:false});
 assert.equal(packs(a,'girls',state).length,1,'old bundled/manual data is quarantined');
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

 console.log('PASS: five categories, 40min default, legacy quarantine, strict photo gate, independent rooms, no repeats.');
} finally{fs.rmSync(tmp,{recursive:true,force:true});}
