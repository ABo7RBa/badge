// Reconcile prior bot posts before restarting automatic publication.
// Only messages authored by this same bot count. Never delete users' content.
const wallhavenId=id=>typeof id==='string'&&/^(?:wh_|wallhaven:)([a-z0-9]{6})$/.exec(id)?.[1];
const customId=button=>button.customId||button.data?.custom_id||'';
function legacyWallhavenPost(components){
 for(const button of components){
  const id=/^sas:delete:wh_([a-z0-9]{6})$/.exec(customId(button))?.[1];
  if(id&&components.some(link=>(link.style??link.data?.style)===5&&
   (link.url||link.data?.url)===`https://wallhaven.cc/w/${id}`))return `wh_${id}`;
 }
 return null;
}
export function packIdsFromMessages(messages,botId){
 const out=[];
 for(const msg of messages){
  if(msg.author?.id!==botId)continue;
  const components=(msg.components||[]).flatMap(row=>row.components||[]);
  const id=components.map(customId).find(x=>typeof x==='string'&&x.startsWith('sas:download:'));
  const extracted=id?.split(':')[2];
  if(extracted&&/^[\w-]{2,80}$/.test(extracted)&&(!extracted.startsWith('wh_')||wallhavenId(extracted))){
   out.push(extracted);
  }else{
   const legacy=legacyWallhavenPost(components);if(legacy)out.push(legacy);
  }
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
 const pc=room.category==='pc_wallpapers';
 const wallpapers=new Set(pc&&Array.isArray(room.wallhavenUsedIds)?
  room.wallhavenUsedIds.map(id=>wallhavenId(id)?`wallhaven:${wallhavenId(id)}`:id):[]);
 const saved=new Set();
 for(const id of room.usedIds){
  const source=pc&&wallhavenId(id);
  if(source)wallpapers.add(`wallhaven:${source}`);else saved.add(id);
 }
 const previous=pc&&wallhavenId(room.lastId);
 if(previous)wallpapers.add(`wallhaven:${previous}`);
 for(const id of ids){
  const source=wallhavenId(id);
  if(source){if(pc)wallpapers.add(`wallhaven:${source}`);}
  else saved.add(id);
 }
 room.usedIds=[...saved];
 if(pc)room.wallhavenUsedIds=[...wallpapers];
 room.queue=(room.queue||[]).filter(id=>!saved.has(id)&&!(pc&&wallpapers.has(`wallhaven:${wallhavenId(id)}`)));
 return saved.size+wallpapers.size;
}
