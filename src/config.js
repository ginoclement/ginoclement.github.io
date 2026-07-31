// Base URL of the Cloudflare Worker API (worker/). When set, the public page
// loads the gallery from it and the admin page manages photos through it.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

// Google OAuth client ID used by the admin page's OIDC sign-in. Must match
// GOOGLE_CLIENT_ID on the Worker.
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

// Where the photos are served from. Defaults to the Worker's /images route
// when an API is configured, else /images on this site.
const IMAGE_BASE_URL = (
  (import.meta.env.VITE_IMAGE_BASE_URL ?? '').trim() ||
  (API_BASE_URL ? `${API_BASE_URL}/images` : '/images')
).replace(/\/+$/, '');

// Encodes a photo name for use in a URL path, keeping folder slashes.
export function encodePhotoPath(name) {
  return name.split('/').map(encodeURIComponent).join('/');
}

export function imageUrl(name, {thumb = false, v} = {}) {
  const params = new URLSearchParams();
  if (thumb) params.set('thumb', '1');
  if (v) params.set('v', String(v));
  const query = params.toString();
  return `${IMAGE_BASE_URL}/${encodePhotoPath(name)}${query ? `?${query}` : ''}`;
}
