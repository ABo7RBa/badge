import {createRequire} from 'node:module';
const manifest=createRequire(import.meta.url)('../package.json');
export const APP_VERSION=/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version||'')?manifest.version:'غير محدد';
const counters=['configuredFilms','legacySkippedFilms','filmsChecked','invalidMetadata','validPosters','validBackgrounds','unusedPosters','unusedBackgrounds','imagesAttempted','imagesFailed','pairsChecked'];
const reasons={colors:'ألوان غير متناسقة',duplicate:'صور مكررة أو منشورة',avatar_resolution:'دقة الأفتار',banner_resolution:'دقة البنر',banner_aspect:'البنر غير أفقي',invalid_image:'ملف صورة غير صالح',other:'فحص آخر'};
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
export function sanitizeMovieReport(value){
 if(!value||typeof value!=='object')return null;
 const result=Object.fromEntries(counters.map(key=>[key,count(value[key])]));
 result.rejections=Object.fromEntries(Object.keys(reasons).map(key=>[key,count(value.rejections?.[key])]));
 result.continuation=value.continuation===true;
 if(Number.isInteger(value.apiStatus)&&value.apiStatus>=100&&value.apiStatus<=599)result.apiStatus=value.apiStatus;
 if(['json','html','other'].includes(value.apiContentType))result.apiContentType=value.apiContentType;
 if(value.schema){
  const schema=value.schema;
  result.schema={imdbMatches:schema.imdbMatches===true,
   nameType:['string','undefined','null','number','boolean','object','array'].includes(schema.nameType)?schema.nameType:'unknown',
   postersArray:schema.postersArray===true,backgroundsArray:schema.backgroundsArray===true};
 }
 return result;
}
export function explainMovieReport(value){
 const r=sanitizeMovieReport(value);
 if(!r)return 'لم يصل تقرير من المصدر؛ شغّل فحص الأفلام لمعرفة المرحلة التي توقفت.';
 if(r.configuredFilms>0&&r.legacySkippedFilms===r.configuredFilms)return 'كل أفلام القائمة محجوبة بسجل استخدام قديم؛ أضف معرفات أفلام أخرى إلى FANART_MOVIE_IDS دون حذف سجل الصور المنشورة.';
 if(!r.filmsChecked)return 'لم يبدأ فحص أفلام من الموقع؛ راجع إعداد المفتاح وقائمة FANART_MOVIE_IDS.';
 if(r.invalidMetadata===r.filmsChecked)return 'أعاد Fanart ردًا لا يطابق بيانات الفيلم المتوقعة؛ راجع تقرير صيغة الرد وفحص المفتاح.';
 if(!r.validPosters||!r.validBackgrounds)return 'لم يوفر المصدر ملصقًا وبنرًا صالحين من الأفلام المفحوصة؛ جرّب معرفات أفلام أخرى في FANART_MOVIE_IDS.';
 if(!r.unusedPosters||!r.unusedBackgrounds)return 'صور الأفتار أو البنر المتاحة مسجلة مستخدمة؛ أضف أفلامًا أخرى إلى FANART_MOVIE_IDS للحصول على صور جديدة.';
 if(r.imagesFailed&&!r.pairsChecked)return 'وجد المصدر صورًا، لكن تعذر تنزيل طقم كامل من خادم الصور.';
 if(r.continuation)return 'لم يكتمل فحص الصور ضمن حد المحاولة؛ توجد صور أو أفلام خارج الجزء المفحوص.';
 const rejected=Object.values(r.rejections).reduce((sum,n)=>sum+n,0);
 if(r.pairsChecked>rejected)return 'وصل طقم اجتاز فحص المصدر؛ يمكن متابعة فحص التصيير وصلاحيات الروم.';
 if(rejected){
  const [reason,total]=Object.entries(r.rejections).sort((a,b)=>b[1]-a[1])[0];
  return `وجد المصدر صورًا لكن رفض الفحص الأطقم؛ السبب الأكثر تكرارًا: ${reasons[reason]} (${total}).`;
 }
 return 'لم يتوفر طقم أفتار وبنر مناسب في النتائج المفحوصة؛ راجع أعداد الصور في التقرير.';
}
export function formatMovieReport(value){
 const r=sanitizeMovieReport(value);if(!r)return 'لم تتوفر أعداد فحص من المصدر.';
 const rejected=Object.entries(r.rejections).filter(([,n])=>n).map(([key,n])=>`${reasons[key]}: ${n}`).join(' • ');
 const lines=[`الأفلام: ${r.configuredFilms} • فُحص: ${r.filmsChecked} • محجوب بالسجل القديم: ${r.legacySkippedFilms}`,
  `صور المصدر الصالحة: أفتار ${r.validPosters} • بنر ${r.validBackgrounds}`,
  `غير المستخدمة: أفتار ${r.unusedPosters} • بنر ${r.unusedBackgrounds}`,
  `التنزيل: ${r.imagesAttempted} محاولة • تعذر ${r.imagesFailed} • الأزواج المفحوصة ${r.pairsChecked}`];
 if(r.apiStatus)lines.push(`رد API: HTTP ${r.apiStatus}${r.apiContentType?' • '+r.apiContentType:''}`);
 if(rejected)lines.push('الرفض: '+rejected);
 if(r.invalidMetadata)lines.push(`ردود بلا بيانات فيلم مطابقة: ${r.invalidMetadata}`);
 if(r.schema)lines.push(`صيغة الرد: IMDb ${r.schema.imdbMatches?'مطابق':'غير مطابق'} • الاسم ${r.schema.nameType} • قائمة الأفتار ${r.schema.postersArray?'موجودة':'غائبة'} • قائمة البنر ${r.schema.backgroundsArray?'موجودة':'غائبة'}`);
 if(r.continuation)lines.push('توجد نتائج خارج حد الفحص الحالي.');
 return lines.join('\n');
}
export function sanitizeMovieError(error,apiKey=process.env.FANART_API_KEY){
 let message=String(error?.message||'تعذر فحص مصدر الأفلام');
 const raw=typeof apiKey==='string'?apiKey:'';
 for(const secret of new Set([raw,raw.trim(),encodeURIComponent(raw.trim())]))if(secret)message=message.split(secret).join('[مخفي]');
 return message.replace(/https?:\/\/[^\s<>]+/gi,'[رابط مخفي]').replace(/(?:api[_-]?key|authorization|token)\s*[=:]\s*[^\s,;]+/gi,'[بيانات مخفية]').slice(0,400);
}
