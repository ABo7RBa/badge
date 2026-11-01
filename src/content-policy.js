// Conservative metadata-only gate. It is NOT an AI vision classifier.
// When uncertain, reject so an illustration isn't placed into a real-photo feed.
export const CATEGORIES=Object.freeze(['anime','movies','girls','boys','pc_wallpapers']);
const EXPlicitArt=/(?:anime|manga|cartoon|illustration|illustrated|drawing|sketch|render|cgi|digital\s*art|painting|painted|cosplay|comic|fan\s*art|ai.generated|ai.art|artwork|vector|3d.render)/i;
const ADULT=/(?:nudity|nude|explicit|porn|sexual|erotic|nsfw)/i;
const photoTerms=/(?:photograph|photography|photographic|\bphoto\b|\bphotos\b|photographed|portrait photo|candid shot|camera shot)/i;
const femaleTerms=/(?:\bwoman\b|\bwomen\b|\bfemale\b|\bgirl\b|\bgirls\b)/i;
const maleTerms=/(?:\bman\b|\bmen\b|\bmale\b|\bboy\b|\bboys\b)/i;
const FILMS=/(?:night of the living dead|the general\s*\(?1926\)?|a trip to the moon|voyage dans la lune)/i;
export function metadataAllowed(category, info={}){
 const label=[info.title,info.description,info.categories].filter(Boolean).join(' ');
 if(ADULT.test(label))return false;
 if(category==='anime')return /anime|manga|japanese animation/i.test(label)&&!photoTerms.test(label)&&!/(?:cosplay|live.action|live action)/i.test(label);
 if(category==='movies')return !EXPlicitArt.test(label)&&FILMS.test(label)&&/(?:film|movie|still|frame|screenshot|cinema)/i.test(label);
 if(category==='girls')return photoTerms.test(label)&&femaleTerms.test(label)&&!maleTerms.test(label)&&!EXPlicitArt.test(label);
 if(category==='boys')return photoTerms.test(label)&&maleTerms.test(label)&&!femaleTerms.test(label)&&!EXPlicitArt.test(label);
 if(category==='pc_wallpapers')return Number(info.width)>=1280&&Number(info.height)>=720&&Number(info.width)/Number(info.height)>=1.5&&!/(?:anime|manga|cartoon|illustration|cosplay|portrait|\bperson\b|\bpeople\b)/i.test(label);
 return false;
}
export function isPublishableRecord(p){
 // V8.6 migration: do not trust image classifications created by older versions.
 // We keep all old files, but quarantine saved packs until the owner reimports them.
 if(!p?.bundled && p?.reviewedWithV86!==true)return false;
 if(!CATEGORIES.includes(p?.category))return false;
 if(p?.category==='girls'||p?.category==='boys'){
  // Old seed images / auto-imports are untrusted. Only new vetted photo records.
  return p.photoVerified===true&&p.categoryVerified===true&&
   ['unsplash-photo','pixabay-photo','pexels-photo','moderator-photo','synthetic-photorealistic'].includes(p.verificationSource);
 }
 if(p?.category==='movies')return p.categoryVerified===true&&p.filmVerified===true;
 if(p?.importedAutomatically)return p.categoryVerified===true;
 return true;
}
