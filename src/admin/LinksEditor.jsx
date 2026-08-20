import {useEffect, useState} from 'react';
import {API_BASE_URL} from '../config.js';
import {api} from './api.js';

// Prefilled when no links are saved yet — prune, edit, and Save to publish.
const SUGGESTED = [
  {title: 'Beer', url: 'https://beer.ginoclement.com', description: 'Beer visualization', tag: 'app'},
  {title: 'Nut Games', url: 'https://nutgames.ginoclement.com', description: 'Games', tag: 'app'},
  {title: 'Words', url: 'https://words.ginoclement.com', description: 'Word game', tag: 'app'},
  {title: 'Cribbage', url: 'https://cribbage.ginoclement.com', description: 'Cribbage scorer', tag: 'app'},
  {title: 'log.broker', url: 'https://log.broker', description: 'Log reporting', tag: 'app'},
  {title: 'Terrain', url: 'https://github.com/ginoclement/personal', description: 'deck.gl terrain experiments', tag: 'project'},
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
      {links.map((link, i) => (
        <div key={i} className="link-row">
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
          <span className="link-buttons">
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
