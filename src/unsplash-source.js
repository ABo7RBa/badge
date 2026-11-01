import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {safeSourceUrl, requireApiKey} from './source-utils.js';
import {BOYS_THEMES, BOYS_STYLE_VERSION, scoreBoysCandidate} from './boys-style.js';

const HOUR = 60 * 60 * 1000;
const DEFAULT_CACHE_DIR = fileURLToPath(new URL('../storage/source-cache/unsplash/', import.meta.url));
const budgets = new Map(), locks = new Map();
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const THEMES = [
  {portrait: 'woman portrait outdoors', scene: 'forest landscape', mood: 'nature'},
  {portrait: 'woman portrait sunset', scene: 'sunset landscape', mood: 'sunset'},
  {portrait: 'woman portrait black and white', scene: 'city black and white', mood: 'monochrome', monochrome: true}
];
const BOYS_QUERIES = {
  'mono-streetwear': {portrait: 'man hoodie', scene: 'train station'},
  'mono-urban': {portrait: 'man jacket', scene: 'city street'},
  'mono-nature': {portrait: 'man silhouette', scene: 'grass field'},
  'cinematic-night': {portrait: 'man night', scene: 'city night'}
};
const DENY = /\b(?:nude|nudity|nsfw|erotic|sexual|anime|manga|illustration|drawing|painting|render|cosplay|midjourney)\b|ai.generated|stable diffusion/i;
const WOMAN = /\b(?:woman|women|female)\b/i, MAN = /\b(?:man|men|male)\b/i;
const SCENE = /\b(?:landscape|forest|mountain|city|skyline|sunset|ocean|lake|nature|scenery|street|station|railway|train|building|architecture|alley|road|field|grass|meadow|diner|motel)\b/i;

class UnsplashError extends Error {}
function safeError(message, status) {const e = new UnsplashError(message);if (status) e.status = status;return e;}
const hash = value => createHash('sha256').update(value).digest('hex');
const imageUrl = value => safeSourceUrl(value, ['images.unsplash.com'], /^\/photo-[A-Za-z0-9_-]+$/);
const photoPage = value => safeSourceUrl(value, ['unsplash.com'], /^\/photos\/[A-Za-z0-9_-]+\/?$/);
const authorPage = value => safeSourceUrl(value, ['unsplash.com'], /^\/@[A-Za-z0-9_][A-Za-z0-9_.-]*\/?$/);
const downloadUrl = (value, id) => safeSourceUrl(value, ['api.unsplash.com']) && new URL(value).pathname === `/photos/${id}/download`;
function labelOf(photo) {
  return [photo?.description, photo?.alt_description, ...(Array.isArray(photo?.tags) ? photo.tags.map(t => t?.title) : [])]
    .filter(x => typeof x === 'string').join(' ');
}
function referral(value) {
  const u = new URL(value);u.searchParams.set('utm_source', 'abo7rb');u.searchParams.set('utm_medium', 'referral');return u.toString();
}
function compatibleColors(a,b,theme){
  const rgb=value=>/^#[0-9a-f]{6}$/i.test(value||'')?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)):null;
  const first=rgb(a.color),second=rgb(b.color);
  if(!first||!second)return false;
  const distance=Math.hypot(...first.map((value,index)=>value-second[index]))/Math.sqrt(3*255*255);
  if(distance>0.30)return false;
  if(theme.monochrome===false&&[first,second].some(c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2]>140))return false;
  return true;
}

export function unsplashSearchUrl(query, {page = 1, kind = 'avatar', monochrome = false} = {}) {
  if (!['avatar', 'banner'].includes(kind)) throw safeError('نوع بحث Unsplash غير صالح');
  const u = new URL('https://api.unsplash.com/search/photos');
  Object.entries({query: String(query || '').slice(0, 150), page: Math.max(1, Math.min(50, Math.floor(page) || 1)),
    per_page: 20, orientation: kind === 'avatar' ? 'portrait' : 'landscape', content_filter: 'high'})
    .forEach(([k, v]) => u.searchParams.set(k, String(v)));
  if (monochrome) u.searchParams.set('color', 'black_and_white');
  return u;
}

export function acceptUnsplashPhoto(category, kind, photo) {
  if (!['girls', 'boys'].includes(category) || !['avatar', 'banner'].includes(kind) ||
      typeof photo?.id !== 'string' || !ID.test(photo.id)) return false;
  if (!imageUrl(photo.urls?.regular) || !photoPage(photo.links?.html) || !downloadUrl(photo.links?.download_location, photo.id) ||
      typeof photo.user?.name !== 'string' || !photo.user.name.trim() || !authorPage(photo.user.links?.html)) return false;
  const label = labelOf(photo), w = Number(photo.width), h = Number(photo.height);
  if (!label || DENY.test(label) || photo.premium === true || photo.plus === true || photo.isPremium === true || !Number.isFinite(w) || !Number.isFinite(h)) return false;
  if (kind === 'banner') return w >= 1280 && h >= 720 && w / h >= 1.45 && SCENE.test(label) &&
    !/\b(?:woman|women|man|men|person|people|portrait)\b/i.test(label);
  if (Math.min(w, h) < 600 || w / h > 1.2 || h / w > 3) return false;
  return category === 'girls' ? WOMAN.test(label) && !MAN.test(label) : MAN.test(label) && !WOMAN.test(label);
}

