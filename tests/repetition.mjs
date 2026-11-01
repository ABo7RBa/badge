import assert from 'node:assert/strict';
import {guild,packs,choose,sent,makeRoom} from '../src/db.js';
import {packIdsFromMessages,reconcileRoom} from '../src/history.js';
const state={version:12,guilds:{}};const id='server';guild(id,state);
const room=makeRoom('girls',40,0);
const available=packs(id,'girls',state);
const used=[];
for(let i=0;i<available.length;i++){
 const next=choose(id,room,state);assert(next,'should have enough distinct images');assert(!used.includes(next.id));
 used.push(next.id);sent(room,next.id,1e6+i*2400000);
}
assert.equal(choose(id,room,state),null,'must STOP instead of silently recycle after exhausting pack library');
const message={author:{id:'bot'},components:[{components:[{customId:'sas:download:girls-realistic-01'}]}]};
assert.deepEqual(packIdsFromMessages([message,{...message,author:{id:'another'}}],'bot'),['girls-realistic-01']);
const newRoom=makeRoom('girls',40,0);reconcileRoom(newRoom,['girls-realistic-01','girls-photoreal-03']);
assert(!['girls-realistic-01','girls-photoreal-03'].includes(choose(id,newRoom,state).id));
console.log('PASS: no repeat after exhaustion; prior message history reconciled');
