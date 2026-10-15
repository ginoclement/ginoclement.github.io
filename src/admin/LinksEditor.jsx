import {useEffect, useRef, useState} from 'react';
import {API_BASE_URL, faceUrl} from '../config.js';
import {api} from './api.js';
import {compressImage} from './imageTools.js';

function slugify(title) {
  return (
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'face'
  );
}

// Prefilled when no links are saved yet — prune, edit, and Save to publish.
const SUGGESTED = [
  {title: 'Beer', url: 'https://beer.ginoclement.com', description: 'Beer visualization', tag: 'app'},
  {title: 'Nut Games', url: 'https://nutgames.ginoclement.com', description: 'Games', tag: 'app'},
  {title: 'Words', url: 'https://words.ginoclement.com', description: 'Word game', tag: 'app'},
  {title: 'Cribbage', url: 'https://cribbage.ginoclement.com', description: 'Cribbage scorer', tag: 'app'},
  {title: 'log.broker', url: 'https://log.broker', description: 'Log reporting', tag: 'app'},
  {title: 'Terrain', url: 'https://ginoclement.github.io/terrain/', description: 'deck.gl terrain experiments', tag: 'project'},
  {title: 'Family Tree', url: 'https://ginoclement.github.io/familytree/', description: 'Interactive family tree', tag: 'project'},
  {title: 'Seattle Graphs', url: 'https://seattle-graphs.vercel.app', description: 'Seattle data visualizations', tag: 'viz'},
  {title: 'Cryptoviz', url: 'https://cryptoviz.vercel.app', description: 'Crypto visualization', tag: 'viz'},
  {title: 'Rifle Design', url: 'https://rifledesign.vercel.app', description: '', tag: 'site'}
];

const EMPTY = {title: '', url: 'https://', description: '', tag: ''};

/** Editor for the curated project links shown in the site's Projects panel. */
export default function LinksEditor({token, run}) {
  const [links, setLinks] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const fileRef = useRef(null);
  const uploadRow = useRef(null);

  const pickImage = (i) => {
    uploadRow.current = i;
    fileRef.current?.click();
  };

  const onImageChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const i = uploadRow.current;
    if (!file || i == null) return;
    run('Uploading face image…', async () => {
      const slug = slugify(links[i].title || `link-${i}`);
      // Face art renders small: 1000px is plenty and keeps faces snappy.
      const c = await compressImage(file, {maxDim: 1000, quality: 0.8});
      await api.uploadFace(token, slug, c.blob);
      setLinks((l) =>
        l.map((row, j) => (j === i ? {...row, image: slug, imageV: Date.now()} : row))
      );
      setDirty(true);
      return 'Image uploaded — press Save to publish it on this link.';
    });
  };

  const removeImage = (i) => {
    const slug = links[i].image;
    run('Removing face image…', async () => {
      if (slug) await api.removeFace(token, slug).catch(() => {});
      setLinks((l) => l.map((row, j) => (j === i ? {...row, image: '', imageV: 0} : row)));
      setDirty(true);
      return 'Image removed — press Save to publish the change.';
    });
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/links`)
      .then((r) => (r.ok ? r.json() : {links: []}))
      .then(({links: saved}) => {
        if (saved?.length) {
          setLinks(saved);
        } else {
          setLinks(SUGGESTED.map((l) => ({...l})));
          setSeeded(true);
          setDirty(true);
        }
      })
      .catch(() => setLinks([]));
  }, []);

  if (links === null) return <p className="status">Loading links…</p>;

  const edit = (i, field, value) => {
    setLinks((l) => l.map((row, j) => (j === i ? {...row, [field]: value} : row)));
    setDirty(true);
  };

  const move = (i, dir) => {
    setLinks((l) => {
      const next = [...l];
      const j = i + dir;
      if (j < 0 || j >= next.length) return l;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  const remove = (i) => {
    setLinks((l) => l.filter((_, j) => j !== i));
    setDirty(true);
  };

  const save = () =>
    run('Saving links…', async () => {
      const cleaned = links.filter((l) => l.title.trim() && /^https?:\/\//.test(l.url));
      const {links: saved} = await api.saveLinks(token, cleaned);
      setLinks(saved);
      setDirty(false);
      setSeeded(false);
      return `Published ${saved.length} link(s) to the site's Projects panel.`;
    });

  return (
    <div className="links-panel">
      <div className="match-head">
        <span>
          <strong>Project links</strong> — shown in the site's Projects panel
          {seeded && ' (suggestions prefilled; Save to publish)'}
        </span>
        <span className="links-actions">
          <button onClick={() => { setLinks((l) => [...l, {...EMPTY}]); setDirty(true); }}>
            + Add
          </button>
          <button className="primary" onClick={save} disabled={!dirty}>
            Save
          </button>
        </span>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onImageChosen} />
      {links.map((link, i) => (
        <div key={i} className="link-row">
          <button
            className="face-thumb"
            title={link.image ? 'Replace face image' : 'Upload a face image (screenshot of the site)'}
            onClick={() => pickImage(i)}
          >
            {link.image ? (
              <img src={faceUrl(link.image, link.imageV)} alt="" />
            ) : (
              <span>＋🖼</span>
            )}
          </button>
          <input
            className="link-title"
            placeholder="title"
            value={link.title}
            onChange={(e) => edit(i, 'title', e.target.value)}
          />
          <input
            className="link-url"
            placeholder="https://…"
            value={link.url}
            onChange={(e) => edit(i, 'url', e.target.value)}
          />
          <input
            className="link-desc"
            placeholder="description (optional)"
            value={link.description}
            onChange={(e) => edit(i, 'description', e.target.value)}
          />
          <input
            className="link-tag"
            placeholder="tag"
            value={link.tag}
            onChange={(e) => edit(i, 'tag', e.target.value)}
          />
          <select
            className="link-motion"
            title="How this project's image moves on its face and tile"
            value={link.motion ?? ''}
            onChange={(e) => edit(i, 'motion', e.target.value)}
          >
            <option value="">motion: default</option>
            <option value="still">still</option>
            <option value="drift">drift</option>
            <option value="zoom">zoom</option>
            <option value="sway">sway</option>
            <option value="parallax">parallax</option>
          </select>
          <span className="link-buttons">
            {link.image && (
              <button onClick={() => removeImage(i)} title="Remove face image">🖼✕</button>
            )}
            <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === links.length - 1} title="Move down">↓</button>
            <button className="danger" onClick={() => remove(i)} title="Remove">✕</button>
          </span>
        </div>
      ))}
      {links.length === 0 && <p className="drop-hint">No links — add some and Save.</p>}
    </div>
  );
}
