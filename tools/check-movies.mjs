import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchFanartMovie,filmIds} from '../src/fanart-source.js';
import {formatMovieReport,explainMovieReport,sanitizeMovieError} from '../src/movie-diagnostics.js';

// This command only probes the movie provider. It does not log into Discord,
// publish messages, modify bot state, or print provider bodies and request URLs.
export async function runMovieDiagnostics({fetchMovie=fetchFanartMovie,env=process.env,write=line=>console.log(line)}={}){
 const key=typeof env.FANART_API_KEY==='string'?env.FANART_API_KEY.trim():'';
 const emit=value=>{
  let line=String(value??'');
  for(const secret of new Set([key,key?encodeURIComponent(key):'']))if(secret)line=line.split(secret).join('[مخفي]');
  line=line.replace(/https?:\/\/[^\s<>]+/gi,'[رابط مخفي]');
  write(line);
 };
 let version='غير محدد';
 try{
  const info=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
  if(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(info.version||''))version=info.version;
 }catch{}
 emit(`نسخة البوت: ${version} • Node.js: ${process.versions.node}`);
 const configured=Boolean(key&&!/^(?:YOUR_|PUT_|PASTE_)/i.test(key));
 emit(`FANART_API_KEY: ${configured?'موجود؛ قيمته مخفية':'غير مهيأ'}`);
 if(!configured){emit('أضف FANART_API_KEY في .env ثم أعد الفحص.');return 1;}
 let ids;
 try{ids=filmIds(env.FANART_MOVIE_IDS||undefined);}
 catch{emit('FANART_MOVIE_IDS غير صالح؛ أدخل حتى100معرف IMDb مفصولة بفواصل.');return 1;}
 emit(`عدد الأفلام المضبوطة: ${ids.length}`);
 let report=null;
 const showReport=()=>{
  if(!report){emit('لم يصل تقرير فحص من المصدر.');return;}
  emit(formatMovieReport(report));
  emit(explainMovieReport(report));
 };
 try{
  const candidate=await fetchMovie(new Set(),{apiKey:key,ids,seed:0,onReport:value=>{report=value;}});
  showReport();
  if(!candidate){emit('لم يجد الفحص طقم فيلم مناسبًا؛ راجع نتيجة المصدر أعلاه.');return 1;}
  if(candidate.provider!=='Fanart.tv'||!Buffer.isBuffer(candidate.avatar)||!Buffer.isBuffer(candidate.banner)){
   emit('وصلت نتيجة صور غير مكتملة من المصدر.');return 1;
  }
  emit('✅ نجح اتصال مصدر الأفلام وتنزيل طقم اجتاز فحص الصور.');
  emit('هذا لا يثبت ربط روم movies أو صلاحيات Discord؛ لم تُرسل أي رسالة.');
  return 0;
 }catch(error){
  showReport();
  // Do not display raw error.message: transports can echo URLs, credentials,
  // response bodies or headers. Only trusted status numbers/codes leave here.
  const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:null;
  const code=['FANART_IMAGE_NETWORK','FANART_SEARCH_CONTINUES','FANART_API_AUTH','FANART_API_ERROR'].includes(error?.code)?error.code:null;
  const message=[401,403].includes(status)?`Fanart.tv: تحقق من صلاحية مفتاح API (${status})`:
   status===429?'Fanart.tv: وصلت إلى حد الطلبات (429)، حاول لاحقًا':
   status?`Fanart.tv HTTP ${status}`:
   code==='FANART_API_AUTH'?'Fanart.tv: تحقق من صلاحية مفتاح API':
   code==='FANART_API_ERROR'?'Fanart.tv: أعاد المصدر خطأ بدل بيانات الأفلام؛ أعد المحاولة لاحقًا':
   code==='FANART_IMAGE_NETWORK'?'Fanart.tv: تعذر تنزيل صور الفيلم؛ تحقق من وصول الاستضافة إلى خادم الصور':
   code==='FANART_SEARCH_CONTINUES'?'Fanart.tv: لم يوجد طقم ضمن حد الفحص؛ قد توجد صور أخرى خارج الجزء المفحوص':
   'تعذر إجراء فحص الأفلام؛ تحقق من الشبكة وإعدادات المصدر ثم أعد المحاولة';
  emit(`❌ ${sanitizeMovieError({message,code,status},key)}`);
  return 1;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.exitCode=await runMovieDiagnostics();
}
