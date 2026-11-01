import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadStore,saveStore,guild} from '../src/db.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'abo-state-'));
try{
 const file=path.join(temp,'state.json');
 for(const data of [{guilds:null},{guilds:[]},{guilds:{g:null}},{guilds:{g:[]}},{guilds:{g:{packs:{}}}},
  {guilds:{g:{packs:[null]}}},{guilds:{g:{rooms:[]}}},{guilds:{g:{rooms:{room:null}}}}]){
  const text=JSON.stringify(data);fs.writeFileSync(file,text);
  assert.throws(()=>loadStore(file),/تعذر قراءة بيانات البوت/);
  assert.equal(fs.readFileSync(file,'utf8'),text,'invalid state must be preserved rather than reset or overwritten');
 }
 const data={version:9,guilds:{g:{packs:[],rooms:{},sources:{}}}};saveStore(data,file);assert.deepEqual(loadStore(file),data);
 const state={guilds:{}};const g=guild('rooms',state);g.rooms.bad=null;guild('rooms',state);assert.equal(g.rooms.bad,undefined);
 console.log('PASS: malformed storage produces actionable errors, preserves user data and safely handles invalid room entries');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
