// One-time reconciliation of prior bot posts when upgrading from V11.
// Only messages authored by this same bot count. Never delete users' content.
export function packIdsFromMessages(messages,botId){
 const out=[];
 for(const msg of messages){
  if(msg.author?.id!==botId)continue;
  const components=(msg.components||[]).flatMap(row=>row.components||[]);
  const id=components.map(b=>b.customId||b.data?.custom_id||'').find(x=>x.startsWith('sas:download:'));
  if(id){const extracted=id.split(':')[2];if(/^[\w-]{2,80}$/.test(extracted))out.push(extracted);}
 }
 return out;
}
export async function collectRecentPostIds(channel,botId,maxPages=5){
 const messages=[];let before;
 for(let page=0;page<maxPages;page++){
  const args={limit:100};if(before)args.before=before;
  const batch=await channel.messages.fetch(args);
  if(!batch?.size)break;
  const list=[...batch.values()];messages.push(...list);
  if(list.length<100)break;
  before=list.at(-1).id;
 }
 return packIdsFromMessages(messages,botId);
}
export function reconcileRoom(room,ids){
 room.usedIds=Array.isArray(room.usedIds)?room.usedIds:(room.lastId?[room.lastId]:[]);
 const saved=new Set(room.usedIds);
 for(const id of ids){if(!saved.has(id)){room.usedIds.push(id);saved.add(id);}}
 room.queue=(room.queue||[]).filter(id=>!saved.has(id));
 return saved.size;
}
