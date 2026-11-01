// Generated test data only; no photographs are shipped with the bot.
import sharp from 'sharp';
export function remotePair(id='fixture01',category='girls'){
 const a=id+'av',b=id+'bn';
 return {id,remote:true,kind:'profile',category,provider:'Unsplash',verificationSource:'unsplash-photo',
  importedAutomatically:true,categoryVerified:true,photoVerified:true,boysStyle:'dark-street-v1',boysTheme:'mono-urban',title:'Generated fixture',
  sourceIds:[`unsplash:${a}`,`unsplash:${b}`],sourceId:`unsplash:${a}|unsplash:${b}`,
  avatarURL:`https://images.unsplash.com/photo-${a}?ixid=original`,bannerURL:`https://images.unsplash.com/photo-${b}?ixid=original`,
  sourceUrl:`https://unsplash.com/photos/${a}`,sourceBannerUrl:`https://unsplash.com/photos/${b}`,
  downloadLocations:[`https://api.unsplash.com/photos/${a}/download`,`https://api.unsplash.com/photos/${b}/download`],
  credits:{avatar:{name:'Fixture Artist',url:'https://unsplash.com/@fixture'},banner:{name:'Scene Artist',url:'https://unsplash.com/@scene'}}};
}
export async function generatedPair(variant=0){
 const result={};
 for(const kind of ['avatar','banner']){
  const width=kind==='avatar'?800:1600,height=kind==='avatar'?1000:900;
  let seed=variant*653+(kind==='avatar'?1291:7817);const tiles=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   seed=seed*16807%2147483647;const value=24+seed%90;
   tiles.push(`<rect x="${x*width/8}" y="${y*height/8}" width="${width/8}" height="${height/8}" fill="rgb(${value},${value+6},${value+14})"/>`);
  }
  result[kind]=await sharp(Buffer.from(`<svg width="${width}" height="${height}">${tiles.join('')}</svg>`)).png().toBuffer();
 }
 return result;
}
