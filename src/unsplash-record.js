import {safeSourceUrl} from './source-utils.js';

export const UNSPLASH_ID = /^[A-Za-z0-9_-]{6,64}$/;
export function validUnsplashImage(value) {
  return safeSourceUrl(value, ['images.unsplash.com'], /^\/photo-[A-Za-z0-9_-]+/);
}
export function validUnsplashDownload(value, id) {
  if (!UNSPLASH_ID.test(id || '')) return false;
  return safeSourceUrl(value, ['api.unsplash.com'], new RegExp(`^/photos/${id}/download$`));
}
export function validUnsplashPage(value) {
  return safeSourceUrl(value, ['unsplash.com'], /^\/photos\/[^/]+\/?$/);
}
export function validUnsplashPhotographer(value) {
  return safeSourceUrl(value, ['unsplash.com'], /^\/@[A-Za-z0-9_.-]+\/?$/);
}
// Validate saved remote records again before allowing them into a posting queue.
// This protects previews, download tracking and buttons as well as new imports.
export function isUnsplashRecord(record) {
  if (record?.remote !== true || record.provider !== 'Unsplash' || record.kind !== 'profile' ||
      !['girls', 'boys'].includes(record.category) || record.verificationSource !== 'unsplash-photo') return false;
  if (!Array.isArray(record.sourceIds) || record.sourceIds.length !== 2) return false;
  const ids = record.sourceIds.map(value => typeof value === 'string' && value.startsWith('unsplash:') ? value.slice(9) : '');
  if (ids.some(id => !UNSPLASH_ID.test(id)) || ids[0] === ids[1] || record.sourceId !== record.sourceIds.join('|')) return false;
  if (!validUnsplashImage(record.avatarURL) || !validUnsplashImage(record.bannerURL) ||
      new URL(record.avatarURL).pathname === new URL(record.bannerURL).pathname) return false;
  if (!validUnsplashPage(record.sourceUrl) || !validUnsplashPage(record.sourceBannerUrl)) return false;
  if (!Array.isArray(record.downloadLocations) || record.downloadLocations.length !== 2 ||
      record.downloadLocations.some((url, index) => !validUnsplashDownload(url, ids[index]))) return false;
  return ['avatar', 'banner'].every(kind => {
    const credit = record.credits?.[kind];
    return typeof credit?.name === 'string' && Boolean(credit.name.trim()) && validUnsplashPhotographer(credit.url);
  });
}
