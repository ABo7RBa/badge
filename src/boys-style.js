import sharp from 'sharp';

export const BOYS_STYLE_VERSION = 'dark-street-v1';
export const BOYS_THEMES = Object.freeze([
  {portrait: 'black hoodie back view black and white', scene: 'train station black and white', mood: 'mono-streetwear', monochrome: true},
  {portrait: 'streetwear side profile black and white', scene: 'city street architecture black and white', mood: 'mono-urban', monochrome: true},
  {portrait: 'silhouette outdoors black and white', scene: 'cloudy grass field black and white', mood: 'mono-nature', monochrome: true},
  {portrait: 'dark jacket city night side view', scene: 'motel exterior city night cinematic', mood: 'cinematic-night', monochrome: false}
].map(theme => Object.freeze(theme)));

const DENY = /\b(?:nude|nudity|nsfw|erotic|sexual|anime|manga|illustration|drawing|painting|render|cosplay|child|children|schoolboy|teenager)\b|ai.generated/i;
const MALE = /\b(?:man|men|male|gentleman|guy)\b/i;
const FEMALE = /\b(?:woman|women|female|girl|girls)\b/i;
const STOCK = /\b(?:suit|suits|business|businessman|formal|headshot|headshots|selfie|selfies|smiling|smile|grinning|laughing)\b/i;
const HOODIE = /\b(?:hoodie|hoodies|hooded|streetwear|street wear|oversized)\b/i;
const OUTFIT = /\b(?:jacket|coat|hoodie|hooded|cap|beanie|streetwear)\b/i;
const DARK_OUTFIT = /\b(?:black|dark)\s+(?:(?:leather|denim|oversized)\s+)?(?:hoodie|jacket|coat|shirt|clothes|clothing|outfit|streetwear)\b/i;
const POSE = /\b(?:back view|rear view|from behind|from the back|back to (?:the )?camera|back turned|turned away|facing away|side view|side profile|profile view|faceless|face hidden|hidden face|obscured face|silhouette)\b/i;
const MONO = /\b(?:black and white|black & white|monochrome|grayscale|greyscale)\b/i;
const NIGHT = /\b(?:night|nighttime|night-time|dusk|dark|dim|low light|low-light|neon|moonlight|evening)\b/i;
const DAYLIGHT = /\b(?:day|daytime|daylight|sunny|sunshine|bright|sunlit|morning|afternoon|sunrise|golden hour)\b/i;
const SCENE = /\b(?:train|station|railway|railroad|metro|subway|city|street|urban|architecture|building|alley|bridge|billboard|road|skyline|forest|field|grass|grassy|nature|landscape|trees|mountain|mountains|lake|ocean|scenery|exterior|diner|motel|cafe)\b/i;
const URBAN = /\b(?:station|train|railway|city|street|urban|architecture|building|alley|billboard|motel|diner)\b/i;
const MOODY_NATURE = /\b(?:cloudy|overcast|mist|misty|fog|foggy|grass|grassy|field)\b/i;

// Ranking is based on sparse provider descriptions, not a visual pose classifier.
// The general source adapter still checks origin URLs, dimensions and licensing.
export function scoreBoysCandidate(kind, photo, theme = BOYS_THEMES[0]) {
  const label = [photo?.alt, photo?.title, photo?.description, photo?.tags].filter(x => typeof x === 'string').join(' ');
  if (!label || DENY.test(label) || !['avatar', 'banner'].includes(kind)) return 0;
  if (theme.monochrome === false && (DAYLIGHT.test(label) || !NIGHT.test(label))) return 0;
  if (kind === 'banner') {
    if (!SCENE.test(label) || /\b(?:woman|women|man|men|person|people|portrait|selfie)\b/i.test(label)) return 0;
    return 8 + (URBAN.test(label) ? 5 : 0) + (MOODY_NATURE.test(label) ? 4 : 0) +
      (MONO.test(label) ? 4 : 0) + (NIGHT.test(label) ? 3 : 0);
  }
  if (!MALE.test(label) || FEMALE.test(label) || STOCK.test(label)) return 0;
  const tags=String(photo?.tags||'').toLowerCase().split(',').map(tag=>tag.trim());
  const darkTagged=tags.some(tag=>['black','dark'].includes(tag))&&tags.some(tag=>['hoodie','jacket','coat','shirt','outfit','streetwear'].includes(tag));
  const hoodie = HOODIE.test(label), pose = POSE.test(label), darkOutfit = DARK_OUTFIT.test(label)||darkTagged;
  // Generic stock portraits do not satisfy this requested streetwear aesthetic.
  if (!hoodie && !pose && !darkOutfit) return 0;
  return 10 + (hoodie ? 8 : 0) + (pose ? 9 : 0) + (darkOutfit ? 5 : 0) +
    (OUTFIT.test(label) ? 3 : 0) + (MONO.test(label) ? 3 : 0) + (NIGHT.test(label) ? 2 : 0);
}

async function lightStats(input) {
  const {data, info} = await sharp(input, {limitInputPixels: 40_000_000, animated: false})
    .rotate().resize(64, 64, {fit: 'inside', withoutEnlargement: true})
    .removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject: true});
  let total = 0, bright = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    total += luminance;
    if (luminance > 190) bright++;
  }
  const pixels = info.width * info.height;
  return {mean: total / pixels, brightFraction: bright / pixels};
}

export async function styleBoysPair(avatar, banner, theme = BOYS_THEMES[0]) {
  const stats = await Promise.all([lightStats(avatar), lightStats(banner)]);
  if (theme.monochrome === false && stats.some(s => s.mean > 140 || s.brightFraction > 0.3)) {
    throw Error('صور الليل ساطعة أكثر من اللازم؛ اختر صورًا ملتقطة في إضاءة ليلية فعلًا');
  }
  // The pair shares one treatment. Lift the lowest tones instead of clipping
  // them, preserve source dimensions, and never relabel daylight as night.
  const mean = (stats[0].mean + stats[1].mean) / 2;
  const gain = Math.max(0.65, Math.min(0.94, 118 / Math.max(mean, 1)));
  const process = input => {
    let image = sharp(input, {limitInputPixels: 40_000_000, animated: false})
      .rotate().removeAlpha().toColourspace('srgb');
    if (theme.monochrome !== false) image = image.greyscale().linear(gain, 6);
    else image = image.modulate({saturation: 0.55}).linear([0.85, 0.9, 0.96], [4, 6, 9]);
    return image.jpeg({quality: 92, chromaSubsampling: '4:4:4'}).toBuffer();
  };
  const output = await Promise.all([process(avatar), process(banner)]);
  return {avatar: output[0], banner: output[1]};
}

export function isCurrentBoysStyle(record) {
  if (record?.category !== 'boys') return true;
  if (record.bundled || record.importedAutomatically) return record.boysStyle === BOYS_STYLE_VERSION;
  return record.photoVerified === true && record.categoryVerified === true &&
    ['moderator-photo', 'manual'].includes(record.verificationSource);
}