async function atomicJson(file, data) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
    await fs.writeFile(temporary, JSON.stringify(data), {mode: 0o600, flag: 'wx'});
    await fs.rename(temporary, file);
  } catch {throw safeError('Unsplash: تعذر حفظ ذاكرة المصدر المؤقتة');}
  finally {await fs.rm(temporary, {force: true}).catch(() => {});}
}
async function readJson(file, budget = false) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (budget && (!value || typeof value !== 'object' || Array.isArray(value))) {
      return {start: Date.now(), requests: 45, blockedUntil: 0};
    }
    return value;
  }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return budget ? {start: Date.now(), requests: 45, blockedUntil: 0} : null;
    throw safeError('Unsplash: تعذر قراءة ذاكرة المصدر المؤقتة');
  }
}
function normalizeBudget(value, now) {
  if (!value) return null;
  const validCounter = n => Number.isSafeInteger(n) && n >= 0;
  const blockedUntil = Number.isFinite(value.blockedUntil) && value.blockedUntil >= 0 ? value.blockedUntil :
    Object.hasOwn(value, 'blockedUntil') ? now + HOUR : 0;
  // An expired/invalid window can begin again, but a provider backoff survives.
  if (!Number.isFinite(value.start) || now - value.start >= HOUR || now < value.start) {
    return {start: now, requests: 0, blockedUntil};
  }
  // Migrate the earlier search-only field. Invalid counters cannot become NaN
  // and silently grant unlimited requests until the current window expires.
  const requests = validCounter(value.requests) ? value.requests : validCounter(value.searches) ? value.searches : 45;
  return {start: value.start, requests: Math.min(45, requests), blockedUntil};
}
async function withBudget(key, cacheDir, operation) {
  const digest = hash(key), previous = locks.get(digest) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const file = cacheDir === false ? null : path.join(cacheDir, 'budget-' + digest + '.json');
    const stored = file ? await readJson(file, true) : null;
    const now = Date.now();
    let budget = normalizeBudget(budgets.get(digest), now);
    if (file) {
      const disk = normalizeBudget(stored, now);
      if (disk) budget = budget ? {start: Math.max(budget.start, disk.start),
        requests: Math.max(budget.requests, disk.requests), blockedUntil: Math.max(budget.blockedUntil, disk.blockedUntil)} : disk;
    }
    budget ||= {start: now, requests: 0, blockedUntil: 0};
    let result, failure;
    try {result = operation(budget, now);}catch (error) {failure = error;}
    budgets.set(digest, budget);if (file) await atomicJson(file, budget);
    if (failure) throw failure;
    return result;
  });
  locks.set(digest, task);
  try {return await task;}finally {if (locks.get(digest) === task) locks.delete(digest);}
}
async function reserve(key, cacheDir) {
  return withBudget(key, cacheDir, (budget, now) => {
    if (budget.blockedUntil > now || budget.requests >= 45) throw safeError('Unsplash: حد الطلبات مستنفد؛ حاول بعد ساعة', 429);
    budget.requests++;
  });
}
async function block(key, cacheDir) {
  return withBudget(key, cacheDir, (budget, now) => {budget.blockedUntil = Math.max(budget.blockedUntil || 0, now + HOUR);});
}
async function apiJson(url, {key, apiFetch, cacheDir}) {
  await reserve(key, cacheDir);
  try {
    const response = await apiFetch(url.toString(), {headers: {Accept: 'application/json', 'Accept-Version': 'v1', Authorization: `Client-ID ${key}`},
      signal: AbortSignal.timeout(18000), redirect: 'error'});
    const remaining = response.headers?.get?.('x-ratelimit-remaining');
    let data;
    try {data = await response.json();}catch {data = null;}
    const exhausted = response.status === 429 || remaining != null && remaining !== '' && Number(remaining) === 0 ||
      response.status === 403 && /rate.?limit/i.test(Array.isArray(data?.errors) ? data.errors.join(' ') : '');
    if (exhausted) await block(key, cacheDir);
    if (!response.ok) {
      if (exhausted) throw safeError('Unsplash: حد الطلبات مستنفد؛ حاول بعد ساعة', 429);
      if ([401, 403].includes(response.status)) throw safeError(`Unsplash: تحقق من صلاحية Access Key (${response.status})`, response.status);
      throw safeError(`Unsplash HTTP ${response.status}`, response.status);
    }
    if (!data || typeof data !== 'object') throw safeError('رد Unsplash غير صالح');
    return data;
  } catch (error) {
    if (error instanceof UnsplashError) throw error;
    throw safeError('Unsplash: تعذر الاتصال بالمصدر أو قراءة بياناته');
  }
}
async function searchJson(url, {key, apiFetch, cacheDir}) {
  const file = cacheDir === false ? null : path.join(cacheDir, 'search-' + hash(key + '\n' + url) + '.json');
  if (file) {
    const cached = await readJson(file), age = Date.now() - cached?.at;
    if (age >= 0 && age < HOUR && Array.isArray(cached?.data?.results)) return cached.data;
  }
  const data = await apiJson(url, {key, apiFetch, cacheDir});
  if (!Array.isArray(data.results)) throw safeError('رد بحث Unsplash غير صالح');
  if (file) await atomicJson(file, {at: Date.now(), data});return data;
}

