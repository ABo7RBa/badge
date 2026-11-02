import {Client,GatewayIntentBits,Events,REST,Routes,PermissionFlagsBits,AttachmentBuilder,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ChannelSelectMenuBuilder,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {cmds,ACTIONS} from './commands.js';
import {guild,store,save,pack,packs,makeRoom,sent,addPack,pendingMoviePacks,saveFetchedMovie,samePhoto,migrateLegacySettings} from './db.js';
import {renderCard,normalizeFromUpload,deleteCustom,visualHash} from './media.js';
import {searchWallhaven} from './wallhaven-source.js';
import {fetchCategoryAssets,SOURCE_CREDITS} from './image-sources.js';
import {trackUnsplashPair} from './unsplash-source.js';
import {isUnsplashRecord} from './unsplash-record.js';
import {collectRecentPostIds,reconcileRoom} from './history.js';
import {pcCollectionsMessage,validatePcWallpaperRoom} from './wallpaper-links.js';
import {randomUUID} from 'node:crypto';
import {validatePair} from './quality-gate.js';
import {imageActionButton,setupImageButtonEmojis} from './button-icons.js';
// Optional attribution display; image-only messages are the requested default.
const showImageCredits=()=>process.env.SHOW_IMAGE_CREDITS==='true';
const photoCards=()=>process.env.PHOTO_DISPLAY!=='source';
const lockedCategory=category=>category==='movies'||photoCards()&&['girls','boys'].includes(category);
const sourceLockKey=(gid,category)=>'publish:'+gid+':'+category;
const EVERY=60_000;const busy=new Set();const processingFetch=new Map();
const sourceQueue=new Map();
async function withSourceLock(key,operation){
 const previous=sourceQueue.get(key)||Promise.resolve();
 const next=previous.catch(()=>{}).then(operation);sourceQueue.set(key,next);
 try{return await next;}finally{if(sourceQueue.get(key)===next)sourceQueue.delete(key);}
}

const ep=(content,extra={})=>({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]},...extra});
const ui=(content,extra={})=>({content,embeds:[],attachments:[],allowedMentions:{parse:[]},...extra});
const admin=i=>i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||false;
const mod=i=>i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)||admin(i);
const err=e=>String(e?.message||e||'خطأ').slice(0,280);
const rowFor=(id,bannerKey=null)=>new ActionRowBuilder().addComponents(
 imageActionButton('download',`sas:download:${id}${bannerKey?':'+bannerKey:''}`),
 imageActionButton('edit',`sas:edit:${id}${bannerKey?':'+bannerKey:''}`),
 imageActionButton('delete',`sas:delete:${id}${bannerKey?':'+bannerKey:''}`));
