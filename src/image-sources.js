import {fetchUnsplashPair} from './unsplash-source.js';
import {fetchFanartMovie} from './fanart-source.js';
import {searchWallhaven} from './wallhaven-source.js';
import {fetchAnimePair} from './anime-pairs.js';

export const SOURCE_CREDITS = '**مصادر ABO 7RB**\n' +
  '🎌 أنمي: Wallhaven — طقم أفتار وبنر. 🖥️ خلفيات PC: معاينة الخلفية الأصلية.\n' +
  '🌸 بنات + 🖤 شباب: Unsplash — صور فوتوغرافية مع اسم المصور ورابطه.\n' +
  '🎬 أفلام: Fanart.tv — ملصق وخلفية من الفيلم نفسه، وليست قائمة Netflix.\n' +
  'https://wallhaven.cc • https://unsplash.com • https://fanart.tv\n' +
  'تبقى حقوق الصور لأصحابها. تُجلب الأطقم من المواقع فقط.';

export async function fetchCategoryAssets(category, seen = new Set(), options = {}) {
  if (category === 'girls' || category === 'boys') return fetchUnsplashPair(category, seen, options);
  if (category === 'movies') return fetchFanartMovie(seen, options);
  if (category === 'anime' || category === 'pc_wallpapers') {
    if (process.env.WALLHAVEN_ENABLED === 'false') throw Error('Wallhaven معطل في الإعدادات');
    if(category==='anime')return fetchAnimePair(seen,options);
    const result = await searchWallhaven(category, seen, options);
    return result ? {...result, linkOnly: true, provider: 'Wallhaven'} : null;
  }
  throw Error('هذا القسم غير مدعوم');
}
