import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {API_BASE_URL, GOOGLE_CLIENT_ID, imageUrl} from '../config.js';
import {api} from './api.js';
import {computePalette} from './kmeans.js';
import {compressImage, makeThumbnail, formatBytes} from './imageTools.js';

// Bulk compression targets photos above this size when nothing is selected.
const COMPRESS_THRESHOLD = 1024 * 1024;

const TOKEN_KEY = 'admin-id-token';

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

function tokenIsFresh(token) {
  const payload = token && decodeJwtPayload(token);
  return Boolean(payload && payload.exp * 1000 > Date.now() + 60 * 1000);
}

function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

export default function Admin() {
  const [token, setToken] = useState(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    return tokenIsFresh(saved) ? saved : null;
  });
  const [photos, setPhotos] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [uploads, setUploads] = useState([]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [compressUploads, setCompressUploads] = useState(true);
  const signInRef = useRef(null);
  const fileInputRef = useRef(null);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPhotos(null);
  }, []);

  const run = useCallback(
    async (label, fn) => {
      setError(null);
      setStatus(label);
      try {
        // An action may return a string to leave as the final status message.
        const message = await fn();
        setStatus(typeof message === 'string' ? message : null);
      } catch (err) {
        setStatus(null);
        if (err instanceof api.AuthError) {
          signOut();
          setError('Session expired — please sign in again.');
        } else {
          setError(String(err.message ?? err));
        }
      }
    },
    [signOut]
  );

  // ---- Google Sign-In (OIDC) ----
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || token) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({credential}) => {
          sessionStorage.setItem(TOKEN_KEY, credential);
          setToken(credential);
        }
      });
      if (signInRef.current) {
        window.google.accounts.id.renderButton(signInRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with'
        });
      }
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, [token]);

  const refresh = useCallback(
    () =>
      run('Loading photos…', async () => {
        const {photos: list} = await api.listPhotos(token);
        setPhotos(list);
        setSelected(new Set());
      }),
    [run, token]
  );

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  // ---- actions ----

  const uploadFiles = (files) =>
    run(`Uploading ${files.length} photo(s)…`, async () => {
      for (const file of files) {
        setUploads((u) => [...u, {name: file.name, state: 'processing'}]);
        try {
          let body = file;
          let dims = null;
          if (compressUploads) {
            const c = await compressImage(file);
            dims = {width: c.width, height: c.height};
            if (c.compressed) {
              body = new File([c.blob], file.name, {type: c.blob.type});
            }
          }
          const palette = await computePalette(body);
          const meta = {
            color: palette.color,
            palette: palette.palette,
            width: dims?.width ?? palette.width,
            height: dims?.height ?? palette.height,
            size: body.size
          };
          setUploads((u) =>
            u.map((x) => (x.name === file.name ? {...x, state: 'uploading'} : x))
          );
          await api.upload(token, file.name, body, meta);
          const thumb = await makeThumbnail(body);
          const {photo} = await api.uploadThumb(token, file.name, thumb);
          setPhotos((p) => [
            ...(p ?? []).filter((x) => x.name !== photo.name),
            photo
          ].sort((a, b) => a.name.localeCompare(b.name)));
          setUploads((u) => u.filter((x) => x.name !== file.name));
        } catch (err) {
          setUploads((u) =>
            u.map((x) =>
              x.name === file.name ? {...x, state: `failed: ${err.message}`} : x
            )
          );
          throw err;
        }
      }
    });

  const compressPhotos = () =>
    run('Compressing…', async () => {
      const targets = photos.filter((p) =>
        selected.size
          ? selected.has(p.name)
          : !p.thumb || p.size == null || p.size > COMPRESS_THRESHOLD
      );
      if (!targets.length) {
        return 'Nothing to compress — everything is already optimized.';
      }
      let savedBytes = 0;
      let done = 0;
      for (const p of targets) {
        setStatus(`Compressing ${p.name} (${++done}/${targets.length})…`);
        const c = await compressImage(imageUrl(p.name, {v: p.uploadedAt}));
        if (c.compressed) {
          const before = p.size ?? c.blob.size;
          savedBytes += Math.max(0, before - c.blob.size);
          await api.upload(token, p.name, c.blob, {
            color: p.color,
            palette: p.palette,
            width: c.width,
            height: c.height,
            size: c.blob.size
          });
        }
        const thumb = await makeThumbnail(c.blob);
        const {photo} = await api.uploadThumb(token, p.name, thumb);
        setPhotos((list) => list.map((x) => (x.name === p.name ? photo : x)));
      }
      setSelected(new Set());
      return `Compressed ${targets.length} photo(s), saved ${formatBytes(savedBytes) ?? '0 KB'}.`;
    });

  const patchPhoto = (name, patch) =>
    run('Saving…', async () => {
      const {photo} = await api.update(token, name, patch);
      setPhotos((p) => p.map((x) => (x.name === name ? photo : x)));
    });

  const recompute = (name) =>
    run(`Analyzing ${name}…`, async () => {
      const entry = photos.find((p) => p.name === name);
      const meta = await computePalette(imageUrl(name, {v: entry?.uploadedAt}));
      const {photo} = await api.update(token, name, {
        color: meta.color,
        palette: meta.palette
      });
      setPhotos((p) => p.map((x) => (x.name === name ? photo : x)));
    });

  const removePhoto = (name) => {
    if (!window.confirm(`Delete ${name} from the bucket? This cannot be undone.`)) return;
    run(`Deleting ${name}…`, async () => {
      await api.remove(token, name);
      setPhotos((p) => p.filter((x) => x.name !== name));
    });
  };

  const syncBucket = () =>
    run('Scanning bucket…', async () => {
      const {added} = await api.sync(token);
      const {photos: list} = await api.listPhotos(token);
      setPhotos(list);
      setSelected(new Set());
      return added ? `Registered ${added} new file(s) from the bucket.` : 'No new files found.';
    });

  const bulk = (patch) =>
    run('Updating…', async () => {
      for (const name of selected) {
        const {photo} = await api.update(token, name, patch);
        setPhotos((p) => p.map((x) => (x.name === name ? photo : x)));
      }
      setSelected(new Set());
    });

  const analyzeMissing = () =>
    run('Analyzing photos without colors…', async () => {
      const missing = photos.filter((p) => !p.color);
      for (const p of missing) {
        setStatus(`Analyzing ${p.name}…`);
        const meta = await computePalette(imageUrl(p.name, {v: p.uploadedAt}));
        const {photo} = await api.update(token, p.name, {
          color: meta.color,
          palette: meta.palette
        });
        setPhotos((list) => list.map((x) => (x.name === p.name ? photo : x)));
      }
    });

  const exportJson = () => {
    const data = photos
      .filter((p) => p.published && p.color)
      .map(({name, color}) => ({name, color}));
    const blob = new Blob([JSON.stringify({data}, null, 1)], {
      type: 'application/json'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'images.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleSelect = (name) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ---- render ----

  const profile = useMemo(() => (token ? decodeJwtPayload(token) : null), [token]);

  if (!API_BASE_URL || !GOOGLE_CLIENT_ID) {
    return (
      <div className="admin gate">
        <h1>Photo Admin</h1>
        <p>This page needs two build-time settings before it can run:</p>
        <ul className="setup">
          <li><code>VITE_API_BASE_URL</code> — URL of the deployed Cloudflare Worker (see <code>worker/</code>)</li>
          <li><code>VITE_GOOGLE_CLIENT_ID</code> — Google OAuth client ID for sign-in</li>
        </ul>
        <p>See the README for full setup instructions.</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="admin gate">
        <h1>Photo Admin</h1>
        <p>Sign in with the Google account that owns this gallery.</p>
        <div ref={signInRef} />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const published = photos?.filter((p) => p.published).length ?? 0;
  const missingColor = photos?.filter((p) => !p.color).length ?? 0;

  return (
    <div
      className={`admin${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = [...e.dataTransfer.files].filter((f) =>
          f.type.startsWith('image/')
        );
        if (files.length) uploadFiles(files);
      }}
    >
      <header className="admin-header">
        <div>
          <h1>Photo Admin</h1>
          <p className="sub">
            {photos ? `${photos.length} photos · ${published} published` : 'Loading…'}
            {missingColor > 0 && ` · ${missingColor} missing colors`}
          </p>
        </div>
        <div className="header-actions">
          <span className="who">{profile?.email}</span>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="toolbar">
        <button
          className="primary"
          onClick={() => fileInputRef.current.click()}
        >
          Upload photos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files.length) uploadFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <label className="toggle" title="Downscale to 2560px JPEG before uploading">
          <input
            type="checkbox"
            checked={compressUploads}
            onChange={(e) => setCompressUploads(e.target.checked)}
          />
          compress uploads
        </label>
        <button onClick={syncBucket} title="Register files uploaded straight to the R2 bucket">
          Sync bucket
        </button>
        <button
          onClick={compressPhotos}
          title="Recompress selected photos (or all large/unthumbnailed ones) in place"
        >
          Compress{selected.size ? ` ${selected.size}` : ''}
        </button>
        {missingColor > 0 && (
          <button onClick={analyzeMissing}>Analyze {missingColor} missing</button>
        )}
        <button onClick={exportJson} title="Download published photos as images.json">
          Export JSON
        </button>
        <button onClick={refresh}>Refresh</button>
        <span className="spacer" />
        {selected.size > 0 && (
          <>
            <span className="sel-count">{selected.size} selected</span>
            <button onClick={() => bulk({published: true})}>Publish</button>
            <button onClick={() => bulk({published: false})}>Unpublish</button>
          </>
        )}
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
      {uploads.length > 0 && (
        <ul className="uploads">
          {uploads.map((u) => (
            <li key={u.name}>
              {u.name} — {u.state}
              {u.state.startsWith('failed') && (
                <button onClick={() => setUploads((x) => x.filter((y) => y.name !== u.name))}>
                  dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="drop-hint">…or drag &amp; drop images anywhere on this page.</p>

      <div className="grid">
        {photos?.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            selected={selected.has(photo.name)}
            onSelect={() => toggleSelect(photo.name)}
            onPublish={(v) => patchPhoto(photo.name, {published: v})}
            onPickColor={(color) => patchPhoto(photo.name, {color})}
            onRecompute={() => recompute(photo.name)}
            onDelete={() => removePhoto(photo.name)}
          />
        ))}
        {photos && photos.length === 0 && (
          <p className="empty">
            No photos yet. Upload some, or use “Sync bucket” if you have already
            uploaded files to R2 directly.
          </p>
        )}
      </div>
    </div>
  );
}

function PhotoCard({photo, selected, onSelect, onPublish, onPickColor, onRecompute, onDelete}) {
  return (
    <div className={`card${selected ? ' selected' : ''}${photo.published ? '' : ' draft'}`}>
      <div className="thumb" style={{background: photo.color ? rgbCss(photo.color) : '#222'}}>
        <img
          src={imageUrl(photo.name, {thumb: true, v: photo.uploadedAt})}
          alt={photo.name}
          loading="lazy"
        />
        <input
          type="checkbox"
          className="select"
          checked={selected}
          onChange={onSelect}
          title="Select for bulk actions"
        />
        <span className={`badge ${photo.published ? 'live' : 'draft'}`}>
          {photo.published ? 'published' : 'draft'}
        </span>
      </div>
      <div className="card-body">
        <p className="name" title={photo.name}>
          {photo.name}
          {photo.size != null && <span className="size"> · {formatBytes(photo.size)}</span>}
        </p>
        {photo.palette ? (
          <div className="palette" title="Click a swatch to use it as the dominant color">
            {photo.palette.map((p, i) => (
              <button
                key={i}
                className={`swatch${sameColor(p.color, photo.color) ? ' active' : ''}`}
                style={{background: rgbCss(p.color), flexGrow: Math.max(p.share, 0.04)}}
                onClick={() => onPickColor(p.color)}
                title={`${Math.round(p.share * 100)}%`}
              />
            ))}
          </div>
        ) : (
          <p className="no-color">No color yet — run analysis.</p>
        )}
        <div className="card-actions">
          <button className="primary" onClick={() => onPublish(!photo.published)}>
            {photo.published ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={onRecompute}>Analyze</button>
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function sameColor(a, b) {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
}
