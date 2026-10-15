import {useEffect, useState} from 'react';
import {API_BASE_URL} from '../config.js';
import {api} from './api.js';

const PAGES = [
  {key: 'colors', label: 'Colors', note: '3D color space (landing view)'},
  {key: 'wall', label: 'Wall', note: 'hue-sorted contact sheet'},
  {key: 'threads', label: 'Threads', note: 'woven palette ribbon'},
  {key: 'timeline', label: 'Timeline', note: 'color diary by capture date'},
  {key: 'folders', label: 'Collections', note: 'folder color signatures'},
  {key: 'stats', label: 'Stats', note: 'EXIF dashboard'},
  {key: 'mosaic', label: 'Mosaic', note: 'photos made of photos'},
  {key: 'projects', label: 'Projects', note: 'orbit map of apps and repos'}
];

/** Show/hide toggles for each page of the public site. */
export default function SettingsEditor({token, run}) {
  const [views, setViews] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings`)
      .then((r) => (r.ok ? r.json() : {views: {}}))
      .then(({views: saved}) => setViews(saved ?? {}))
      .catch(() => setViews({}));
  }, []);

  if (views === null) return <p className="status">Loading site settings…</p>;

  const enabled = (key) => views[key] !== false;
  const visibleCount = PAGES.filter((p) => enabled(p.key)).length;

  const toggle = (key) => {
    if (enabled(key) && visibleCount === 1) return; // keep at least one page
    setViews((v) => ({...v, [key]: !enabled(key)}));
    setDirty(true);
  };

  const save = () =>
    run('Saving site settings…', async () => {
      const {views: saved} = await api.saveSettings(token, views);
      setViews(saved);
      setDirty(false);
      return 'Page visibility published — the site picks it up within a minute.';
    });

  return (
    <div className="links-panel">
      <div className="match-head">
        <span>
          <strong>Pages</strong> — choose which views appear in the site's nav
        </span>
        <button className="primary" onClick={save} disabled={!dirty}>
          Save
        </button>
      </div>
      <div className="page-toggles">
        {PAGES.map((page) => (
          <label key={page.key} className={`page-toggle${enabled(page.key) ? '' : ' off'}`}>
            <input
              type="checkbox"
              checked={enabled(page.key)}
              onChange={() => toggle(page.key)}
            />
            <span className="page-name">{page.label}</span>
            <span className="page-note">{page.note}</span>
          </label>
        ))}
      </div>
      <p className="drop-hint">
        Hidden pages disappear from the nav; the first visible page becomes the
        landing view. At least one page stays on.
      </p>
    </div>
  );
}