export async function fetchUnsplashPair(category, seen = new Set(), {
  accessKey = process.env.UNSPLASH_ACCESS_KEY, apiFetch = fetch, seed = 0, cacheDir = DEFAULT_CACHE_DIR
} = {}) {
  if (!['girls', 'boys'].includes(category)) return null;
  const key = requireApiKey(accessKey, 'UNSPLASH_ACCESS_KEY'), themes = category === 'boys' ? BOYS_THEMES : THEMES;
  for (let pass = 0; pass < themes.length; pass++) {
    const theme = themes[(seed + pass) % themes.length], queries = category === 'boys' ? BOYS_QUERIES[theme.mood] : theme;
    const search = async (kind, query) => {
      const url = unsplashSearchUrl(query, {kind, page: 1 + ((seed + pass) % 5), monochrome: theme.monochrome === true});
      const page = Number(url.searchParams.get('page'));
      let data, usedFirstPage = false;
      const firstPage = async () => {
        usedFirstPage = true;
        const first = new URL(url);first.searchParams.set('page', '1');
        return searchJson(first, {key, apiFetch, cacheDir});
      };
      try {data = await searchJson(url, {key, apiFetch, cacheDir});}
      catch (error) {
        if (page <= 1 || error.status !== 400) throw error;
        data = await firstPage();
      }
      const totalPages = Number.isSafeInteger(data.total_pages) && data.total_pages >= 0 ? data.total_pages : null;
      if (!usedFirstPage && page > 1 && totalPages !== 0 &&
          (totalPages !== null && page > totalPages || !data.results.length)) data = await firstPage();
      let eligible = data.results.filter(p => acceptUnsplashPhoto(category, kind, p) && !seen.has(`unsplash:${p.id}`));
      if (category === 'boys') eligible = eligible.map(photo => ({photo,
        score: scoreBoysCandidate(kind, {...photo, alt: photo.alt_description, tags: photo.tags?.map(t => t.title).join(', ')}, theme)}))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.photo);
      return eligible;
    };
    const [avatars, banners] = await Promise.all([search('avatar', queries.portrait), search('banner', queries.scene)]);
    for (const a of avatars.slice(0, 5)) for (const b of banners.slice(0, 5)) {
      if (a.id === b.id || new URL(a.urls.regular).pathname === new URL(b.urls.regular).pathname || !compatibleColors(a,b,theme)) continue;
      return {remote: true, kind: 'profile', category, avatarURL: a.urls.regular, bannerURL: b.urls.regular,
        sourceId: `unsplash:${a.id}|unsplash:${b.id}`, sourceIds: [`unsplash:${a.id}`, `unsplash:${b.id}`],
        sourceUrl: referral(a.links.html), sourceBannerUrl: referral(b.links.html),
        credits: {avatar: {name: a.user.name, url: referral(a.user.links.html)}, banner: {name: b.user.name, url: referral(b.user.links.html)}},
        credit: `Unsplash — ${a.user.name} / ${b.user.name}`, downloadLocations: [a.links.download_location, b.links.download_location],
        provider: 'Unsplash', verificationSource: 'unsplash-photo', photoVerified: true, title: `${category} · ${theme.mood}`,
        license: 'Unsplash License — https://unsplash.com/license',
        ...(category === 'boys' ? {boysStyle: BOYS_STYLE_VERSION, boysTheme: theme.mood} : {})};
    }
  }
  return null;
}

export async function trackUnsplashPair(record, {accessKey = process.env.UNSPLASH_ACCESS_KEY, apiFetch = fetch, cacheDir = DEFAULT_CACHE_DIR} = {}) {
  const key = requireApiKey(accessKey, 'UNSPLASH_ACCESS_KEY');
  const ids = record?.sourceIds?.map(id => typeof id === 'string' && id.startsWith('unsplash:') ? id.slice(9) : '');
  if (record?.provider !== 'Unsplash' || !record.remote || ids?.length !== 2 || ids.some(id => !ID.test(id)) || ids[0] === ids[1] ||
      record.downloadLocations?.length !== 2 || record.downloadLocations.some((url, n) => !downloadUrl(url, ids[n]))) {
    throw safeError('روابط تتبع Unsplash غير صالحة');
  }
  let count = 0;
  try {
    for (const url of record.downloadLocations) {await apiJson(url, {key, apiFetch, cacheDir});count++;}
    return count;
  } catch (error) {error.trackedCount = count;throw error;}
}
