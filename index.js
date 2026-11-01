import 'dotenv/config';
import {start} from './src/bot.js';
const token=process.env.DISCORD_TOKEN?.trim();
if (!token || /^(?:PUT_|PASTE_|YOUR_)/i.test(token)) {
  console.error('❌ ملف .env غير مكتمل: ضع DISCORD_TOKEN الخاص بالبوت. لا تضعه في .env.example فقط.');
  process.exitCode=1;
} else start(token).catch(err=>{console.error('❌ فشل تشغيل البوت:',err.message);process.exitCode=1;});
