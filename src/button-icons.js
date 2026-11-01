import {ButtonBuilder,ButtonStyle} from 'discord.js';
import sharp from 'sharp';

// Application emojis keep these symbols monochrome across Discord clients.
// The artwork is generated here; no photo library or external asset host is used.
const definitions=Object.freeze({
 download:{env:'DOWNLOAD_EMOJI_ID',name:'abo7rb_download_v1',fallback:'⤓',paths:'<path d="M64 22v57m-21-21 21 21 21-21M25 83v19h78V83"/>'},
 edit:{env:'EDIT_EMOJI_ID',name:'abo7rb_edit_v1',fallback:'✎',paths:'<path d="M69 28H30a9 9 0 0 0-9 9v61a9 9 0 0 0 9 9h61a9 9 0 0 0 9-9V59"/><path d="m54 76 4-22 42-42a8 8 0 0 1 12 12L70 66l-16 10Zm37-55 12 12M58 54l12 12"/>'},
 delete:{env:'DELETE_EMOJI_ID',name:'abo7rb_delete_v1',fallback:'🗑︎',paths:'<path d="M23 32h82M47 32V20h34v12M34 33l4 70a7 7 0 0 0 7 7h38a7 7 0 0 0 7-7l4-70M52 47v48m12-48v48m12-48v48"/>'}
});
const selectedIds=new Map();
const validId=value=>/^\d{17,22}$/.test(value||'');

export function imageActionButton(action,customId){
 const icon=definitions[action];
 if(!icon)throw Error('نوع زر غير مدعوم');
 const configured=process.env[icon.env]?.trim();
 const id=validId(configured)?configured:selectedIds.get(action);
 const button=new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Secondary);
 return id?button.setEmoji({id}):button.setLabel(icon.fallback);
}

export async function setupImageButtonEmojis(client){
 selectedIds.clear();
 const pending=Object.entries(definitions).filter(([,icon])=>!validId(process.env[icon.env]?.trim()));
 const report={created:0,reused:0,failed:[]};
 if(!pending.length)return report;
 const manager=client.application?.emojis;
 let existing;
 try{
  if(!manager)throw Error('Application emoji manager unavailable');
  existing=await manager.fetch();
 }catch{
  report.failed=pending.map(([action])=>action);return report;
 }
 for(const [action,icon] of pending){
  try{
   let emoji=existing.find(item=>item.name===icon.name&&!item.animated);
   if(emoji&&validId(emoji.id))report.reused++;
   else{
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g fill="none" stroke="#b5bac1" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${icon.paths}</g></svg>`;
    const attachment=await sharp(Buffer.from(svg)).png().toBuffer();
    emoji=await manager.create({attachment,name:icon.name});
    if(!validId(emoji?.id))throw Error('Invalid application emoji ID');
    report.created++;
   }
   selectedIds.set(action,emoji.id);
  }catch{report.failed.push(action);}
 }
 return report;
}
