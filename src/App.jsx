import {useEffect, useState} from 'react';
import bundledImages from './images.json';
import {API_BASE_URL} from './config.js';
import ImageBox from './ImageBox.jsx';
import Projects from './Projects.jsx';
import ColorSpace from './views/ColorSpace.jsx';
import Threads from './views/Threads.jsx';
import Timeline from './views/Timeline.jsx';
import Folders from './views/Folders.jsx';
import Stats from './views/Stats.jsx';
import Mosaic from './views/Mosaic.jsx';
import './App.css';

const VIEWS = [
  {key: 'colors', label: 'Colors'},
  {key: 'threads', label: 'Threads'},
  {key: 'timeline', label: 'Timeline'},
  {key: 'folders', label: 'Collections'},
  {key: 'stats', label: 'Stats'},
  {key: 'mosaic', label: 'Mosaic'}
];

const HINTS = {
  colors: 'photography in color space — drag to orbit, click a dot to view',
  threads: 'the gallery as one woven ribbon of color',
  timeline: 'a color diary in capture order',
  folders: 'collections and their color signatures',
  stats: 'shooting habits, from EXIF',
  mosaic: 'photos made of photos'
};

export default function App() {
  // With an API configured, the published gallery is the source of truth
  // (null = still loading); the bundled snapshot is only a fallback for when
  // the API can't be reached, or for API-less builds.
  const [images, setImages] = useState(API_BASE_URL ? null : bundledImages.data);
  const [view, setView] = useState('colors');
  const [selected, setSelected] = useState(null);
  const [simTarget, setSimTarget] = useState(null);
  const [showProjects, setShowProjects] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL) return;
    fetch(`${API_BASE_URL}/api/gallery`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((json) => setImages(json.data ?? []))
      .catch(() => setImages(bundledImages.data));
  }, []);

  const list = images ?? [];

  return (
    <div>
      <header className="site-header">
        <div className="brand">
          <h1>Gino Clement</h1>
          <p>{HINTS[view]}</p>
        </div>
        <nav>
          <div className="view-nav">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                className={`nav-btn${view === v.key ? ' active' : ''}`}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button className="nav-btn" onClick={() => setShowProjects(true)}>
            Projects
          </button>
          <a
            className="nav-btn"
            href="https://github.com/ginoclement"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </header>
      <Projects open={showProjects} onClose={() => setShowProjects(false)} />
      {images?.length === 0 && (
        <p className="status-msg">No photos published yet — check back soon.</p>
      )}
      <ImageBox
        image={selected}
        onClose={() => setSelected(null)}
        onFindSimilar={
          view === 'colors'
            ? (img) => {
                setSimTarget(img);
                setSelected(null);
              }
            : undefined
        }
      />
      {view === 'colors' && (
        <ColorSpace
          images={list}
          onSelect={setSelected}
          simTarget={simTarget}
          onClearSim={() => setSimTarget(null)}
        />
      )}
      {view !== 'colors' && (
        <main className="view-scroll">
          {view === 'threads' && <Threads images={list} onSelect={setSelected} />}
          {view === 'timeline' && <Timeline images={list} onSelect={setSelected} />}
          {view === 'folders' && <Folders images={list} onSelect={setSelected} />}
          {view === 'stats' && <Stats images={list} onSelect={setSelected} />}
          {view === 'mosaic' && <Mosaic images={list} />}
        </main>
      )}
    </div>
  );
}