const panel=()=>new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sas:menu').setPlaceholder('اختر أمرًا من القائمة').addOptions(ACTIONS.map(([value,label,description])=>({value,label,description}))));
const HOME=()=>ep('**✦ ABO 7RB**\nاختر أمرًا من القائمة:',{components:[panel()]});
const chanRow=action=>new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`sas:channel:${action}`).addChannelTypes(ChannelType.GuildText).setPlaceholder('اختر الروم'));
function catRow(gid,action,channel='0'){
 const entries=Object.entries(guild(gid).categories).slice(0,25);
 return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`sas:category:${action}:${channel}`).setPlaceholder('اختر القسم').addOptions(entries.map(([value,label])=>({value,label:label.slice(0,90)}))));
}
function modal(action,channel){
 const m=new ModalBuilder().setCustomId(`sas:modal:${action}:${channel}`).setTitle('مدة النشر');
 const v=new TextInputBuilder().setCustomId('minutes').setLabel('المدة بالدقائق من 5 إلى 1440').setStyle(TextInputStyle.Short).setRequired(true).setValue('40');
 return m.addComponents(new ActionRowBuilder().addComponents(v));
}
function parseMinutes(n){const m=Number(n);if(!Number.isInteger(m)||m<5||m>1440)throw Error('المدة من 5 إلى 1440 دقيقة');return m;}
function currentRoom(gid,cid){const r=guild(gid).rooms[cid];if(!r)throw Error('هذا الروم غير مربوط؛ اختر ربط روم أولًا.');return r;}
function roomText(gid){
 const r=Object.entries(guild(gid).rooms);
 if(!r.length)return 'لا توجد رومات مرتبطة. استخدم ربط روم.';
 return r.map(([id,x])=>`• <#${id}> — \`${x.category}\` — ${x.minutes} دقيقة — ${x.enabled?'🟢 يعمل':'🔴 متوقف'}`).join('\n').slice(0,1700);
}
function stateText(gid){
 const g=guild(gid);
 const movieRooms=Object.values(g.rooms).filter(room=>room.category==='movies');
 const movieInfo=!movieRooms.length?'⚠️ movies: اربط رومًا بقسم movies أولًا':
  !movieRooms.some(room=>room.enabled)?'⚠️ movies: جميع رومات الأفلام متوقفة':
  `movies: ${movieRooms.filter(room=>room.enabled).length} روم يعمل • ${pendingMoviePacks(g).length} طقم بانتظار النشر`;
 const keys=`Unsplash: ${process.env.UNSPLASH_ACCESS_KEY?'مفتاح موجود':'⚠️ يحتاج UNSPLASH_ACCESS_KEY'} • Fanart.tv: ${process.env.FANART_API_KEY?'مفتاح موجود':'⚠️ يحتاج FANART_API_KEY'}`;
 const sources=Object.entries(g.fetchStatus||{}).map(([category,status])=>
  `${category}: ${status.state==='error'?'⚠️ '+status.error:status.state==='empty'?'لا توجد نتائج جديدة':'نجح آخر جلب'}`).join('\n');
 const postingErrors=Object.entries(g.rooms).filter(([,room])=>room.error).map(([cid,room])=>`⚠️ <#${cid}>: ${room.error}`).join('\n');
 const wallhaven=process.env.WALLHAVEN_ENABLED==='false'?'Wallhaven: معطل':'Wallhaven: معاينات الأنمي وخلفيات PC';
 return `**الحالة**\nوضع النشر: من المواقع فقط\nالرومات: ${Object.keys(g.rooms).length}\nسجل أطقم المواقع: ${packs(gid).length}\nالنشر الافتراضي: 40 دقيقة\n${movieInfo}\n${keys}\n${wallhaven}\n${sources}\n${postingErrors}\n${roomText(gid)}`.slice(0,1950);
}
async function recoverPreviousPosts(client){
 let modified=false;
 for(const [gid,g] of Object.entries(store.guilds))for(const [cid,room] of Object.entries(g.rooms||{})){
  try{
   const channel=await client.channels.fetch(cid);
   if(!channel?.messages?.fetch || channel.guildId!==gid)continue;
   const ids=await collectRecentPostIds(channel,client.user.id,5);
   if(ids.length){
    reconcileRoom(room,ids);
    for(const p of g.packs||[])if(p.category==='movies'&&ids.includes(p.id))p.deliveryState='published';
    modified=true;
   }
  }catch(e){console.warn('History sync unavailable for',cid,err(e));}
 }
 if(modified)save();
}
function categoryText(gid){return Object.entries(guild(gid).categories).map(([key,title])=>`• ${title} — ${key==='movies'?'Fanart.tv':['girls','boys'].includes(key)?'Unsplash':'Wallhaven'}`).join('\n');}
export function unsplashEmbeds(record){
 if(!isUnsplashRecord(record))throw Error('بيانات صور Unsplash غير صالحة');
 const embed=new EmbedBuilder().setImage(record.bannerURL).setThumbnail(record.avatarURL);
 if(showImageCredits()){
  const name=value=>String(value).replace(/[\[\]()*_`<>]/g,'').slice(0,90);
  const a=record.credits.avatar,b=record.credits.banner;
  const text=`[الأفتار](${record.sourceUrl}) • تصوير [${name(a.name)}](${a.url})\n`+
   `[البنر](${record.sourceBannerUrl}) • تصوير [${name(b.name)}](${b.url})\n`+
   'على [Unsplash](https://unsplash.com/?utm_source=abo7rb&utm_medium=referral)';
  embed.setDescription(text);
 }
 return [embed];
}
function discardUnsentPhoto(gid,record){
 if(!record?.remote)return;
 const g=guild(gid);
 if(Object.values(g.rooms).some(room=>room.lastId===record.id||room.usedIds?.includes(record.id)))return;
 g.packs=g.packs.filter(p=>p.id!==record.id);
 if(g.fetchStatus?.[record.category]?.recordId===record.id)g.fetchStatus[record.category].recordId=null;
 save();
}
export async function post(client,gid,cid,{forced=false}={}){
 const key=gid+':'+cid;if(busy.has(key))return 'يوجد نشر قيد التنفيذ';
 const r=currentRoom(gid,cid);
 if(!r.enabled&&!forced)return 'النشر متوقف';
 const category=r.category,revision=r.revision||0;
 const stillCurrent=()=>store.guilds[gid]?.rooms?.[cid]===r&&r.category===category&&
  (r.revision||0)===revision&&(r.enabled||forced);
 const cancelled='أُلغي النشر لأن إعدادات الروم تغيّرت أثناء الجلب';
 busy.add(key);
 try{
  const publish=async()=>{
  let newPhoto=null,delivered=false;
  try{
  const channel=await client.channels.fetch(cid);
  if(!stillCurrent())return cancelled;
  if(!channel||channel.guildId!==gid||!channel.isTextBased()||!channel.send)throw Error('الروم غير متاح');
  if(!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))throw Error('صلاحيات View Channel وSend Messages وEmbed Links مطلوبة');
  if(category!=='pc_wallpapers'&&(!['girls','boys'].includes(category)||photoCards())&&
    !channel.permissionsFor(client.user)?.has(PermissionFlagsBits.AttachFiles))throw Error('صلاحية Attach Files مطلوبة لنشر البطاقة');
  let sourceFailure=null;
  // PC wallpapers use the source preview and original page link.
  if(r.category==='pc_wallpapers'&&process.env.WALLHAVEN_ENABLED!=='false') {
   try{
    const result=await withSourceLock(gid,async()=>{
    if(!stillCurrent())return cancelled;
    const seen=new Set(Object.values(guild(gid).rooms).flatMap(room=>room.wallhavenUsedIds||[]));
    const chosen=await searchWallhaven(r.category,seen,{seed:Math.floor(Date.now()/60000)%10000});
    if(!stillCurrent())return cancelled;
    if(chosen){
     const embed=new EmbedBuilder();
     if(showImageCredits())embed.setURL(chosen.sourceUrl).setDescription(`${chosen.width}×${chosen.height} • [عرض وتحميل من المصدر](${chosen.sourceUrl})`);
     if(chosen.preview)embed.setImage(chosen.preview);
     const actions=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(chosen.sourceUrl).setLabel('فتح الخلفية'),
      imageActionButton('delete',`sas:delete:wh_${chosen.rawId}`));
     await channel.send({embeds:[embed],components:[actions],allowedMentions:{parse:[]}});
     r.wallhavenUsedIds??=[];r.wallhavenUsedIds.push(chosen.id);
     r.count=(r.count||0)+1;r.lastPostAt=Date.now();r.lastId=chosen.id;
     r.nextAt=Date.now()+(r.minutes||40)*EVERY;r.error=null;save();
     return `✅ نشرت صورة جديدة برابط مصدرها من Wallhaven في <#${cid}>`;
    }
     return null;
    });
    if(result)return result;
   }catch(e){sourceFailure=err(e);console.warn('Wallhaven source failed:',sourceFailure);}
  }
  let picked=null;
  const pairCategory=['girls','boys','movies','anime'].includes(r.category);
  if(pairCategory&&process.env.AUTO_FETCH!=='false'){
    const before=new Set(guild(gid).packs.map(p=>p.id));
    const previousFetchId=guild(gid).fetchStatus?.[r.category]?.fetchId;
    await importImages(gid,r.category,forced&&lockedCategory(category),{demand:true,sourceLockHeld:lockedCategory(category)});
    const status=guild(gid).fetchStatus?.[r.category];
    if(status?.state==='success'&&status.recordId&&(category==='movies'?status.fetchId&&status.fetchId!==previousFetchId:!before.has(status.recordId))){
     const fresh=pack(gid,status.recordId);
     const provider=r.category==='movies'?'Fanart.tv':r.category==='anime'?'Wallhaven':'Unsplash';
     if(fresh?.importedAutomatically&&fresh.category===r.category&&fresh.provider===provider&&
      (category!=='movies'||pendingMoviePacks(guild(gid)).some(p=>p.id===fresh.id)))picked=fresh;
    }
   }else if(pairCategory)sourceFailure='الجلب معطل؛ فعّل AUTO_FETCH=true للنشر من المواقع';
   else if(process.env.WALLHAVEN_ENABLED==='false')sourceFailure='مصدر Wallhaven معطل؛ فعّل WALLHAVEN_ENABLED=true';
  if(picked?.remote&&photoCards())newPhoto=picked;
  if(!stillCurrent())return cancelled;
  if(!picked){
   const status=guild(gid).fetchStatus?.[r.category];
   const reason=sourceFailure||(status?.state==='error'?status.error:null);
   r.nextAt=Date.now()+(reason?5:Math.max(10,r.minutes))*EVERY;
   r.error=reason||(category==='movies'?'لم أجد ملصقًا وبنرًا جديدين؛ راجع FANART_MOVIE_IDS أو أضف أفلامًا أخرى':'لم يعثر المصدر على صور جديدة مناسبة لقسم '+r.category);save();
   return reason?'تعذر جلب صور جديدة: '+reason:'لا توجد صور جديدة؛ توقفت دورة التكرار حتى تتوفر صور أخرى';
  }
  if(picked.remote&&!photoCards()){
   await trackUnsplashPair(picked);
   if(!stillCurrent())return cancelled;
   await channel.send({embeds:unsplashEmbeds(picked),components:[rowFor(picked.id)],allowedMentions:{parse:[]}});
   sent(r,picked.id);save();return `تم النشر في <#${cid}>`;
  }
  if(!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.AttachFiles))throw Error('صلاحية Attach Files مطلوبة لنشر الأطقم');
  // Render only the two images returned together by the website adapter.
  const output=await renderCard(picked);
  if(!stillCurrent())return cancelled;
  if(picked.remote){await trackUnsplashPair(picked);if(!stillCurrent())return cancelled;}
  const credit=new EmbedBuilder()
    .setImage(`attachment://${output.filename}`);
  if(showImageCredits()&&picked.remote)credit.setDescription(unsplashEmbeds(picked)[0].data.description);
  else if(showImageCredits()&&picked.sourceUrl&&picked.sourceIds?.length) {
   const creditText=String(picked.credit||'').replace(/[\[\]()*_`]/g,'').slice(0,180);
   const links=[`[مصدر الأفتار](${picked.sourceUrl})`,picked.sourceBannerUrl?`[مصدر البنر](${picked.sourceBannerUrl})`:null].filter(Boolean).join(' • ');
   credit.setDescription(`${links}\n${creditText}\nالترخيص: ${String(picked.license||'').slice(0,160)}`);
  }
  await channel.send({files:[new AttachmentBuilder(output.buffer,{name:output.filename})],embeds:[credit],components:[rowFor(picked.id)],allowedMentions:{parse:[]}});
  delivered=true;
  if(category==='movies'){
   const original=guild(gid).packs.find(p=>p.id===picked.id);
   if(original){original.deliveryState='published';original.publishedAt=Date.now();}
  }
  sent(r,picked.id);save();return `تم النشر في <#${cid}>`;
  }finally{if(newPhoto&&!delivered)discardUnsentPhoto(gid,newPhoto);}
  };
  return await (lockedCategory(category)?withSourceLock(sourceLockKey(gid,category),publish):publish());
 }catch(e){if(!stillCurrent())return cancelled;r.error=err(e);r.nextAt=Date.now()+5*EVERY;save();console.error('Post failed',gid,cid,e);return 'تعذر النشر: '+r.error;}
 finally{busy.delete(key);}
}
async function postPcCollectionLinks(client,gid,cid){
 const room=currentRoom(gid,cid);validatePcWallpaperRoom(room);
 const channel=await client.channels.fetch(cid);
 if(!channel||channel.guildId!==gid||!channel.isTextBased()||!channel.send)throw Error('الروم غير متاح');
 if(!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw Error('البوت يحتاج عرض الروم وإرسال الرسائل');
 // Authorized action: link to HTML pages only. Do not scrape or hotlink copyrighted images.
 await channel.send(ui(pcCollectionsMessage()));
 return `✅ أُرسلت روابط المجموعات إلى <#${cid}>. هذه روابط مجموعات الموقع.`;
}
async function scheduler(client){
 for(const [gid,g] of Object.entries(store.guilds))for(const [cid,r] of Object.entries(g.rooms||{})){
  if(!r.enabled||Date.now()<(r.nextAt||0))continue;
  await post(client,gid,cid);
 }
}
export function importImages(gid,category,force=false,options={}){
 if(lockedCategory(category)&&!options.sourceLockHeld)return withSourceLock(sourceLockKey(gid,category),()=>
  importImages(gid,category,force,{...options,sourceLockHeld:true}));
 const key=gid+':'+category;
 if(processingFetch.has(key))return processingFetch.get(key);
 const task=doImportImages(gid,category,force,options).finally(()=>processingFetch.delete(key));
 processingFetch.set(key,task);return task;
}
async function doImportImages(gid,category,force=false,{demand=false}={}){
 const g=guild(gid);
 if(!g.categories[category])throw Error('التصنيف غير موجود');
 if(!['anime','girls','boys','pc_wallpapers','movies'].includes(category))return 'هذا القسم غير مدعوم.';
 const fetchMinutes=Number(process.env.IMAGE_FETCH_INTERVAL_MINUTES)||80;
 g.fetchStatus??={};
 const previous=g.fetchStatus[category];
 if(!force&&previous?.retryAt>Date.now())return previous.state==='error'?'تعذر الجلب مؤخرًا: '+previous.error:'لم توجد نتائج مؤخرًا، سيُبحث لاحقًا';
 if(!force&&!demand&&Date.now()-(g.fetchAt[category]||0)<Math.max(30,Math.min(fetchMinutes,1440))*EVERY)return 'تم البحث مؤخرًا، سيُبحث لاحقًا';
 const fetched=(state,error=null,recordId=null)=>{
  const now=Date.now();g.fetchStatus[category]={state,at:now,error,recordId,fetchId:randomUUID(),retryAt:state==='success'?0:now+5*EVERY};
  if(state!=='error')g.fetchAt[category]=now;save();
 };
 try {
  const pending=category==='movies'?pendingMoviePacks(g):[];
  const pendingIds=new Set(pending.map(p=>p.id));
  const history=g.packs.filter(p=>!pendingIds.has(p.id));
  const last=new Set(history.flatMap(x=>[x.sourceId,...(x.sourceIds||[])]).filter(Boolean));
  const seenLinks=Object.values(g.rooms).flatMap(room=>room.wallhavenUsedIds||[]);
  for(const id of seenLinks)last.add(id);
  const options={seed:Math.floor(Date.now()/(80*EVERY))%99};
  if(category==='movies'){
   const known=packs(gid).filter(p=>!pendingIds.has(p.id)),hashes=new WeakMap();
   const fingerprint=buffer=>{
    if(!hashes.has(buffer))hashes.set(buffer,visualHash(buffer));
    return hashes.get(buffer);
   };
   options.validate=async(avatar,banner,limits)=>{
    const qa=await validatePair(avatar,banner,limits);
    const [avatarHash,bannerHash]=await Promise.all([fingerprint(avatar),fingerprint(banner)]);
    const candidate={visualHash:avatarHash,bannerVisualHash:bannerHash,avatarDHash:qa.avatarHash,bannerDHash:qa.bannerHash};
    if(known.some(p=>samePhoto(p,candidate)))throw Error('صور الفيلم مستخدمة سابقًا؛ جرب صورًا أخرى');
    return qa;
   };
  }
  const external=await fetchCategoryAssets(category,last,options);
  if(!external){fetched('empty');return 'لا توجد صورة جديدة مناسبة لهذا القسم؛ لن أكرر الصور أو آخذها من قسم آخر.';}
  if(external.linkOnly){fetched('success');return `🔎 ${category}: ${external.sourceUrl}\nمعاينة Wallhaven تُنشر تلقائيًا في الروم المرتبط بهذا القسم. تُجلب الخلفيات مباشرة من الموقع.`;}
  const id=pending.at(-1)?.id||'sas-'+randomUUID().replaceAll('-','').slice(0,14);
  if(external.remote){
   const record=addPack(gid,{...external,id,category,kind:'profile',importedAutomatically:true,categoryVerified:true});
   fetched('success',null,record.id);return `✅ أضفت طقمًا جديدًا لقسم ${category} من Unsplash. (${record.id})`;
  }
  let fileInfo;
  try {
   fileInfo=await normalizeFromUpload(gid,id,category,external.image||external.avatar,external.banner||null);
   const record=(category==='movies'?saveFetchedMovie:addPack)(gid,{...fileInfo,id,category,title:external.title,sourceId:external.sourceId,sourceIds:external.sourceIds||[external.sourceId],sourceUrl:external.sourceUrl,sourceBannerUrl:external.sourceBannerUrl||null,license:external.license,credit:external.credit,importedAutomatically:true,categoryVerified:true,photoVerified:external.photoVerified===true,filmVerified:category==='movies',verificationSource:external.verificationSource,provider:external.provider,boysStyle:external.boysStyle,boysTheme:external.boysTheme});fetched('success',null,record.id);
   return `✅ أضفت صورة جديدة لقسم ${category} من ${external.provider}. (${record.id})`;
  }catch(e){if(fileInfo)await deleteCustom(fileInfo);throw e;}
 }catch(e){fetched('error',err(e));return 'تعذر الجلب: '+err(e);}
}
// Creates only missing channels, leaves existing channels untouched.
// Requires a real user with Manage Server and the bot with Manage Channels.
const CHANNEL_NAMES=Object.freeze({anime:'anime',movies:'movies',girls:'girls',boys:'boys',pc_wallpapers:'pc-wallpapers'});
async function setupFiveRooms(i){
 if(!admin(i))throw Error('فقط إدارة السيرفر تستطيع تجهيز الرومات');
 const server=i.guild;
 if(!server)throw Error('الأمر يعمل داخل سيرفر فقط');
 const botMember=await server.members.fetchMe();
 if(!botMember.permissions.has(PermissionFlagsBits.ManageChannels))throw Error('أعط البوت Manage Channels حتى ينشئ الرومات. يمكنك أيضًا إنشاؤها بنفسك ثم استخدام ربط روم.');
 const all=await server.channels.fetch();
 const g=guild(i.guildId);const made=[];const reused=[];const mapped={};
 for(const [category,name] of Object.entries(CHANNEL_NAMES)){
  let channel=all.find(x=>x?.type===ChannelType.GuildText&&x.name===name);
  if(channel){reused.push(channel);} else {
   channel=await server.channels.create({name,type:ChannelType.GuildText,reason:'ABO 7RB — five separate image sections'});
   made.push(channel);
  }
  mapped[category]=channel.id;
  // Reuse existing bindings so custom schedules/status aren't reset on upgrades.
  if(!g.rooms[channel.id]||g.rooms[channel.id].category!==category){
   g.rooms[channel.id]=makeRoom(category,40);
  }
 }
 save();
 return `✅ تم تجهيز الأقسام الخمسة.\nأنشئت ${made.length} روم، واستُخدم ${reused.length} روم موجود.\n`+
 Object.entries(mapped).map(([category,id])=>`• <#${id}> — ${category}`).join('\n');
}
async function previewFromWebsite(gid,category,{sourceLockHeld=false}={}){
 if(lockedCategory(category)&&!sourceLockHeld)return withSourceLock(sourceLockKey(gid,category),()=>
  previewFromWebsite(gid,category,{sourceLockHeld:true}));
 if(!guild(gid).categories[category])throw Error('التصنيف غير موجود');
 if(category==='pc_wallpapers'){
  if(process.env.WALLHAVEN_ENABLED==='false')throw Error('Wallhaven معطل في الإعدادات');
  const item=await searchWallhaven(category,new Set(),{seed:Math.floor(Date.now()/60000)%10000});
  if(!item)return ui('لا توجد خلفية مناسبة من الموقع');
  const embed=new EmbedBuilder();
  if(showImageCredits())embed.setURL(item.sourceUrl);
  if(item.preview)embed.setImage(item.preview);
  return ui('',{embeds:[embed]});
 }
 const before=new Set(guild(gid).packs.map(p=>p.id));
 const previousFetchId=guild(gid).fetchStatus?.[category]?.fetchId;
 const result=await importImages(gid,category,false,{demand:true,sourceLockHeld});
 const status=guild(gid).fetchStatus?.[category];
 const p=status?.state==='success'&&(category==='movies'?status.fetchId&&status.fetchId!==previousFetchId:!before.has(status.recordId))?pack(gid,status.recordId):null;
 if(!p)return ui(result);
 if(p.remote&&!photoCards())return ui('',{embeds:unsplashEmbeds(p)});
 try{
  const out=await renderCard(p);
  return ui('',{files:[new AttachmentBuilder(out.buffer,{name:out.filename})]});
 }catch(error){if(p.remote)discardUnsentPhoto(gid,p);throw error;}
}
async function commands(i,client){
 const name=i.commandName,gid=i.guildId,channel=i.options.getChannel('channel');
 const adminNames=new Set(['تجهيز-الرومات','ربط-روم','فصل-روم','تشغيل-روم','إيقاف-روم','مدة-النشر','نشر-الآن','جلب-صور','مجموعات-4k','معاينة']);
 if(adminNames.has(name)&&!admin(i))return i.reply(ep('⛔ هذا الأمر يحتاج صلاحية إدارة السيرفر.'));
 if(name==='تجهيز-الرومات'){await i.deferReply(ep(''));return i.editReply(await setupFiveRooms(i));}
 if(name==='لوحة-التحكم'||name==='مساعدة')return i.reply(HOME());
 if(name==='التصنيفات')return i.reply(ep(categoryText(gid)));
 if(name==='الرومات')return i.reply(ep(roomText(gid)));
 if(name==='حالة')return i.reply(ep(stateText(gid)));
 if(name==='معاينة'){await i.deferReply(ep(''));return i.editReply(await previewFromWebsite(gid,i.options.getString('category',true)));}
 if(name==='ربط-روم'){
  const c=i.options.getString('category',true);if(!guild(gid).categories[c])throw Error('التصنيف غير موجود');
  guild(gid).rooms[channel.id]=makeRoom(c,i.options.getInteger('minutes')||40);save();return i.reply(ep(`✅ تم ربط ${channel} بقسم ${c}، كل ${guild(gid).rooms[channel.id].minutes} دقيقة.`));
 }
 if(name==='فصل-روم'){delete guild(gid).rooms[channel.id];save();return i.reply(ep('✅ تم فصل الروم.'));}
 if(name==='تشغيل-روم'||name==='إيقاف-روم'){
  const r=currentRoom(gid,channel.id);r.enabled=name==='تشغيل-روم';r.nextAt=Date.now()+5000;r.revision=(r.revision||0)+1;save();return i.reply(ep(r.enabled?'✅ تم التشغيل':'✅ تم الإيقاف'));
 }
 if(name==='مدة-النشر'){
  const r=currentRoom(gid,channel.id);r.minutes=parseMinutes(i.options.getInteger('minutes',true));r.nextAt=Date.now()+r.minutes*EVERY;r.revision=(r.revision||0)+1;save();return i.reply(ep(`✅ المدة ${r.minutes} دقيقة`));
 }
 if(name==='نشر-الآن'){await i.deferReply(ep(''));return i.editReply(await post(client,gid,channel.id,{forced:true}));}
 if(name==='استكشاف-وولهيفن'){
  await i.deferReply(ep(''));
  const cat=i.options.getString('category',true);
  if(cat==='movies')return i.editReply('قسم الأفلام يستخدم Fanart.tv؛ اختر قسمًا آخر لاستكشاف Wallhaven.');
  const example=await searchWallhaven(cat,new Set(),{seed:Math.floor(Date.now()/60000)%10000});
  return i.editReply(example?`🔎 ${cat}: ${example.sourceUrl}\nهذه معاينة مصدر، وليست أفتارًا أو بنرًا معتمدًا للنشر.`:'لم أجد نتيجة جديدة مطابقة لفلاتر المصدر.');
 }
 if(name==='مجموعات-4k'){await i.deferReply(ep(''));return i.editReply(await postPcCollectionLinks(client,gid,channel.id));}
 if(name==='مصادر')return i.reply(ep(SOURCE_CREDITS));
 if(name==='جلب-صور'){await i.deferReply(ep(''));return i.editReply(await importImages(gid,i.options.getString('category',true),true));}
 return i.reply(ep('هذا الأمر أزيل في النسخة الجديدة. افتح /لوحة-التحكم لاختيار الأوامر الحالية.'));
}
async function menus(i,client){
 const id=i.customId,gid=i.guildId;
 if(id==='sas:menu'){
  const action=i.values[0],readOnly=new Set(['categories','rooms','status','credits']);
  if(!ACTIONS.some(([value])=>value===action))return i.update(ui('هذا الخيار أزيل. اختر أمرًا من القائمة الجديدة:',{components:[panel()]}));
  if(!readOnly.has(action)&&!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  if(action==='setup-rooms'){await i.deferUpdate();const text=await setupFiveRooms(i);return i.editReply(ui(text,{components:[panel()]}));}
  if(action==='categories')return i.update(ui(categoryText(gid),{components:[panel()]}));
  if(action==='rooms')return i.update(ui(roomText(gid),{components:[panel()]}));
  if(action==='status')return i.update(ui(stateText(gid),{components:[panel()]}));
  if(action==='credits')return i.update(ui(SOURCE_CREDITS,{components:[panel()]}));
  if(action==='preview')return i.update(ui('اختر تصنيف المعاينة:',{components:[catRow(gid,'preview')]}));
  if(action==='fetch')return i.update(ui('اختر التصنيف الذي تريد جلب الصور له:',{components:[catRow(gid,'fetch')]}));
  if(action==='wallhaven')return i.update(ui('اختر تصنيفًا لاستعراض رابط من Wallhaven (لا ينشر تلقائيًا):',{components:[catRow(gid,'wallhaven')]}));
  return i.update(ui('اختر الروم:',{components:[chanRow(action)]}));
 }
 if(id.startsWith('sas:channel:')){
  if(!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  const action=id.split(':')[2],cid=i.values[0];
  if(action==='bind')return i.update(ui('اختر التصنيف:',{components:[catRow(gid,action,cid)]}));
  if(action==='minutes')return i.showModal(modal('minutes',cid));
  if(action==='start'||action==='stop'){
   const r=currentRoom(gid,cid);r.enabled=action==='start';r.nextAt=Date.now()+5000;r.revision=(r.revision||0)+1;save();return i.update(ui('✅ تم '+(r.enabled?'التشغيل':'الإيقاف'),{components:[panel()]}));
  }
  if(action==='unbind'){delete guild(gid).rooms[cid];save();return i.update(ui('✅ تم الفصل',{components:[panel()]}));}
  if(action==='post'){await i.deferUpdate();const res=await post(client,gid,cid,{forced:true});return i.editReply(ui(res,{components:[panel()]}));}
  if(action==='4k-links'){await i.deferUpdate();const res=await postPcCollectionLinks(client,gid,cid);return i.editReply(ui(res,{components:[panel()]}));}
  return i.update(ui('هذا الخيار أزيل. اختر أمرًا من القائمة الجديدة:',{components:[panel()]}));
 }
 if(id.startsWith('sas:category:')){
  const [, , action,cid]=id.split(':'),cat=i.values[0];
  if(!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  if(action==='bind'){
   guild(gid).rooms[cid]=makeRoom(cat,40);save();return i.update(ui(`✅ ربطت <#${cid}> بقسم ${cat} — كل 40 دقيقة`,{components:[panel()]}));
  }
  if(action==='preview'){await i.deferUpdate();return i.editReply({...await previewFromWebsite(gid,cat),components:[panel()]});}
  if(action==='fetch'){await i.deferUpdate();const res=await importImages(gid,cat,true);return i.editReply(ui(res,{components:[panel()]}));}
  if(action==='wallhaven'){
   await i.deferUpdate();
   if(cat==='movies')return i.editReply(ui('قسم الأفلام يستخدم Fanart.tv؛ اختر قسمًا آخر لاستكشاف Wallhaven.',{components:[panel()]}));
   const example=await searchWallhaven(cat,new Set(),{seed:Math.floor(Date.now()/60000)%10000});
   return i.editReply(ui(example?`🔎 ${cat}: ${example.sourceUrl}\nهذا رابط مصدر، وليس طقمًا متناسقًا معتمدًا للنشر.`:'لا توجد نتيجة مناسبة بهذا البحث.',{components:[panel()]}));
  }
  return i.update(ui('هذا الخيار أزيل. اختر أمرًا من القائمة الجديدة:',{components:[panel()]}));
 }
}
async function buttons(i,client){
 const parts=i.customId.split(':'),action=parts[1],id=parts[2];
 if(action==='confirm'){
  if(!mod(i))return i.reply(ep('⛔ الحذف للمشرفين فقط'));
  await i.deferUpdate();
  const channel=await client.channels.fetch(i.channelId);
  const original=await channel.messages.fetch(id);
  if(original.author?.id!==client.user.id)throw Error('لا يمكن حذف رسالة لا تخص البوت');
  await original.delete();return i.editReply(ui('✅ حُذف المنشور فقط.',{components:[]}));
 }
 if(action==='delete'&&/^wh_[a-z0-9]{6}$/i.test(id)) {
  if(!mod(i))return i.reply(ep('⛔ الحذف للمشرفين فقط'));
  const confirm=new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`sas:confirm:${i.message.id}`).setLabel('تأكيد حذف المنشور').setStyle(ButtonStyle.Danger));
  return i.reply(ep('هل تريد حذف منشور الخلفية من الروم؟',{components:[confirm]}));
 }
 const p=pack(i.guildId,id);
 if(!p)return i.reply(ep('ملفات هذه الصورة لم تعد متاحة.'));
 if(action==='download'){
  if(p.remote&&!photoCards()){
   await i.deferReply(ep(''));
   await trackUnsplashPair(p);
   return i.editReply(ui('',{embeds:unsplashEmbeds(p),components:[]}));
  }
  await i.deferReply(ep(''));
  const {mediaPath}=await import('./db.js');
  const image=p.kind==='profile'?new AttachmentBuilder((await renderCard(p)).buffer,{name:'profile-card.png'}):
   new AttachmentBuilder(mediaPath(p.avatar),{name:'pc-wallpaper.jpg'});
  if(p.remote)await trackUnsplashPair(p);
  return i.editReply(ui('',{files:[image],components:[]}));
 }

 if(action==='edit'){
  if(!admin(i))return i.reply(ep('⛔ التعديل للمشرفين فقط'));
  const m=new ModalBuilder().setCustomId('sas:rename:'+id).setTitle('تعديل اسم الطقم');
  const inp=new TextInputBuilder().setCustomId('name').setLabel('اسم الطقم').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(55).setValue(p.title||'صورة');
  return i.showModal(m.addComponents(new ActionRowBuilder().addComponents(inp)));
 }
 if(action==='delete'){
  if(!mod(i))return i.reply(ep('⛔ الحذف للمشرفين فقط'));
  const confirm=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sas:confirm:${i.message.id}`).setLabel('تأكيد حذف المنشور').setStyle(ButtonStyle.Danger));
  return i.reply(ep('هل تريد حذف هذا المنشور من الروم؟ (تظل ملفات التحميل وسجل منع التكرار)',{components:[confirm]}));
 }
}
async function modals(i){
 const [,action,value]=i.customId.split(':');
 if(!admin(i))return i.reply(ep('⛔ هذا الأمر للمشرفين فقط'));
 if(action==='modal'){
  // modal ID = sas:modal:minutes:channelId
  const chunks=i.customId.split(':');if(chunks[2]!=='minutes')return;
  const room=currentRoom(i.guildId,chunks[3]);room.minutes=parseMinutes(i.fields.getTextInputValue('minutes'));
  room.nextAt=Date.now()+room.minutes*EVERY;room.revision=(room.revision||0)+1;save();return i.reply(ep(`✅ وقت النشر ${room.minutes} دقيقة`));
 }
 if(action==='rename'){
  const p=pack(i.guildId,value);if(!p)throw Error('الصورة محذوفة');
  guild(i.guildId).titleOverrides[value]=i.fields.getTextInputValue('name').slice(0,55);save();return i.reply(ep('✅ تم تعديل اسم الطقم'));
 }
}
export async function startAutomation(client,{timers=globalThis}={}){
 // Reconcile before any timer can publish, including the initial 5-second tick.
 try{await recoverPreviousPosts(client);}catch(e){console.warn('History reconciliation',err(e));}
 const handles=[];let stopped=false,posting=false;
 const schedule=(kind,callback,ms)=>handles.push([kind,timers[kind](callback,ms)]);
 const postTick=async()=>{
  if(stopped||posting)return;posting=true;
  try{await scheduler(client);}catch(e){console.error('Automatic posting:',err(e));}
  finally{posting=false;}
 };
 schedule('setInterval',postTick,20000);
 schedule('setTimeout',postTick,5000);
 return {stop(){
  stopped=true;
  for(const [kind,handle] of handles)timers[kind==='setInterval'?'clearInterval':'clearTimeout'](handle);
 }};
}
export async function handleInteraction(i,client){
 try{
  if(!i.guildId)return;
  if(i.isAutocomplete()){
   const q=String(i.options.getFocused()||'').toLowerCase();
   const matches=Object.entries(guild(i.guildId).categories).filter(([key,title])=>key.includes(q)||title.includes(q)).slice(0,25);
   return await i.respond(matches.map(([value,name])=>({name:name.slice(0,100),value})));
  }
  if(i.isChatInputCommand())return await commands(i,client);
  if(i.isStringSelectMenu()||i.isChannelSelectMenu())return await menus(i,client);
  if(i.isButton())return await buttons(i,client);
  if(i.isModalSubmit())return await modals(i);
 }catch(e){
  // DiscordAPIError can contain the token-bearing interaction webhook URL.
  console.error('Interaction error',err(e));
  if(i.isAutocomplete()){
   if(!i.responded)await i.respond([]).catch(()=>{});
   return;
  }
  const reply=ep('❌ '+err(e));
  if(i.deferred||i.replied)await i.editReply(ui(reply.content)).catch(()=>{});
  else await i.reply(reply).catch(()=>{});
 }
}

export async function start(token){
 const client=new Client({intents:[GatewayIntentBits.Guilds]});
 migrateLegacySettings();
 client.once(Events.ClientReady,async c=>{
  console.log('✅ Logged in as '+c.user.tag);
  const buttonIcons=await setupImageButtonEmojis(c);
  if(buttonIcons.failed.length)console.warn('⚠️ تعذر تجهيز بعض أيقونات الأزرار؛ تُستخدم رموز بديلة:',buttonIcons.failed.join(', '));
  else console.log('✅ أيقونات الأزرار جاهزة');
  try{
   const rest=new REST({version:'10'}).setToken(token);
   const target=process.env.GUILD_ID?.trim();
   await rest.put(target?Routes.applicationGuildCommands(c.user.id,target):Routes.applicationCommands(c.user.id),{body:cmds});
   console.log('✅ تم تسجيل '+cmds.length+' أمرًا'+(target?' في السيرفر':' عالميًا'));
  }catch(e){console.error('⚠️ تعذر تسجيل الأوامر:',err(e));}
  await startAutomation(client);
 });
 client.on(Events.InteractionCreate,i=>handleInteraction(i,client));
 client.on(Events.Error,e=>console.error('Discord client error',e));
 await client.login(token);
}
