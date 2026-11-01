import {Client,GatewayIntentBits,Events,REST,Routes,PermissionFlagsBits,AttachmentBuilder,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ChannelSelectMenuBuilder,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags} from 'discord.js';
import {cmds,ACTIONS} from './commands.js';
import {guild,store,save,pack,packs,makeRoom,choose,sent,addPack,removePack,kindFor,migrateLegacySettings} from './db.js';
import {renderCard,downloadAttachment,normalizeFromUpload,deleteCustom} from './media.js';
import {searchWallhaven} from './wallhaven-source.js';
import {fetchCategoryAssets,SOURCE_CREDITS} from './image-sources.js';
import {trackUnsplashPair} from './unsplash-source.js';
import {isUnsplashRecord} from './unsplash-record.js';
import {collectRecentPostIds,reconcileRoom} from './history.js';
import {upgradeLibraryFingerprints} from './library-maintenance.js';
import {getOwnDiscordPair} from './member-source.js';
import {pcCollectionsMessage,validatePcWallpaperRoom} from './wallpaper-links.js';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
const sourcesOnly=()=>process.env.SOURCE_ONLY!=='false';
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
const icon=(id,uni,customId)=>{const b=new ButtonBuilder().setCustomId(id).setStyle(ButtonStyle.Secondary);
 b.setEmoji(customId&&/^\d{17,21}$/.test(customId)?{id:customId}:uni);return b;};
