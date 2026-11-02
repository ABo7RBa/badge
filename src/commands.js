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
 ch(command('مجموعات-4k','إرسال خلفية ألعاب أو أنمي أصلية في روم PC',true)),
 ch(command('فحص-الأفلام','تقرير خاص يحدد سبب توقف movies دون نشر صور في الروم',true)),
 cat(command('جلب-صور','جلب صور جديدة من المواقع للأقسام الخمسة',true)),
 cat(command('استكشاف-وولهيفن','معاينة خلفيات PC أو استكشاف صور Wallhaven',true)),
 command('التصنيفات','عرض تصنيفات الصور'),
 command('الرومات','عرض الرومات المرتبطة'),
 command('حالة','حالة النشر والأخطاء'),
 command('مصادر','مصادر الصور وروابط أصحابها'),
 cat(command('معاينة','جلب معاينة جديدة من الموقع قبل النشر',true)),
 command('لوحة-التحكم','قائمة إدارة عربية تفاعلية'),
 command('مساعدة','قائمة الأوامر التفاعلية')
].map(x=>x.toJSON());
export const ACTIONS=[
 ['setup-rooms','🏗️ تجهيز الرومات','إنشاء رومات الأقسام الخمسة وربطها'],
 ['bind','🔗 ربط روم','اختر رومًا ثم القسم'],['minutes','⏱️ تغيير المدة','حدد الروم والمدة'],
 ['start','▶️ تشغيل روم','تفعيل النشر'],['stop','⏹️ إيقاف روم','إيقاف النشر'],
 ['unbind','🔌 فصل روم','إلغاء الربط'],['post','📤 نشر الآن','نشر فورًا'],
 ['4k-links','🖥️ خلفية PC أصلية','إرسال خلفية ألعاب أو أنمي في روم PC'],
 ['fetch','🌐 جلب صور','صور مرخّصة وأفلام موثقة'],
 ['wallhaven','🖥️ استكشاف Wallhaven','معاينة PC أو استكشاف صور الأقسام الأخرى'],
 ['categories','🎨 التصنيفات','عرض الأقسام'],
 ['rooms','🗂️ الرومات','الرومات والفواصل'],['status','📊 الحالة','حالة البوت'],
 ['credits','ℹ️ مصادر الصور','مصادر الصور وحقوق أصحابها'],
 ['preview','👁️ معاينة','جلب طقم جديد من الموقع']
];
