import 'dotenv/config';

let failed=false;
function check(name,valid,detail){
 console.log(`${valid?'✓':'✗'} ${name}${detail?' — '+detail:''}`);
 if(!valid)failed=true;
}
const [major,minor]=process.versions.node.split('.').map(Number);
check('Node.js',major>22||major===22&&minor>=12,'يلزم22.12أو أحدث');
for(const name of ['DISCORD_TOKEN','UNSPLASH_ACCESS_KEY','FANART_API_KEY']){
 const value=process.env[name]?.trim();
 const valid=Boolean(value&&!/^(?:YOUR_|PUT_|PASTE_)/i.test(value));
 check(name,valid,valid?'موجود دون عرض قيمته':'أضف القيمة في .env أو إعدادات الاستضافة');
}
for(const name of ['AUTO_FETCH','WALLHAVEN_ENABLED','SHOW_IMAGE_CREDITS']){
 const value=process.env[name];check(name,value===undefined||['true','false'].includes(value),'استخدم true أو false');
}
check('GUILD_ID',!process.env.GUILD_ID?.trim()||/^\d{17,22}$/.test(process.env.GUILD_ID.trim()),'اختياري؛ معرف رقمي للسيرفر');
const movies=process.env.FANART_MOVIE_IDS;
if(movies)check('FANART_MOVIE_IDS',movies.split(',').every(id=>/^tt\d{7,10}$/.test(id.trim())),'معرفات IMDb مفصولة بفواصل');
console.log('هذا فحص إعدادات محلي؛ لا يثبت صلاحية المفاتيح أو اتصال المواقع أو Discord.');
process.exitCode=failed?1:0;
