/**
 * Wallhaven official v1 API discovery. Source links and previews ONLY:
 * user-submitted wallpapers have unknown reuse licenses. Never re-upload,
 * transform, or mix them into avatar/banner packs without permission.
 */
const API='https://wallhaven.cc/api/v1/search';
const SOURCE='https://wallhaven.cc/w/';
const ALLOWED=Object.freeze({
 pc_wallpapers:{categories:'100',queries:['nature landscape','city skyline','abstract geometric','space nebula','mountain panorama']},
 anime:{categories:'010',queries:['anime landscape','anime character']},
 girls:{categories:'001',queries:['woman portrait photography']},
 boys:{categories:'001',queries:['man portrait photography']}
});
const BLOCKED=/(?:nsfw|nude|nudity|explicit|erotic|porn|sexual|gore|violence)/i;
const UNWANTED_PC=/(?:anime|manga|cartoon|portrait|girl|boy|woman|man|character|cosplay)/i;
const idRegex=/^[a-z0-9]{6}$/i;
export function wallhavenSearchUrl(category,{index=0,page=1,sorting='random'}={}) {
 const config=ALLOWED[category];if(!config)throw Error('هذا القسم غير مدعوم من Wallhaven');
 const url=new URL(API);
 url.searchParams.set('q',config.queries[index%config.queries.length]);
 url.searchParams.set('categories',config.categories);
 url.searchParams.set('purity','100'); // Strict SFW, even when a personal API key exists.
 url.searchParams.set('sorting',sorting);
 url.searchParams.set('page',String(Math.min(20,Math.max(1,Math.floor(page)||1))));
 if(category==='pc_wallpapers') {url.searchParams.set('atleast','1920x1080');url.searchParams.set('ratios','16x9,16x10,21x9');}
 return url;
}
function acceptedUrl(value,kind){
 try {const u=new URL(value);return u.protocol==='https:' && !u.port && !u.username && !u.password &&
   (kind==='page' ? u.hostname==='wallhaven.cc' && /^\/w\/[a-z0-9]{6}$/i.test(u.pathname) :
   (u.hostname==='th.wallhaven.cc'||u.hostname==='wallhaven.cc') && /^\/(?:small|full|lg)\//.test(u.pathname));
 }catch{return false;}
}
export function validateWallhavenResult(category,p) {
 if(!ALLOWED[category]||!p||!idRegex.test(p.id||''))return null;
 if(p.purity!=='sfw')return null;
 const source=`${SOURCE}${p.id}`;
 if(p.url!==source||!acceptedUrl(source,'page'))return null;
 if(category==='pc_wallpapers' && p.category!=='general')return null;
 if(category==='anime' && p.category!=='anime')return null;
 if(['boys','girls'].includes(category)&&p.category!=='people')return null;
 const w=Number(p.dimension_x),h=Number(p.dimension_y);
 if(!Number.isFinite(w)||!Number.isFinite(h))return null;
 if(category==='pc_wallpapers' && (w<1920||h<1080||w/h<1.5))return null;
 const words=(p.tags||[]).map(t=>String(t.name||'')).join(' ');
 if(BLOCKED.test(words)||category==='pc_wallpapers'&&UNWANTED_PC.test(words))return null;
 const image=p.thumbs?.large||p.thumbs?.original||null;
 if(!image||!acceptedUrl(image,'thumb'))return null;
 return {id:`wallhaven:${p.id}`,rawId:p.id,category,title:category==='pc_wallpapers'?'خلفية PC':'صورة من Wallhaven',sourceUrl:source,preview:image,width:w,height:h};
}
export async function searchWallhaven(category,seen=new Set(),{apiFetch=fetch,seed=0,apiKey=process.env.WALLHAVEN_API_KEY||'',attempts=3}={}) {
 if(!ALLOWED[category])return null;
 const cfg=ALLOWED[category];
 for(let round=0;round<Math.min(5,Math.max(1,attempts));round++) {
  const index=(seed+round)%cfg.queries.length;
  const page=1+((seed+round*3)%5);
  const url=wallhavenSearchUrl(category,{index,page});
  const headers={'Accept':'application/json','User-Agent':'ABO7RB/15.0 (SFW wallpaper link previews)'};
  if(apiKey&&apiKey!=='YOUR_WALLHAVEN_API_KEY')headers['X-API-Key']=apiKey;
  const response=await apiFetch(url.toString(),{headers,signal:AbortSignal.timeout(14000),redirect:'error'});
  if(response.status===429)throw Error('Wallhaven حد الطلبات: 429');
  if(!response.ok)throw Error(`Wallhaven HTTP ${response.status}`);
  const json=await response.json();if(!Array.isArray(json.data))throw Error('رد Wallhaven غير صالح');
  const matches=json.data.map(x=>validateWallhavenResult(category,x)).filter(Boolean).filter(x=>!seen.has(x.id));
  if(matches.length)return matches[(seed+round)%matches.length];
 }
 return null;
}
