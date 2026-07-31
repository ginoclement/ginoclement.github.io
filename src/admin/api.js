import {API_BASE_URL} from '../config.js';

class AuthError extends Error {}

async function request(token, method, path, {body, headers} = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {authorization: `Bearer ${token}`, ...headers},
    body
  });
  if (res.status === 401) throw new AuthError('session expired');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error ?? `${method} ${path} failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  AuthError,
  listPhotos: (token) => request(token, 'GET', '/api/photos'),
  sync: (token) => request(token, 'POST', '/api/sync'),
  upload: (token, name, file, meta) =>
    request(token, 'PUT', `/api/photos/${encodeURIComponent(name)}`, {
      body: file,
      headers: {
        'content-type': file.type || 'image/jpeg',
        'x-photo-meta': JSON.stringify(meta)
      }
    }),
  update: (token, name, patch) =>
    request(token, 'PATCH', `/api/photos/${encodeURIComponent(name)}`, {
      body: JSON.stringify(patch),
      headers: {'content-type': 'application/json'}
    }),
  remove: (token, name) =>
    request(token, 'DELETE', `/api/photos/${encodeURIComponent(name)}`)
};
