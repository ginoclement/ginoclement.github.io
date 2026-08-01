import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {API_BASE_URL, GOOGLE_CLIENT_ID, imageUrl} from '../config.js';
import {api} from './api.js';
import {computePalette} from './kmeans.js';
import {compressImage, makeThumbnail, formatBytes} from './imageTools.js';
import {parseExif} from './exif.js';
import {computeHash, isDuplicatePair, groupDuplicates} from './phash.js';

// Bulk compression targets photos above this size when nothing is selected.
const COMPRESS_THRESHOLD = 1024 * 1024;

const STATUS_FILTERS = [
  {key: 'all', label: 'All', test: (p) => !p.archived},
  {key: 'published', label: 'Published', test: (p) => p.published && !p.archived},
  {key: 'draft', label: 'Drafts', test: (p) => !p.published && !p.archived},
  {key: 'nocolor', label: 'No color', test: (p) => !p.color && !p.archived},
  {
    key: 'large',
    label: 'Large',
    title: 'Over 1 MB, or size unknown (run Sync bucket)',
    test: (p) => !p.archived && (p.size == null || p.size > COMPRESS_THRESHOLD)
  },
  {key: 'archived', label: 'Archived', test: (p) => Boolean(p.archived)}
];

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => (b.size ?? -1) - (a.size ?? -1),
  newest: (a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0)
};

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

function folderOf(name) {
  const i = name.lastIndexOf('/');
  return i === -1 ? '' : name.slice(0, i);
}

function baseOf(name) {
  return name.slice(name.lastIndexOf('/') + 1);
}

