/**
 * API for the photo gallery, backed by a Cloudflare R2 bucket.
 *
 * Photos live at the root of the bucket (key = filename), so files uploaded
 * straight through the Cloudflare dashboard are picked up too (see /api/sync).
 * Gallery metadata (dominant color, palette, published flag) lives in a single
 * JSON object at the reserved key `_manifest.json`.
 *
 * Public endpoints:
 *   GET  /api/gallery          -> {data: [{name, color}]} of published photos
 *   GET  /images/<name>        -> the image bytes
 *
 * Admin endpoints (require a Google OIDC ID token in `Authorization: Bearer`,
 * verified against Google's JWKS and the ALLOWED_EMAILS allowlist):
 *   GET    /api/photos         -> full manifest entries
 *   PUT    /api/photos/<name>  -> upload image bytes (metadata in x-photo-meta)
 *   PATCH  /api/photos/<name>  -> update {published, color, palette}
 *   DELETE /api/photos/<name>  -> remove image and manifest entry
 *   POST   /api/sync           -> register bucket objects missing from manifest
 */

const MANIFEST_KEY = '_manifest.json';
const LINKS_KEY = '_links.json';
const THUMB_PREFIX = '_thumbs/';
const LEGACY_THUMB_PREFIX = '_thumb_';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif)$/i;

// ---------------------------------------------------------------- OIDC auth

let jwksCache = {keys: null, fetchedAt: 0};

async function getJwks() {
  if (!jwksCache.keys || Date.now() - jwksCache.fetchedAt > 60 * 60 * 1000) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error('failed to fetch Google JWKS');
    jwksCache = {keys: (await res.json()).keys, fetchedAt: Date.now()};
  }
  return jwksCache.keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0));
}

function decodeJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

/** Verifies a Google ID token; returns its payload or null. */
async function verifyIdToken(token, env) {
  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!signaturePart) return null;
    const header = decodeJwtPart(headerPart);
    const payload = decodeJwtPart(payloadPart);

    const jwk = (await getJwks()).find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;
    const key = await crypto.subtle.importKey(
      'jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    );
    if (!valid) return null;

    const allowedEmails = (env.ALLOWED_EMAILS ?? '')
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!ISSUERS.includes(payload.iss)) return null;
    if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (!payload.email_verified) return null;
    if (!allowedEmails.includes((payload.email ?? '').toLowerCase())) return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireAuth(request, env) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? verifyIdToken(token, env) : null;
}

// ----------------------------------------------------------------- manifest

async function loadManifest(env) {
  const obj = await env.PHOTOS.get(MANIFEST_KEY);
  if (!obj) return {photos: {}};
  try {
    return await obj.json();
  } catch {
    return {photos: {}};
  }
}

function saveManifest(env, manifest) {
  return env.PHOTOS.put(MANIFEST_KEY, JSON.stringify(manifest), {
    httpMetadata: {contentType: 'application/json'}
  });
}

function photoList(manifest) {
  return Object.entries(manifest.photos)
    .map(([name, entry]) => ({name, ...entry}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ helpers

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,PATCH,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-photo-meta',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', ...extraHeaders}
  });
}

/**
 * Validates a photo key. Folder paths are allowed ("trips/utah/arch.jpg");
 * empty segments, traversal, and reserved _-prefixed segments are not.
 */
function validName(name) {
  if (!name || name.includes('..')) return false;
  const segments = name.split('/');
  return segments.every((s) => s && !s.startsWith('_') && s !== '.');
}

/** Extracts and validates the photo name from a route path. */
function photoName(pathname, prefix) {
  const name = decodeURIComponent(pathname.slice(prefix.length));
  return validName(name) ? name : null;
}

async function getThumb(env, name) {
  return (
    (await env.PHOTOS.get(THUMB_PREFIX + name)) ??
    (await env.PHOTOS.get(LEGACY_THUMB_PREFIX + name))
  );
}

async function deleteThumbs(env, name) {
  await env.PHOTOS.delete(THUMB_PREFIX + name);
  await env.PHOTOS.delete(LEGACY_THUMB_PREFIX + name);
}

// ------------------------------------------------------------------- routes

