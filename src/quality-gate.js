// Conservative image checks. Metadata labels are mandatory: no visual classifier
// can conclusively determine anime vs photograph from these simple metrics.
import sharp from 'sharp';
import {createHash} from 'node:crypto';

export async function visualSignature(input) {
  const {data,info}=await sharp(input,{limitInputPixels:40_000_000})
    .rotate().resize(9,8,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  if(info.width!==9||info.height!==8)throw Error('الصورة غير قابلة للفحص');
  let hash=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    hash=(hash<<1n)|(data[y*9+x]>data[y*9+x+1]?1n:0n);
  }
  return hash;
}
export function distance(a,b){let n=a^b,count=0;while(n){n&=n-1n;count++;}return count;}
export async function colorTone(input){
 const {data}=await sharp(input).rotate().resize(16,16,{fit:'cover'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let rs=0,gs=0,bs=0,n=data.length/3;
 for(let i=0;i<data.length;i+=3){rs+=data[i];gs+=data[i+1];bs+=data[i+2];}
 return [rs/n,gs/n,bs/n];
}
export function toneDistance(a,b){return Math.hypot(...a.map((v,i)=>v-b[i]))/Math.sqrt(3*255*255);}
export function orientedDimensions(info){
 const swap=[5,6,7,8].includes(info.orientation);
 return {width:swap?info.height:info.width,height:swap?info.width:info.height};
}
export async function validatePair(avatar,banner,{minAvatar=320,minBanner=700,maxToneDistance=0.40}={}){
 const [am,bm]=(await Promise.all([sharp(avatar).metadata(),sharp(banner).metadata()])).map(orientedDimensions);
 if(!am.width||!am.height||!bm.width||!bm.height)throw Error('صور غير صالحة');
 if(Math.min(am.width,am.height)<minAvatar)throw Error('دقة الأفتار منخفضة');
 if(bm.width<minBanner||bm.height<250)throw Error('دقة البنر منخفضة');
 if(bm.width/bm.height<1.1)throw Error('يجب أن يكون البنر أفقيًا');
 const [ah,bh,ac,bc]=await Promise.all([visualSignature(avatar),visualSignature(banner),colorTone(avatar),colorTone(banner)]);
 if(distance(ah,bh)<=6)throw Error('الأفتار والبنر متشابهان أو مكرران');
 const score=toneDistance(ac,bc);
 if(score>maxToneDistance)throw Error('ألوان الأفتار والبنر غير متناسقة؛ استخدم طقمًا متناسقًا');
 return {toneScore:Number((1-score).toFixed(3)),avatarHash:ah.toString(16),bannerHash:bh.toString(16)};
}
export function mediaFingerprint(data){return createHash('sha256').update(data).digest('hex');}