function cleanFolder(input) {
  return input
    .trim()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

/** Full-size preview with metadata and management actions. */
function PreviewOverlay({photo, onClose, onPublish, onArchive, onDelete, onPickColor}) {
  const [dims, setDims] = useState(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-panel" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl(photo.name, {v: photo.uploadedAt})}
          alt={photo.name}
          onLoad={(e) => setDims([e.target.naturalWidth, e.target.naturalHeight])}
        />
        <div className="preview-info">
          <p className="name" title={photo.name}>{photo.name}</p>
          <p className="meta">
            {dims ? `${dims[0]}×${dims[1]} px (served)` : 'measuring…'}
            {photo.size != null && ` · ${formatBytes(photo.size)}`}
            {' · '}
            {photo.archived ? 'archived' : photo.published ? 'published' : 'draft'}
          </p>
          {photo.palette && (
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
          )}
          <div className="preview-actions">
            <button className="primary" onClick={() => onPublish(!photo.published)}>
              {photo.published ? 'Unpublish' : 'Publish'}
            </button>
            <button onClick={() => onArchive(!photo.archived)}>
              {photo.archived ? 'Restore' : 'Archive'}
            </button>
            <a className="button-link" href={imageUrl(photo.name, {v: photo.uploadedAt})} target="_blank" rel="noreferrer">
              Open original
            </a>
            <button className="danger" onClick={onDelete}>Delete</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Defers fetching the image until the card is near the viewport. */
function LazyImage({src, alt}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {rootMargin: '400px'}
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <img ref={ref} src={visible ? src : undefined} alt={alt} loading="lazy" />;
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
  const [uploadFolder, setUploadFolder] = useState('');
  const [folderFilter, setFolderFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [previewName, setPreviewName] = useState(null);
  const [dupGroups, setDupGroups] = useState(null);
  const [notices, setNotices] = useState([]);
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
      const folder = cleanFolder(uploadFolder);
      for (const file of files) {
        const targetName = folder ? `${folder}/${file.name}` : file.name;
        setUploads((u) => [...u, {name: file.name, state: 'processing'}]);
        try {
          // EXIF must come from the original bytes — compression strips it.
          const exif = await parseExif(file);
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
          const hash = await computeHash(body);
          const candidate = {hash, color: palette.color, palette: palette.palette};
          const lookalike = (photos ?? []).find(
            (p) => p.name !== targetName && p.hash && isDuplicatePair(p, candidate)
          );
          if (lookalike) {
            setNotices((n) => [
              ...n,
              `${file.name} looks like a duplicate of ${lookalike.name}`
            ]);
          }
          const meta = {
            color: palette.color,
            palette: palette.palette,
            features: palette.features,
            exif,
            hash,
            width: dims?.width ?? palette.width,
            height: dims?.height ?? palette.height,
            size: body.size
          };
          setUploads((u) =>
            u.map((x) => (x.name === file.name ? {...x, state: 'uploading'} : x))
          );
          await api.upload(token, targetName, body, meta);
          const thumb = await makeThumbnail(body);
          const {photo} = await api.uploadThumb(token, targetName, thumb);
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
        const original = await (await fetch(imageUrl(p.name, {v: p.uploadedAt}))).blob();
        // Harvest EXIF before recompression discards it from the stored file.
        const exif = (await parseExif(original)) ?? p.exif ?? null;
        const c = await compressImage(original);
        if (c.compressed) {
          const before = p.size ?? c.blob.size;
          savedBytes += Math.max(0, before - c.blob.size);
          await api.upload(token, p.name, c.blob, {
            color: p.color,
            palette: p.palette,
            exif,
            width: c.width,
            height: c.height,
            size: c.blob.size
          });
        } else if (exif && !p.exif) {
          await api.update(token, p.name, {exif});
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

  const analyzeOne = useCallback(
    async (p) => {
      const blob = await (await fetch(imageUrl(p.name, {v: p.uploadedAt}))).blob();
      const meta = await computePalette(blob);
      const hash = await computeHash(blob);
      const exif = (await parseExif(blob)) ?? p.exif ?? undefined;
      const {photo} = await api.update(token, p.name, {
        color: meta.color,
        palette: meta.palette,
        features: meta.features,
        hash,
        ...(exif ? {exif} : {})
      });
      setPhotos((list) => list.map((x) => (x.name === p.name ? photo : x)));
    },
    [token]
  );

  const findDuplicates = () =>
    run('Scanning for duplicates…', async () => {
      const list = photos.map((p) => ({...p}));
      let hashed = 0;
      for (const p of list) {
        if (p.hash) continue;
        setStatus(`Hashing ${p.name} (${++hashed})…`);
        const hash = await computeHash(imageUrl(p.name, {thumb: true, v: p.uploadedAt}));
        const {photo} = await api.update(token, p.name, {hash});
        setPhotos((prev) => prev.map((x) => (x.name === p.name ? photo : x)));
        p.hash = hash;
      }
      const groups = groupDuplicates(list);
      setDupGroups(groups);
      return groups.length
        ? `Found ${groups.length} group(s) of lookalikes.`
        : 'No duplicates found — every photo is unique.';
    });

  const recompute = (name) =>
    run(`Analyzing ${name}…`, async () => {
      await analyzeOne(photos.find((p) => p.name === name));
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

  const moveSelected = () => {
    const input = window.prompt(
      'Move selected photos to folder (empty for top level):',
      folderFilter ?? ''
    );
    if (input === null) return;
    const folder = cleanFolder(input);
    run('Moving…', async () => {
      let moved = 0;
      for (const name of selected) {
        const target = folder ? `${folder}/${baseOf(name)}` : baseOf(name);
        if (target === name) continue;
        const {photo} = await api.update(token, name, {name: target});
        setPhotos((p) =>
          p
            .map((x) => (x.name === name ? photo : x))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        moved++;
      }
      setSelected(new Set());
      return `Moved ${moved} photo(s) to ${folder || 'top level'}.`;
    });
  };

  const analyzeMissing = () =>
    run('Analyzing photos without colors…', async () => {
      const missing = photos.filter((p) => !p.color);
      let done = 0;
      for (const p of missing) {
        setStatus(`Analyzing ${p.name} (${++done}/${missing.length})…`);
        await analyzeOne(p);
      }
    });

  const analyzeAll = () =>
    run('Analyzing all photos…', async () => {
      const targets = selected.size
        ? photos.filter((p) => selected.has(p.name))
        : photos;
      let done = 0;
      for (const p of targets) {
        setStatus(`Analyzing ${p.name} (${++done}/${targets.length})…`);
        await analyzeOne(p);
      }
      setSelected(new Set());
      return `Analyzed ${targets.length} photo(s) — colors, features, and EXIF refreshed.`;
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
  const folders = [...new Set((photos ?? []).map((p) => folderOf(p.name)))].sort();
  const inFolder =
    folderFilter === null
      ? photos
      : photos?.filter((p) => folderOf(p.name) === folderFilter);
  const statusTest = STATUS_FILTERS.find((f) => f.key === statusFilter).test;
  const visiblePhotos = inFolder?.filter(statusTest).sort(SORTERS[sortBy]);
  const previewPhoto = previewName && photos?.find((p) => p.name === previewName);
  const totalSize = photos?.reduce((sum, p) => sum + (p.size ?? 0), 0);

  const allSelected =
    Boolean(visiblePhotos?.length) &&
    visiblePhotos.every((p) => selected.has(p.name));

  const toggleSelectAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) {
        visiblePhotos.forEach((p) => next.delete(p.name));
      } else {
        visiblePhotos.forEach((p) => next.add(p.name));
      }
      return next;
    });
  };

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
            {photos
              ? `${photos.length} photos · ${published} published · ${formatBytes(totalSize) ?? '0 KB'} stored`
              : 'Loading…'}
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
          className="folder-input"
          type="text"
          list="folder-list"
          placeholder="folder (optional)"
          value={uploadFolder}
          onChange={(e) => setUploadFolder(e.target.value)}
          title="Uploads go into this folder in the bucket"
        />
        <datalist id="folder-list">
          {folders.filter(Boolean).map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
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
        <button
          onClick={analyzeAll}
          title="Recompute colors, similarity features, and EXIF for selected photos (or all)"
        >
          Analyze {selected.size ? selected.size : 'all'}
        </button>
        <button
          onClick={findDuplicates}
          title="Perceptually hash every photo and group lookalikes, even with different filenames"
        >
          Find duplicates
        </button>
        <button onClick={exportJson} title="Download published photos as images.json">
          Export JSON
        </button>
        <button onClick={refresh}>Refresh</button>
        {Boolean(visiblePhotos?.length) && (
          <button onClick={toggleSelectAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
        <span className="spacer" />
        {selected.size > 0 && (
          <>
            <span className="sel-count">{selected.size} selected</span>
            <button onClick={() => bulk({published: true})}>Publish</button>
            <button onClick={() => bulk({published: false})}>Unpublish</button>
            <button onClick={moveSelected}>Move to folder…</button>
            {statusFilter === 'archived' ? (
              <button onClick={() => bulk({archived: false})}>Restore</button>
            ) : (
              <button onClick={() => bulk({archived: true, published: false})}>Archive</button>
            )}
          </>
        )}
      </div>

      <div className="filter-bar">
        <div className="folder-chips">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip${statusFilter === f.key ? ' active' : ''}`}
              title={f.title}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label} ({inFolder?.filter(f.test).length ?? 0})
            </button>
          ))}
        </div>
        <label className="sort">
          sort
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">name</option>
            <option value="size">largest first</option>
            <option value="newest">newest first</option>
          </select>
        </label>
      </div>

      {folders.length > 1 && (
        <div className="folder-chips">
          <button
            className={`chip${folderFilter === null ? ' active' : ''}`}
            onClick={() => setFolderFilter(null)}
          >
            All ({photos?.length ?? 0})
          </button>
          {folders.map((f) => (
            <button
              key={f || '(top)'}
              className={`chip${folderFilter === f ? ' active' : ''}`}
              onClick={() => setFolderFilter(f)}
            >
              {f || 'top level'} ({photos?.filter((p) => folderOf(p.name) === f).length})
            </button>
          ))}
        </div>
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
      {notices.map((notice, i) => (
        <p key={i} className="notice">
          ⚠ {notice}
          <button onClick={() => setNotices((n) => n.filter((_, j) => j !== i))}>
            dismiss
          </button>
        </p>
      ))}
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

      {dupGroups && (
        <div className="dup-panel">
          <div className="match-head">
            <span>
              <strong>{dupGroups.filter((g) => g.map((n) => photos.find((p) => p.name === n)).filter(Boolean).length > 1).length}</strong>{' '}
              group(s) of possible duplicates — review and delete the extras
            </span>
            <button onClick={() => setDupGroups(null)}>close ×</button>
          </div>
          {dupGroups.map((group, gi) => {
            const members = group
              .map((name) => photos.find((p) => p.name === name))
              .filter(Boolean);
            if (members.length < 2) return null;
            return (
              <div key={gi} className="dup-group">
                {members.map((p) => (
                  <div key={p.name} className="dup-item">
                    <img
                      src={imageUrl(p.name, {thumb: true, v: p.uploadedAt})}
                      alt={p.name}
                      onClick={() => setPreviewName(p.name)}
                    />
                    <p className="name" title={p.name}>{baseOf(p.name)}</p>
                    <p className="dup-meta">
                      {formatBytes(p.size) ?? '?'}
                      {p.width ? ` · ${p.width}px` : ''}
                      {p.published ? ' · published' : ''}
                    </p>
                    <button className="danger" onClick={() => removePhoto(p.name)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid">
        {visiblePhotos?.map((photo) => (
          <PhotoCard
            key={photo.name}
            photo={photo}
            selected={selected.has(photo.name)}
            onSelect={() => toggleSelect(photo.name)}
            onPublish={(v) => patchPhoto(photo.name, {published: v})}
            onPickColor={(color) => patchPhoto(photo.name, {color})}
            onRecompute={() => recompute(photo.name)}
            onDelete={() => removePhoto(photo.name)}
            onPreview={() => setPreviewName(photo.name)}
          />
        ))}
        {visiblePhotos?.length === 0 && photos?.length > 0 && (
          <p className="empty">Nothing matches the current filters.</p>
        )}
        {photos && photos.length === 0 && (
          <p className="empty">
            No photos yet. Upload some, or use “Sync bucket” if you have already
            uploaded files to R2 directly.
          </p>
        )}
      </div>
      {previewPhoto && (
        <PreviewOverlay
          photo={previewPhoto}
          onClose={() => setPreviewName(null)}
          onPublish={(v) => patchPhoto(previewPhoto.name, {published: v})}
          onArchive={(v) =>
            patchPhoto(previewPhoto.name, v ? {archived: true, published: false} : {archived: false})
          }
          onPickColor={(color) => patchPhoto(previewPhoto.name, {color})}
          onDelete={() => {
            removePhoto(previewPhoto.name);
            setPreviewName(null);
          }}
        />
      )}
    </div>
  );
}

function PhotoCard({photo, selected, onSelect, onPublish, onPickColor, onRecompute, onDelete, onPreview}) {
  return (
    <div className={`card${selected ? ' selected' : ''}${photo.published ? '' : ' draft'}`}>
      <div
        className="thumb"
        style={{background: photo.color ? rgbCss(photo.color) : '#222'}}
        onClick={onPreview}
        title="Click to preview"
      >
        <LazyImage
          src={imageUrl(photo.name, {thumb: true, v: photo.uploadedAt})}
          alt={photo.name}
        />
        <input
          type="checkbox"
          className="select"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          title="Select for bulk actions"
        />
        <span className={`badge ${photo.archived ? 'draft' : photo.published ? 'live' : 'draft'}`}>
          {photo.archived ? 'archived' : photo.published ? 'published' : 'draft'}
        </span>
      </div>
      <div className="card-body">
        <p className="name" title={photo.name}>
          {baseOf(photo.name)}
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
          <button onClick={onPreview}>Preview</button>
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
