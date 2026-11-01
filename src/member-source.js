/**
 * Pfp-Bot compatible source adapter — derived from the idea of fetching a Discord
 * member avatar and banner in Nekros-dsc/Pfp-Bot (README terms: attribution and
 * source availability). This opt-in adapter imports only the command caller.
 * https://github.com/Nekros-dsc/Pfp-Bot
 */
export async function getOwnDiscordPair(client, requesterId){
 if(!requesterId||!/^[0-9]{15,22}$/.test(requesterId))throw Error('معرف غير صالح');
 // discord.js user.fetch(force) ensures banner information is present.
 const user=await client.users.fetch(requesterId,{force:true});
 if(user.id!==requesterId)throw Error('لم يتم العثور على صاحب الحساب');
 return {avatarURL:user.displayAvatarURL({extension:'png',size:1024,forceStatic:true}),bannerURL:user.bannerURL({extension:'png',size:2048,forceStatic:true})};
}
