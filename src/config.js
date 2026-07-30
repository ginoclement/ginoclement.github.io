// Base URL the photos are served from. Point this at a CDN bucket that
// contains the files named in images.json, e.g.
//   https://images.ginoclement.com  or  https://pub-xxxx.r2.dev
// Can also be set at build time via VITE_IMAGE_BASE_URL without editing code.
const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL ?? '/images';

export function imageUrl(name) {
  return `${IMAGE_BASE_URL}/${encodeURIComponent(name)}`;
}
