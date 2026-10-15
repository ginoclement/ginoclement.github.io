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
const FACE_STYLES = [
  {key: 'still', label: 'Still', note: 'static screenshot'},
  {key: 'drift', label: 'Drift', note: 'slow ken-burns pan'},
  {key: 'parallax', label: 'Parallax', note: 'shifts with the spin'}
];

export default function SettingsEditor({token, run}) {
  const [views, setViews] = useState(null);
  const [faceStyle, setFaceStyle] = useState('drift');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings`)
      .then((r) => (r.ok ? r.json() : {views: {}}))
      .then((saved) => {
        setViews(saved.views ?? {});
        if (saved.faceStyle) setFaceStyle(saved.faceStyle);
      })
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
      const saved = await api.saveSettings(token, views, faceStyle);
      setViews(saved.views);
      if (saved.faceStyle) setFaceStyle(saved.faceStyle);
      setDirty(false);
      return 'Site settings published — the site picks them up within a minute.';
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
      <div className="match-head" style={{marginTop: 12}}>
        <span>
          <strong>Polyhedron faces</strong> — how face images move on the 3D solid
        </span>
      </div>
      <div className="page-toggles">
        {FACE_STYLES.map((style) => (
          <label
            key={style.key}
            className={`page-toggle${faceStyle === style.key ? '' : ' off'}`}
          >
            <input
              type="radio"
              name="face-style"
              checked={faceStyle === style.key}
              onChange={() => {
                setFaceStyle(style.key);
                setDirty(true);
              }}
            />
            <span className="page-name">{style.label}</span>
            <span className="page-note">{style.note}</span>
          </label>
        ))}
      </div>
      <p className="drop-hint">
        Face images are uploaded per link below (a screenshot of each site works
        best); links without an image keep their gradient.
      </p>
    </div>
  );
}