const rowFor=(id,bannerKey=null)=>new ActionRowBuilder().addComponents(
 icon(`sas:download:${id}${bannerKey?':'+bannerKey:''}`,'⬇️',process.env.DOWNLOAD_EMOJI_ID),
 icon(`sas:edit:${id}${bannerKey?':'+bannerKey:''}`,'✏️',process.env.EDIT_EMOJI_ID),
 icon(`sas:delete:${id}${bannerKey?':'+bannerKey:''}`,'🗑️',process.env.DELETE_EMOJI_ID));
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
 const left=Object.values(g.rooms).map(r=>{
  const used=new Set(r.usedIds||[]);return `${r.category}: ${packs(gid,r.category).filter(p=>!used.has(p.id)).length} غير منشورة${r.error?' • ⚠️ '+r.error:''}`;
 }).join('\n');
 const keys=`Unsplash: ${process.env.UNSPLASH_ACCESS_KEY?'مفتاح موجود':'⚠️ يحتاج UNSPLASH_ACCESS_KEY'} • Fanart.tv: ${process.env.FANART_API_KEY?'مفتاح موجود':'⚠️ يحتاج FANART_API_KEY'}`;
 const sources=Object.entries(g.fetchStatus||{}).map(([category,status])=>
  `${category}: ${status.state==='error'?'⚠️ '+status.error:status.state==='empty'?'لا توجد نتائج جديدة':'نجح آخر جلب'}`).join('\n');
 const wallhaven=process.env.WALLHAVEN_ENABLED==='false'?'Wallhaven: معطل':'Wallhaven: معاينات الأنمي وخلفيات PC';
 return `**الحالة**\nوضع النشر: ${sourcesOnly()?'من المواقع فقط':'المكتبة والمواقع'}\nالرومات: ${Object.keys(g.rooms).length}\nالأطقم المتاحة: ${packs(gid).length}\nالنشر الافتراضي: 40 دقيقة\n${left}\n${keys}\n${wallhaven}\n${sources}\n${roomText(gid)}`.slice(0,1950);
}
async function recoverPreviousPosts(client){
 let modified=false;
 for(const [gid,g] of Object.entries(store.guilds))for(const [cid,room] of Object.entries(g.rooms||{})){
  try{
   const channel=await client.channels.fetch(cid);
   if(!channel?.messages?.fetch || channel.guildId!==gid)continue;
   const ids=await collectRecentPostIds(channel,client.user.id,5);
   if(ids.length){reconcileRoom(room,ids);modified=true;}
  }catch(e){console.warn('History sync unavailable for',cid,err(e));}
 }
 if(modified)save();
}
function categoryText(gid){return Object.entries(guild(gid).categories).map(([key,title])=>`• ${title} — ${packs(gid,key).length} صورة`).join('\n').slice(0,1750);}
export function unsplashEmbeds(record){
 if(!isUnsplashRecord(record))throw Error('بيانات صور Unsplash غير صالحة');
 const name=value=>String(value).replace(/[\[\]()*_`<>]/g,'').slice(0,90);
 const a=record.credits.avatar,b=record.credits.banner;
 const text=`[الأفتار](${record.sourceUrl}) • تصوير [${name(a.name)}](${a.url})\n`+
  `[البنر](${record.sourceBannerUrl}) • تصوير [${name(b.name)}](${b.url})\n`+
  'على [Unsplash](https://unsplash.com/?utm_source=abo7rb&utm_medium=referral)';
 return [new EmbedBuilder().setTitle(record.category==='boys'?'🖤 أفتار وبنر شباب':'🌸 أفتار وبنر بنات')
  .setURL(record.sourceBannerUrl).setDescription(text).setImage(record.bannerURL).setThumbnail(record.avatarURL)
  .setFooter({text:'ABO 7RB • Unsplash'})];
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
  const channel=await client.channels.fetch(cid);
  if(!stillCurrent())return cancelled;
  if(!channel||channel.guildId!==gid||!channel.isTextBased()||!channel.send)throw Error('الروم غير متاح');
  if(!channel.permissionsFor(client.user)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))throw Error('صلاحيات View Channel وSend Messages وEmbed Links مطلوبة');
  let sourceFailure=null;
  // Wallhaven serves source links + preview, not rehosted/edited files.
  // Never turn unlicensed Wallhaven submissions into stored avatar/banner pairs.
  if((r.category==='pc_wallpapers'||r.category==='anime'&&!sourcesOnly())&&process.env.WALLHAVEN_ENABLED!=='false') {
   try{
    const result=await withSourceLock(gid,async()=>{
    if(!stillCurrent())return cancelled;
    const seen=new Set(Object.values(guild(gid).rooms).flatMap(room=>room.wallhavenUsedIds||[]));
    const chosen=await searchWallhaven(r.category,seen,{seed:Math.floor(Date.now()/60000)%10000});
    if(!stillCurrent())return cancelled;
    if(chosen){
     const embed=new EmbedBuilder().setTitle(r.category==='anime'?'🎌 صورة أنمي جديدة':'🖥️ خلفية شاشة جديدة').setURL(chosen.sourceUrl)
       .setDescription(`${chosen.width}×${chosen.height} • [عرض وتحميل من المصدر](${chosen.sourceUrl})`)
       .setFooter({text:'ABO 7RB • Wallhaven (رابط المصدر؛ الحقوق لأصحابها)'});
     if(chosen.preview)embed.setImage(chosen.preview);
     const actions=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(chosen.sourceUrl).setLabel('فتح الخلفية'),
      icon(`sas:delete:wh_${chosen.rawId}`,'🗑️',process.env.DELETE_EMOJI_ID));
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
  if(sourcesOnly()){
   if(pairCategory&&process.env.AUTO_FETCH!=='false'){
    const before=new Set(guild(gid).packs.map(p=>p.id));
    await importImages(gid,r.category,false,{demand:true});
    const status=guild(gid).fetchStatus?.[r.category];
    if(status?.state==='success'&&status.recordId&&!before.has(status.recordId)){
     const fresh=pack(gid,status.recordId);
     const provider=r.category==='movies'?'Fanart.tv':r.category==='anime'?'Wallhaven':'Unsplash';
     if(fresh?.importedAutomatically&&fresh.category===r.category&&fresh.provider===provider)picked=fresh;
    }
   }else if(pairCategory)sourceFailure='الجلب معطل؛ فعّل AUTO_FETCH=true للنشر من المواقع';
   else if(process.env.WALLHAVEN_ENABLED==='false')sourceFailure='مصدر Wallhaven معطل؛ فعّل WALLHAVEN_ENABLED=true';
  }else{
   picked=choose(gid,r);
   if(!picked&&pairCategory&&process.env.AUTO_FETCH!=='false'){
    await importImages(gid,r.category,false,{demand:true});picked=choose(gid,r);
   }
  }
  if(!stillCurrent())return cancelled;
  if(!picked){
   const status=guild(gid).fetchStatus?.[r.category];
   const reason=sourceFailure||(status?.state==='error'?status.error:null);
   r.nextAt=Date.now()+(reason?5:Math.max(10,r.minutes))*EVERY;
   r.error=reason||(sourcesOnly()?'لم يعثر المصدر على صور جديدة مناسبة لقسم ':'نفدت الصور غير المكررة لقسم ')+r.category;save();
   return reason?'تعذر جلب صور جديدة: '+reason:'لا توجد صور جديدة؛ توقفت دورة التكرار حتى تتوفر صور أخرى';
  }
  if(picked.remote){
   await trackUnsplashPair(picked);
   if(!stillCurrent())return cancelled;
   await channel.send({embeds:unsplashEmbeds(picked),components:[rowFor(picked.id)],allowedMentions:{parse:[]}});
   sent(r,picked.id);save();return `تم النشر في <#${cid}>`;
  }
  if(!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.AttachFiles))throw Error('صلاحية Attach Files مطلوبة لنشر الأطقم');
  // Only pre-approved avatar/banner pairs from one manifest record.
  // This replaces the previous unsafe random banner mixing.
  const output=await renderCard(picked);
  if(!stillCurrent())return cancelled;
  const credit=new EmbedBuilder()
    .setImage(`attachment://${output.filename}`)
    .setFooter({text:'ABO 7RB • '+(picked.provider||'صور من مكتبة القسم')});
  if(picked.sourceUrl&&picked.sourceIds?.length) {
   const creditText=String(picked.credit||'').replace(/[\[\]()*_`]/g,'').slice(0,180);
   const links=[`[مصدر الأفتار](${picked.sourceUrl})`,picked.sourceBannerUrl?`[مصدر البنر](${picked.sourceBannerUrl})`:null].filter(Boolean).join(' • ');
   credit.setDescription(`${links}\n${creditText}\nالترخيص: ${String(picked.license||'').slice(0,160)}`);
  }
  await channel.send({files:[new AttachmentBuilder(output.buffer,{name:output.filename})],embeds:[credit],components:[rowFor(picked.id)],allowedMentions:{parse:[]}});
  sent(r,picked.id);save();return `تم النشر في <#${cid}>`;
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
 return `✅ أُرسلت روابط المجموعات إلى <#${cid}>. صور الموقع ليست مضافة إلى مكتبة البوت.`;
}
async function scheduler(client){
 for(const [gid,g] of Object.entries(store.guilds))for(const [cid,r] of Object.entries(g.rooms||{})){
  if(!r.enabled||Date.now()<(r.nextAt||0))continue;
  await post(client,gid,cid);
 }
}
export function importImages(gid,category,force=false,options={}){
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
  const now=Date.now();g.fetchStatus[category]={state,at:now,error,recordId,retryAt:state==='success'?0:now+5*EVERY};
  if(state!=='error')g.fetchAt[category]=now;save();
 };
 try {
  const last=new Set(g.packs.flatMap(x=>[x.sourceId,...(x.sourceIds||[])]).filter(Boolean));
  const seenLinks=Object.values(g.rooms).flatMap(room=>room.wallhavenUsedIds||[]);
  for(const id of seenLinks)last.add(id);
  const external=await fetchCategoryAssets(category,last,{seed:Math.floor(Date.now()/(80*EVERY))%99});
  if(!external){fetched('empty');return 'لا توجد صورة جديدة مناسبة لهذا القسم؛ لن أكرر الصور أو آخذها من قسم آخر.';}
  if(external.linkOnly){fetched('success');return `🔎 ${category}: ${external.sourceUrl}\nمعاينة Wallhaven تُنشر تلقائيًا في الروم المرتبط بهذا القسم. الأطقم المحلية متاحة بالرفع اليدوي.`;}
  const id='sas-'+randomUUID().replaceAll('-','').slice(0,14);
  if(external.remote){
   const record=addPack(gid,{...external,id,category,kind:'profile',importedAutomatically:true,categoryVerified:true});
   fetched('success',null,record.id);return `✅ أضفت طقمًا جديدًا لقسم ${category} من Unsplash. (${record.id})`;
  }
  let fileInfo;
  try {
   fileInfo=await normalizeFromUpload(gid,id,category,external.image||external.avatar,external.banner||null);
   const record=addPack(gid,{...fileInfo,id,category,title:external.title,sourceId:external.sourceId,sourceIds:external.sourceIds||[external.sourceId],sourceUrl:external.sourceUrl,sourceBannerUrl:external.sourceBannerUrl||null,license:external.license,credit:external.credit,importedAutomatically:true,categoryVerified:true,photoVerified:external.photoVerified===true,filmVerified:category==='movies',verificationSource:external.verificationSource,provider:external.provider,boysStyle:external.boysStyle,boysTheme:external.boysTheme});fetched('success',null,record.id);
   return `✅ أضفت صورة جديدة لقسم ${category} من ${external.provider}. (${record.id})`;
  }catch(e){if(fileInfo)await deleteCustom(fileInfo);throw e;}
 }catch(e){fetched('error',err(e));return 'تعذر الجلب: '+err(e);}
}
async function addFromInteraction(i,category,avatar,banner,title,confirmPhoto=false,filmSource=null,confirmAnime=false){
 const gid=i.guildId;if(!guild(gid).categories[category])throw Error('التصنيف غير موجود');
 if(['girls','boys'].includes(category)&&confirmPhoto!==true)throw Error('لتجنب الأنمي: تأكد أنها صورة فوتوغرافية حقيقية، ثم فعّل خيار تأكيد أنها صورة واقعية.');
 if(category==='movies'&&(!filmSource||!/^https:\/\/[^\s]+$/i.test(filmSource)))throw Error('قسم الأفلام يتطلب رابط HTTPS لمصدر الفيلم الحقيقي (film_source)، وليس مجرد صورة سينمائية.');
 if(category==='anime'&&!confirmAnime)throw Error('لتأكيد أن الصورة أنمي وليست واقعية: فعّل خيار confirm_anime.');
 if(category!=='pc_wallpapers'&&!banner)throw Error('ارفع صورة أفتار وصورة بنر مختلفتين ومتناسقتين. لن يختار البوت بنرًا عشوائيًا.');
 const av=await downloadAttachment(avatar),bn=banner?await downloadAttachment(banner):null;
 const id='sas-'+randomUUID().replaceAll('-','').slice(0,14);
 let files;
 try{
  files=await normalizeFromUpload(gid,id,category,av,bn);
  addPack(gid,{...files,id,category,title:title||'طقم جديد',importedAutomatically:false,photoVerified:['girls','boys'].includes(category)&&confirmPhoto===true,categoryVerified:['girls','boys'].includes(category)?confirmPhoto===true:category==='movies'?Boolean(filmSource):true,verificationSource:['girls','boys'].includes(category)?'moderator-photo':'manual',filmVerified:category==='movies'&&Boolean(filmSource),sourceUrl:filmSource||null});save();
  return `✅ تمت إضافة الصورة لقسم \`${category}\`، والمعرّف \`${id}\``;
 }catch(e){if(files)await deleteCustom(files);throw e;}
}
// Optional opt-in: adapted from the member avatar / banner fetching used in
// Nekros-dsc/Pfp-Bot. Only the command caller's own profile can be imported.
async function importOwnProfile(i,client){
 const cat=i.options.getString('category',true);
 if(!['anime','girls','boys'].includes(cat))throw Error('استيراد الحساب متاح فقط لأقسام anime/girls/boys؛ الأفلام تحتاج مصدر فيلم موثق.');
 if(i.options.getBoolean('reviewed',true)!==true)throw Error('لازم تتأكد أن صور الحساب متناسقة وتناسب القسم قبل استيرادها.');
 const profile=await getOwnDiscordPair(client,i.user.id);
 if(!profile.bannerURL)throw Error('حسابك ليس لديه بنر منفصل. استخدم /إضافة-صورة لرفع أفتار وبنر.');
 const av=await fetchDiscordMedia(profile.avatarURL),bn=await fetchDiscordMedia(profile.bannerURL);
 const id='self-'+randomUUID().slice(0,16);let files;
 try{
  files=await normalizeFromUpload(i.guildId,id,cat,av,bn);
  addPack(i.guildId,{...files,id,category:cat,title:'أفتار وبنر من حساب المشرف',importedAutomatically:false,photoVerified:['girls','boys'].includes(cat),categoryVerified:true,verificationSource:['girls','boys'].includes(cat)?'moderator-photo':'manual',reviewedWithV86:true,filmVerified:false,sourceUrl:null});
  save();return `✅ تمت إضافة أفتارك وبنرك الشخصيين بعد مراجعتك للتصنيف: ${cat}.`;
 }catch(e){if(files)await deleteCustom(files);throw e;}
}
async function fetchDiscordMedia(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))throw Error('المصدر ليس من Discord');
 const resp=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!resp.ok||!String(resp.headers.get('content-type')).startsWith('image/'))throw Error('لم أتمكن من تنزيل الصورة');
 const len=Number(resp.headers.get('content-length')||0);if(len>8_000_000)throw Error('حجم الملف كبير');
 const bytes=Buffer.from(await resp.arrayBuffer());if(bytes.length>8_000_000)throw Error('حجم الملف كبير');return bytes;
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
async function commands(i,client){
 const name=i.commandName,gid=i.guildId,channel=i.options.getChannel('channel');
 const adminNames=new Set(['تجهيز-الرومات','مصدر-صور','إيقاف-مصدر','ربط-روم','فصل-روم','تشغيل-روم','إيقاف-روم','مدة-النشر','نشر-الآن','إضافة-صورة','حذف-صورة','جلب-صور','مجموعات-4k','استيراد-حسابي']);
 if(adminNames.has(name)&&!admin(i))return i.reply(ep('⛔ هذا الأمر يحتاج صلاحية إدارة السيرفر.'));
 if(name==='تجهيز-الرومات'){await i.deferReply(ep(''));return i.editReply(await setupFiveRooms(i));}
 if(name==='لوحة-التحكم'||name==='مساعدة')return i.reply(HOME());
 if(name==='التصنيفات')return i.reply(ep(categoryText(gid)));
 if(name==='الرومات')return i.reply(ep(roomText(gid)));
 if(name==='حالة')return i.reply(ep(stateText(gid)));
 if(name==='معاينة'){
  await i.deferReply(ep(''));
  const p=i.options.getString('id')?pack(gid,i.options.getString('id')):packs(gid,i.options.getString('category')||null)[0];
  if(!p)return i.editReply('القسم فارغ أو المعرّف غير موجود');
  if(p.remote)return i.editReply({content:'معاينة خاصة',embeds:unsplashEmbeds(p),files:[]});
  const out=await renderCard(p);return i.editReply({content:'معاينة خاصة',embeds:[],attachments:[],files:[new AttachmentBuilder(out.buffer,{name:out.filename})]});
 }
 if(name==='مصدر-صور'){
  const cat=i.options.getString('category',true);if(!guild(gid).categories[cat])throw Error('التصنيف غير موجود');
  guild(gid).sources[channel.id]=cat;save();return i.reply(ep('✅ تم ربط مصدر الصور. فعّل ENABLE_SOURCE_CHANNELS=true في .env ثم أعد التشغيل.'));
 }
 if(name==='إيقاف-مصدر'){delete guild(gid).sources[channel.id];save();return i.reply(ep('✅ توقف استيراد الصور من هذا الروم'));}
 if(name==='عرض-الصور'){
  const p=packs(gid,i.options.getString('category')||null).slice(0,35);
  return i.reply(ep(p.length?p.map(x=>`• \`${x.id}\` — ${x.category}`).join('\n'):'المكتبة فارغة في هذا القسم.'));
 }
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
 if(name==='إضافة-صورة'){
  await i.deferReply(ep(''));
  return i.editReply(await addFromInteraction(i,i.options.getString('category',true),i.options.getAttachment('avatar',true),i.options.getAttachment('banner'),i.options.getString('title'),i.options.getBoolean('confirm_photo'),i.options.getString('film_source'),i.options.getBoolean('confirm_anime')));
 }
 if(name==='حذف-صورة'){
  const id=i.options.getString('id',true);const p=removePack(gid,id);if(!p)return i.reply(ep('هذا الطقم غير قابل للحذف أو غير موجود.'));
  save();await deleteCustom(p);return i.reply(ep('✅ حذفت الطقم من المكتبة.'));
 }
 if(name==='مصادر')return i.reply(ep(SOURCE_CREDITS));
 if(name==='جلب-صور'){await i.deferReply(ep(''));return i.editReply(await importImages(gid,i.options.getString('category',true),true));}
 if(name==='استيراد-حسابي'){await i.deferReply(ep(''));return i.editReply(await importOwnProfile(i,client));}
}
async function menus(i,client){
 const id=i.customId,gid=i.guildId;
 if(id==='sas:menu'){
  const action=i.values[0],readOnly=new Set(['categories','rooms','status','packs','preview']);
  if(!readOnly.has(action)&&!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  if(action==='setup-rooms'){await i.deferUpdate();const text=await setupFiveRooms(i);return i.editReply(ui(text,{components:[panel()]}));}
  if(action==='categories')return i.update(ui(categoryText(gid),{components:[panel()]}));
  if(action==='rooms')return i.update(ui(roomText(gid),{components:[panel()]}));
  if(action==='status')return i.update(ui(stateText(gid),{components:[panel()]}));
  if(action==='credits')return i.update(ui(SOURCE_CREDITS,{components:[panel()]}));
  if(action==='packs')return i.update(ui(packs(gid).slice(0,35).map(x=>`• ${x.id} — ${x.category}`).join('\n')||'المكتبة فارغة',{components:[panel()]}));
  if(action==='preview')return i.update(ui('اختر تصنيف المعاينة:',{components:[catRow(gid,'preview')]}));
  if(action==='add')return i.update(ui('لرفع الصور استخدم الأمر **/إضافة-صورة** واختر القسم ثم ارفع الأفتار والبنر.',{components:[panel()]}));
  if(action==='fetch')return i.update(ui('اختر التصنيف الذي تريد جلب الصور له:',{components:[catRow(gid,'fetch')]}));
  if(action==='wallhaven')return i.update(ui('اختر تصنيفًا لاستعراض رابط من Wallhaven (لا يُرفع تلقائيًا للمكتبة):',{components:[catRow(gid,'wallhaven')]}));
  return i.update(ui('اختر الروم:',{components:[chanRow(action)]}));
 }
 if(id.startsWith('sas:channel:')){
  if(!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  const action=id.split(':')[2],cid=i.values[0];
  if(['bind','source'].includes(action))return i.update(ui('اختر التصنيف:',{components:[catRow(gid,action,cid)]}));
  if(action==='minutes')return i.showModal(modal('minutes',cid));
  if(action==='source-stop'){delete guild(gid).sources[cid];save();return i.update(ui('✅ توقف الاستيراد من هذا الروم',{components:[panel()]}));}
  if(action==='start'||action==='stop'){
   const r=currentRoom(gid,cid);r.enabled=action==='start';r.nextAt=Date.now()+5000;r.revision=(r.revision||0)+1;save();return i.update(ui('✅ تم '+(r.enabled?'التشغيل':'الإيقاف'),{components:[panel()]}));
  }
  if(action==='unbind'){delete guild(gid).rooms[cid];save();return i.update(ui('✅ تم الفصل',{components:[panel()]}));}
  if(action==='post'){await i.deferUpdate();const res=await post(client,gid,cid,{forced:true});return i.editReply(ui(res,{components:[panel()]}));}
  if(action==='4k-links'){await i.deferUpdate();const res=await postPcCollectionLinks(client,gid,cid);return i.editReply(ui(res,{components:[panel()]}));}
 }
 if(id.startsWith('sas:category:')){
  const [, , action,cid]=id.split(':'),cat=i.values[0];
  if(action!=='preview'&&!admin(i))return i.reply(ep('⛔ للمشرفين فقط'));
  if(action==='bind'){
   guild(gid).rooms[cid]=makeRoom(cat,40);save();return i.update(ui(`✅ ربطت <#${cid}> بقسم ${cat} — كل 40 دقيقة`,{components:[panel()]}));
  }
  if(action==='source'){guild(gid).sources[cid]=cat;save();return i.update(ui(`✅ سيضيف البوت صور المشرفين من <#${cid}> إلى ${cat} عند تفعيل ENABLE_SOURCE_CHANNELS=true`,{components:[panel()]}));}
  if(action==='preview'){
   await i.deferUpdate();const p=packs(gid,cat)[0];
   if(!p)return i.editReply(ui('المكتبة فارغة في هذا القسم',{components:[panel()]}));
   if(p.remote)return i.editReply(ui('معاينة من قسم '+cat,{embeds:unsplashEmbeds(p),files:[],components:[panel()]}));
   const output=await renderCard(p);return i.editReply(ui('معاينة من قسم '+cat,{files:[new AttachmentBuilder(output.buffer,{name:output.filename})],components:[panel()]}));
  }
  if(action==='fetch'){await i.deferUpdate();const res=await importImages(gid,cat,true);return i.editReply(ui(res,{components:[panel()]}));}
  if(action==='wallhaven'){
   await i.deferUpdate();
   if(cat==='movies')return i.editReply(ui('قسم الأفلام يستخدم Fanart.tv؛ اختر قسمًا آخر لاستكشاف Wallhaven.',{components:[panel()]}));
   const example=await searchWallhaven(cat,new Set(),{seed:Math.floor(Date.now()/60000)%10000});
   return i.editReply(ui(example?`🔎 ${cat}: ${example.sourceUrl}\nهذا رابط مصدر، وليس طقمًا متناسقًا معتمدًا للنشر.`:'لا توجد نتيجة مناسبة بهذا البحث.',{components:[panel()]}));
  }
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
 if(!p)return i.reply(ep('هذه الصورة لم تعد متاحة في المكتبة.'));
 if(action==='download'){
  if(p.remote){
   await i.deferReply(ep(''));
   await trackUnsplashPair(p);
   const links=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('فتح الأفتار الأصلي').setURL(p.avatarURL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('فتح البنر الأصلي').setURL(p.bannerURL));
   return i.editReply(ui('📥 افتح الصورة الأصلية لحفظها؛ روابط المصدر والمصورين في المنشور.',{components:[links]}));
  }
  await i.deferReply(ep(''));
  // Use safe resolved paths for both custom and bundled assets.
  const {mediaPath}=await import('./db.js');
  const a=[new AttachmentBuilder(mediaPath(p.avatar),{name:p.kind==='wallpaper'?'pc-wallpaper.jpg':'avatar.jpg'})];
  if(p.kind==='profile'){
   const card=await renderCard(p);
   a.unshift(new AttachmentBuilder(card.buffer,{name:'profile-card.png'}));
   a.push(new AttachmentBuilder((await import('./db.js')).mediaPath(p.banner),{name:'banner.jpg'}));
  }
  return i.editReply(ui(p.kind==='profile'?'📥 البطاقة كاملة + الأفتار + البنر — ملفات جاهزة للحفظ':'📥 ملف الخلفية جاهز للحفظ',{files:a}));
 }
 if(action==='edit'){
  if(!admin(i))return i.reply(ep('⛔ التعديل للمشرفين فقط'));
  const m=new ModalBuilder().setCustomId('sas:rename:'+id).setTitle('تعديل اسم الطقم');
  const inp=new TextInputBuilder().setCustomId('name').setLabel('الاسم الداخلي في المكتبة').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(55).setValue(p.title||'صورة');
  return i.showModal(m.addComponents(new ActionRowBuilder().addComponents(inp)));
 }
 if(action==='delete'){
  if(!mod(i))return i.reply(ep('⛔ الحذف للمشرفين فقط'));
  const confirm=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sas:confirm:${i.message.id}`).setLabel('تأكيد حذف المنشور').setStyle(ButtonStyle.Danger));
  return i.reply(ep('هل تريد حذف هذا المنشور من الروم؟ (لن يحذف الصورة من المكتبة)',{components:[confirm]}));
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
  guild(i.guildId).titleOverrides[value]=i.fields.getTextInputValue('name').slice(0,55);save();return i.reply(ep('✅ تم تعديل الاسم داخل المكتبة'));
 }
}
export async function startAutomation(client,{timers=globalThis}={}){
 // Reconcile before any timer can publish, including the initial 5-second tick.
 try{await recoverPreviousPosts(client);}catch(e){console.warn('History reconciliation',err(e));}
 const handles=[];let stopped=false,posting=false,fetching=false,cursor=0;
 const schedule=(kind,callback,ms)=>handles.push([kind,timers[kind](callback,ms)]);
 const postTick=async()=>{
  if(stopped||posting)return;posting=true;
  try{await scheduler(client);}catch(e){console.error('Automatic posting:',err(e));}
  finally{posting=false;}
 };
 const fetchTick=async()=>{
  if(stopped||fetching)return;fetching=true;
  try{
   const active=[];
   for(const [gid,g] of Object.entries(store.guilds))for(const room of Object.values(g.rooms||{}))
    if(room.enabled&&['girls','boys','movies'].includes(room.category)&&!active.some(x=>x[0]===gid&&x[1]===room.category))active.push([gid,room.category]);
   if(!active.length)return;
   const [gid,category]=active[cursor++%active.length];
   await importImages(gid,category,false);
  }catch(e){console.error('Automatic image source:',err(e));}
  finally{fetching=false;}
 };
 if(!sourcesOnly()&&process.env.AUTO_FETCH!=='false')schedule('setInterval',fetchTick,300000);
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

// Posting attachments in an admin-configured source room is an explicit review
// by a Manage Server member. Movie uploads must also name their HTTPS source.
export async function handleSourceMessage(message){
 try{
  if(!message.guildId||!message.author||message.author.bot)return;
  const category=guild(message.guildId).sources[message.channelId];
  if(!category||!message.member?.permissions.has(PermissionFlagsBits.ManageGuild))return;
  const files=message.attachments.filter(a=>a.contentType?.startsWith('image/'));
  const [avatar,banner]=[...files.values()];if(!avatar)return;
  let filmSource=null;
  if(category==='movies'){
   filmSource=String(message.content||'').match(/https:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.;!?]+$/,'')||null;
   if(!filmSource||filmSource.length>250)throw Error('أضف رابط HTTPS لمصدر الفيلم مع الصور (حتى 250 حرفًا).');
  }
  const result=await addFromInteraction({guildId:message.guildId},category,avatar,banner,'من روم المصدر',
   ['girls','boys'].includes(category),filmSource,category==='anime');
  await message.react('✅').catch(()=>{});console.log('Source channel',result);
  return result;
 }catch(e){
  console.error('Source import failed',err(e));
  await message.react('⚠️').catch(()=>{});
  await message.reply(ui('⚠️ تعذر استيراد الصور: '+err(e))).catch(()=>{});
  return 'تعذر الاستيراد: '+err(e);
 }
}

export async function start(token){
 const intents=[GatewayIntentBits.Guilds];
 if(process.env.ENABLE_SOURCE_CHANNELS==='true')intents.push(GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent);
 const client=new Client({intents});
 migrateLegacySettings();
 client.once(Events.ClientReady,async c=>{
  console.log('✅ Logged in as '+c.user.tag);
  try{const up=await upgradeLibraryFingerprints();console.log('✅ Library fingerprints upgraded:',up.updated,'skipped:',up.skipped);}catch(e){console.warn('Library upgrade:',err(e));}
  try{
   const rest=new REST({version:'10'}).setToken(token);
   const target=process.env.GUILD_ID?.trim();
   await rest.put(target?Routes.applicationGuildCommands(c.user.id,target):Routes.applicationCommands(c.user.id),{body:cmds});
   console.log('✅ تم تسجيل '+cmds.length+' أمرًا'+(target?' في السيرفر':' عالميًا'));
  }catch(e){console.error('⚠️ تعذر تسجيل الأوامر:',err(e));}
  await startAutomation(client);
 });
 client.on(Events.InteractionCreate,i=>handleInteraction(i,client));
 if(process.env.ENABLE_SOURCE_CHANNELS==='true'){
  client.on(Events.MessageCreate,handleSourceMessage);
 }
 client.on(Events.Error,e=>console.error('Discord client error',e));
 await client.login(token);
}
