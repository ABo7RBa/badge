# مفاتيح V16.10 — Unsplash

المصادر الحالية: Unsplash للشباب والبنات، Wallhaven للأنمي وPC، Fanart.tv للأفلام. لا تحتاج مفاتيح Pexels أو Pixabay.

## 1. Unsplash Access Key

1. افتح https://unsplash.com/developers وسجّل الدخول إلى حسابك.
2. افتح صفحة التطبيقات https://unsplash.com/oauth/applications.
3. اتبع خيار New Application، واقرأ متطلبات API وسجّل اسم التطبيق ووصف استخدامه الفعلي كبوت Discord يعرض الصور مع نسبها للمصورين.
4. افتح إعدادات التطبيق وقسم Keys. انسخ **Access Key** إلى `UNSPLASH_ACCESS_KEY` داخل `.env` على الاستضافة.
5. لا تستخدم Secret Key ولا تحتاج OAuth لبحث الصور العامة في هذه النسخة. لا تشارك المفاتيح في المحادثة.

تخضع إتاحة إنشاء التطبيقات وحصتها لشروط Unsplash وحالة حسابك. لم نختبر إصدار مفتاح جديد في هذه البيئة. إذا لم يظهر الخيار، اتبع تعليمات صفحة التطبيق ولا تستعمل مفتاح خدمة أخرى مكانه.

## 2. Fanart.tv

1. سجّل الدخول إلى https://fanart.tv/.
2. افتح https://fanart.tv/get-an-api-key/ واتبع إنشاء API/Project Key.
3. ضعه في `FANART_API_KEY`. المفتاح يخص الأفلام فقط.
4. `FANART_MOVIE_IDS` قائمة معرفات IMDb وليست سرًا؛ توجد قائمة افتراضية في الملف النموذجي.

إذا سبق أن شاركت مفتاحًا في المحادثة، يُفضّل استبداله ثم وضع البديل على الاستضافة. لا توجد مفاتيحك داخل الملف المضغوط.

## 3. Discord

1. افتح https://discord.com/developers/applications وأنشئ تطبيقك.
2. من Bot أنشئ/أعد تعيين التوكن، ثم ضعه في `DISCORD_TOKEN`.
3. ادعُ البوت باختيارات bot وapplications.commands. يحتاج عرض الرومات وإرسال الرسائل وEmbed Links وقراءة السجل. الأطقم المحلية تحتاج Attach Files، وإنشاء الرومات يحتاج Manage Channels.
4. `GUILD_ID` اختياري؛ اتركه فارغًا للتسجيل العالمي أو ضع معرف سيرفرك الرقمي للتسجيل المباشر فيه.

## ملف .env والتشغيل

انسخ `.env.example` باسم `.env`، ثم استبدل القيم الخاصة بك. لا تكتب المفاتيح داخل ملفات JavaScript ولا ترفع `.env` إلى Git أو تضفه إلى ZIP.

```env
DISCORD_TOKEN=YOUR_DISCORD_TOKEN
UNSPLASH_ACCESS_KEY=YOUR_UNSPLASH_ACCESS_KEY
FANART_API_KEY=YOUR_FANART_API_KEY
AUTO_FETCH=true
WALLHAVEN_ENABLED=true
```

اترك بقية الإعدادات النموذجية كما هي أولًا. استخدم Node.js 22.12 أو أحدث، ثم:

```sh
npm install
npm start
```

في سيرفرك استعمل `/تجهيز-الرومات` أو `/ربط-روم`، ثم `/جلب-صور` و`/نشر-الآن`. راجع `/حالة` إذا ظهر خطأ في المفتاح أو الحصة أو الصلاحيات. النشر الافتراضي كل 40 دقيقة.

يظهر طقم Unsplash كبنر كبير وأفتار جانبي دون نص افتراضيًا. متطلبات Unsplash API تشمل نسبة الصور للمصورين وUnsplash؛ اضبط SHOW_IMAGE_CREDITS=true لإظهارها. أطقم الأنمي والأفلام المجلوبة من الموقع تعرض البطاقة المركبة. البحث العام الآمن من Wallhaven لا يحتاج مفتاحًا.
