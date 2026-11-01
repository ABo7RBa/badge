import {SlashCommandBuilder,PermissionFlagsBits,ChannelType} from 'discord.js';
const command=(name,description,admin=false)=>{const x=new SlashCommandBuilder().setName(name).setDescription(description);return admin?x.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild):x;};
const ch=x=>x.addChannelOption(o=>o.setName('channel').setDescription('اختر رومًا نصيًا').addChannelTypes(ChannelType.GuildText).setRequired(true));
const cat=x=>x.addStringOption(o=>o.setName('category').setDescription('القسم: anime / movies / girls / boys / pc_wallpapers').setAutocomplete(true).setRequired(true));
const period=x=>x.addIntegerOption(o=>o.setName('minutes').setDescription('عدد الدقائق (40 افتراضيًا)').setMinValue(5).setMaxValue(1440));
export const cmds=[
 command('تجهيز-الرومات','إنشاء وربط رومات الأقسام الخمسة تلقائيًا (صلاحية إدارة القنوات)',true),
 period(cat(ch(command('ربط-روم','ربط روم بقسم مستقل للنشر التلقائي',true)))),
 ch(command('فصل-روم','إزالة ربط الروم',true)),
 ch(command('تشغيل-روم','استئناف النشر',true)),
 ch(command('إيقاف-روم','إيقاف النشر',true)),
 ch(command('مدة-النشر','تغيير الفاصل الزمني',true)).addIntegerOption(o=>o.setName('minutes').setDescription('المدة الجديدة').setRequired(true).setMinValue(5).setMaxValue(1440)),
 ch(command('نشر-الآن','إرسال صورة جديدة فورًا',true)),
 ch(command('مجموعات-4k','مشاركة روابط مجموعات 4K Wallpapers في روم PC فقط (بدون سحب صور)',true)),
 cat(command('إضافة-صورة','رفع أفتار أو خلفية جديدة',true))
 .addAttachmentOption(o=>o.setName('avatar').setDescription('الصورة أو خلفية PC').setRequired(true))
 .addAttachmentOption(o=>o.setName('banner').setDescription('بنر إلزامي للأفتارات، غير مطلوب لخلفيات PC'))
 .addStringOption(o=>o.setName('title').setDescription('عنوان داخلي اختياري').setMaxLength(55))
 .addBooleanOption(o=>o.setName('confirm_photo').setDescription('تأكيد أنها صورة واقعية وليست أنمي (للبنات والشباب)'))
 .addStringOption(o=>o.setName('film_source').setDescription('رابط مصدر فيلم معروف؛ مطلوب لقسم الأفلام').setMaxLength(250))
 .addBooleanOption(o=>o.setName('confirm_anime').setDescription('تأكيد أنها أنمي فقط لقسم الأنمي')),
 command('استيراد-حسابي','استيراد أفتارك وبنرك من حسابك إلى مكتبة مصنفة',true).addStringOption(o=>o.setName('category').setDescription('anime أو girls أو boys').setRequired(true).addChoices({name:'أنمي',value:'anime'},{name:'بنات',value:'girls'},{name:'شباب',value:'boys'})).addBooleanOption(o=>o.setName('reviewed').setDescription('أؤكد أن الأفتار والبنر يناسبان القسم ومتناسقان').setRequired(true)),
 command('حذف-صورة','حذف طقم أضفته',true).addStringOption(o=>o.setName('id').setDescription('معرف الطقم').setRequired(true)),
 cat(command('جلب-صور','صور Unsplash وأفلام Fanart.tv وروابط Wallhaven',true)),
 cat(command('استكشاف-وولهيفن','روابط استكشاف آمنة على Wallhaven دون إعادة رفع الصور',true)),
 command('عرض-الصور','عرض مكتبة الصور').addStringOption(o=>o.setName('category').setDescription('القسم المراد عرضه')),
 command('التصنيفات','عرض تصنيفات الصور'),
 command('الرومات','عرض الرومات المرتبطة'),
 command('حالة','حالة النشر والأخطاء'),
 command('مصادر','مصادر الصور وروابط أصحابها'),
 command('معاينة','معاينة صورة قبل النشر').addStringOption(o=>o.setName('category').setDescription('التصنيف')).addStringOption(o=>o.setName('id').setDescription('معرّف الطقم')),
 cat(ch(command('مصدر-صور','تعيين روم لاستلام الصور من المشرفين',true))),
 ch(command('إيقاف-مصدر','إلغاء روم مصدر الصور',true)),
 command('لوحة-التحكم','قائمة إدارة عربية تفاعلية'),
 command('مساعدة','قائمة الأوامر التفاعلية')
].map(x=>x.toJSON());
export const ACTIONS=[
 ['setup-rooms','🏗️ تجهيز الرومات','إنشاء رومات الأقسام الخمسة وربطها'],
 ['bind','🔗 ربط روم','اختر رومًا ثم القسم'],['minutes','⏱️ تغيير المدة','حدد الروم والمدة'],
 ['start','▶️ تشغيل روم','تفعيل النشر'],['stop','⏹️ إيقاف روم','إيقاف النشر'],
 ['unbind','🔌 فصل روم','إلغاء الربط'],['post','📤 نشر الآن','نشر فورًا'],
 ['4k-links','🖥️ مجموعات 4K','روابط 4K Wallpapers لروم PC فقط'],
 ['fetch','🌐 جلب صور','صور مرخّصة وأفلام موثقة'],
 ['wallhaven','🖥️ استكشاف Wallhaven','روابط الصور من المصدر الأصلي'],['add','🖼️ إضافة صورة','رفع الأفتار والبنر'],
 ['packs','📚 عرض المكتبة','استعراض الصور'],['categories','🎨 التصنيفات','عرض الأقسام'],
 ['rooms','🗂️ الرومات','الرومات والفواصل'],['status','📊 الحالة','حالة البوت'],
 ['credits','ℹ️ مصادر الصور','مصادر الصور وحقوق أصحابها'],
 ['preview','👁️ معاينة','معاينة صورة من القسم'],
 ['source','📁 روم مصدر صور','استيراد صور المشرفين'],['source-stop','🚫 إيقاف مصدر','فصل روم المصدر']
];