async function handle(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: cors});
  }

  // --- public ---

  if (method === 'GET' && url.pathname === '/api/gallery') {
    const manifest = await loadManifest(env);
    const data = photoList(manifest)
      .filter((p) => p.published && p.color && !p.archived)
      .map(({name, color, palette, exif, features, uploadedAt}) => ({
        name,
        color,
        palette,
        exif,
        features,
        v: uploadedAt
      }));
    return json({data}, 200, {
      ...cors,
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=60'
    });
  }

  if (method === 'GET' && url.pathname === '/api/links') {
    const obj = await env.PHOTOS.get(LINKS_KEY);
    const body = obj ? await obj.text() : '{"links":[]}';
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        ...cors,
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=60'
      }
    });
  }

  if (method === 'GET' && url.pathname.startsWith('/images/')) {
    const name = photoName(url.pathname, '/images/');
    if (!name) return json({error: 'bad name'}, 400, cors);
    // ?thumb=1 serves the small variant, falling back to the original.
    let obj = null;
    if (url.searchParams.get('thumb')) {
      obj = await getThumb(env, name);
    }
    if (!obj) obj = await env.PHOTOS.get(name);
    if (!obj) return json({error: 'not found'}, 404, cors);
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg',
        etag: obj.httpEtag,
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*'
      }
    });
  }

  // --- admin ---

  const user = await requireAuth(request, env);
  if (!user) return json({error: 'unauthorized'}, 401, cors);

  if (method === 'PUT' && url.pathname === '/api/links') {
    let data;
    try {
      data = await request.json();
    } catch {
      return json({error: 'bad json'}, 400, cors);
    }
    if (!Array.isArray(data.links) || data.links.length > 100) {
      return json({error: 'links must be an array of at most 100'}, 400, cors);
    }
    const links = data.links
      .map((l) => ({
        title: String(l.title ?? '').slice(0, 80),
        url: String(l.url ?? '').slice(0, 300),
        description: String(l.description ?? '').slice(0, 300),
        tag: String(l.tag ?? '').slice(0, 40)
      }))
      .filter((l) => l.title && /^https?:\/\//.test(l.url));
    await env.PHOTOS.put(LINKS_KEY, JSON.stringify({links}), {
      httpMetadata: {contentType: 'application/json'}
    });
    return json({links}, 200, cors);
  }

  if (method === 'GET' && url.pathname === '/api/photos') {
    const manifest = await loadManifest(env);
    return json({photos: photoList(manifest), user: user.email}, 200, cors);
  }

  if (method === 'POST' && url.pathname === '/api/sync') {
    const manifest = await loadManifest(env);
    let added = 0;
    let updated = 0;
    let cursor;
    do {
      const page = await env.PHOTOS.list({cursor, limit: 1000});
      for (const obj of page.objects) {
        const key = obj.key;
        if (!validName(key)) continue;
        if (!IMAGE_EXTENSIONS.test(key)) continue;
        if (!manifest.photos[key]) {
          manifest.photos[key] = {published: false, uploadedAt: Date.now(), size: obj.size};
          added++;
        } else if (manifest.photos[key].size !== obj.size) {
          manifest.photos[key].size = obj.size;
          updated++;
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (added || updated) await saveManifest(env, manifest);
    return json({added, updated, total: Object.keys(manifest.photos).length}, 200, cors);
  }

  if (url.pathname.startsWith('/api/photos/')) {
    const name = photoName(url.pathname, '/api/photos/');
    if (!name) return json({error: 'bad name'}, 400, cors);
    const manifest = await loadManifest(env);

    // PUT ?thumb=1 stores the small variant for an existing photo.
    if (method === 'PUT' && url.searchParams.get('thumb')) {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        return json({error: 'body must be an image'}, 400, cors);
      }
      if (!manifest.photos[name]) return json({error: 'not found'}, 404, cors);
      await env.PHOTOS.put(THUMB_PREFIX + name, request.body, {
        httpMetadata: {contentType}
      });
      manifest.photos[name].thumb = true;
      await saveManifest(env, manifest);
      return json({photo: {name, ...manifest.photos[name]}}, 200, cors);
    }

    if (method === 'PUT') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        return json({error: 'body must be an image'}, 400, cors);
      }
      let meta = {};
      try {
        meta = JSON.parse(request.headers.get('x-photo-meta') ?? '{}');
      } catch {
        return json({error: 'bad x-photo-meta'}, 400, cors);
      }
      await env.PHOTOS.put(name, request.body, {
        httpMetadata: {contentType}
      });
      manifest.photos[name] = {
        ...manifest.photos[name],
        color: meta.color ?? manifest.photos[name]?.color ?? null,
        palette: meta.palette ?? manifest.photos[name]?.palette ?? null,
        exif: meta.exif ?? manifest.photos[name]?.exif ?? null,
        features: meta.features ?? manifest.photos[name]?.features ?? null,
        hash: meta.hash ?? manifest.photos[name]?.hash ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        size: meta.size ?? null,
        thumb: manifest.photos[name]?.thumb ?? false,
        published: manifest.photos[name]?.published ?? false,
        uploadedAt: Date.now()
      };
      await saveManifest(env, manifest);
      return json({photo: {name, ...manifest.photos[name]}}, 200, cors);
    }

    if (method === 'PATCH') {
      const entry = manifest.photos[name];
      if (!entry) return json({error: 'not found'}, 404, cors);
      const patch = await request.json();
      let finalName = name;

      // {name: "folder/new.jpg"} moves/renames the photo and its thumbnail.
      if (typeof patch.name === 'string' && patch.name !== name) {
        if (!validName(patch.name)) return json({error: 'bad target name'}, 400, cors);
        if (manifest.photos[patch.name]) {
          return json({error: 'target name already exists'}, 409, cors);
        }
        const obj = await env.PHOTOS.get(name);
        if (obj) {
          await env.PHOTOS.put(patch.name, obj.body, {httpMetadata: obj.httpMetadata});
          await env.PHOTOS.delete(name);
        }
        const thumb = await getThumb(env, name);
        if (thumb) {
          await env.PHOTOS.put(THUMB_PREFIX + patch.name, thumb.body, {
            httpMetadata: thumb.httpMetadata
          });
        }
        await deleteThumbs(env, name);
        delete manifest.photos[name];
        manifest.photos[patch.name] = entry;
        finalName = patch.name;
      }

      if (typeof patch.published === 'boolean') entry.published = patch.published;
      if (typeof patch.archived === 'boolean') entry.archived = patch.archived;
      if (Array.isArray(patch.color)) entry.color = patch.color;
      if (Array.isArray(patch.palette)) entry.palette = patch.palette;
      if (Array.isArray(patch.features)) entry.features = patch.features;
      if (patch.exif && typeof patch.exif === 'object') entry.exif = patch.exif;
      if (typeof patch.hash === 'string') entry.hash = patch.hash;
      await saveManifest(env, manifest);
      return json({photo: {name: finalName, ...entry}}, 200, cors);
    }

    if (method === 'DELETE') {
      await env.PHOTOS.delete(name);
      await deleteThumbs(env, name);
      delete manifest.photos[name];
      await saveManifest(env, manifest);
      return json({deleted: name}, 200, cors);
    }
  }

  return json({error: 'not found'}, 404, cors);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      return json({error: String(err)}, 500, corsHeaders(request, env));
    }
  }
};
