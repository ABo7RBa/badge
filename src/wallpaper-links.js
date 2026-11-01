// 4kwallpapers.com explicitly permits links to HTML pages, but restricts
// automated scraping, hotlinking full images, and rehosting without permission.
// Never fetch, mirror, hotlink, or download media from this domain.
// This module provides hand-verified links to HTML collection pages ONLY.
export const PC_COLLECTION_LINKS = Object.freeze([
  {name:'المجموعات',url:'https://4kwallpapers.com/collections-packs/'},
  {name:'UltraWide 5120×1440',url:'https://4kwallpapers.com/ultrawide-dqhd-monitor-wallpapers/'},
  {name:'UltraWide 5120×2160',url:'https://4kwallpapers.com/5k2k-ultrawide-wallpapers/'},
  {name:'UltraWide 2560×1080',url:'https://4kwallpapers.com/ultrawide-monitor-hd-wallpapers/'}
]);
export function pcCollectionsMessage(){
 return ['🖥️ **مجموعات خلفيات PC — 4K Wallpapers**',
   ...PC_COLLECTION_LINKS.map(x=>`• [${x.name}](${x.url})`),
   'اختر الخلفية من الموقع بنفسك. الصور لا تُنسخ أو تُحمّل تلقائيًا من 4K Wallpapers.'].join('\n');
}
export function validatePcWallpaperRoom(room){
 if(!room||room.category!=='pc_wallpapers')throw Error('هذا الأمر مخصص لروم pc_wallpapers فقط. اربط الروم بقسم خلفيات PC أولًا.');
 return true;
}
