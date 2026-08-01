import {useEffect, useMemo, useState} from 'react';
import bundledImages from './images.json';
import {API_BASE_URL, imageUrl} from './config.js';
import {hueSortKey} from './lib/color.js';
import ImageBox from './ImageBox.jsx';
import Projects from './Projects.jsx';
import ColorSpace from './views/ColorSpace.jsx';
import Wall from './views/Wall.jsx';
import Threads from './views/Threads.jsx';
import Timeline from './views/Timeline.jsx';
import Folders from './views/Folders.jsx';
import Stats from './views/Stats.jsx';
import Mosaic from './views/Mosaic.jsx';
import './App.css';

const VIEWS = [
  {key: 'colors', label: 'Colors'},
  {key: 'wall', label: 'Wall'},
  {key: 'threads', label: 'Threads'},
  {key: 'timeline', label: 'Timeline'},
  {key: 'folders', label: 'Collections'},
  {key: 'stats', label: 'Stats'},
  {key: 'mosaic', label: 'Mosaic'}
];

const HINTS = {
  colors: 'photography in color space — drag to orbit, click a dot to view',
  wall: 'every photo, arranged by color',
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
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL) return;
    fetch(`${API_BASE_URL}/api/gallery`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((json) => setImages(json.data ?? []))
      .catch(() => setImages(bundledImages.data));
  }, []);

  const list = images ?? [];

  // Slideshow: walk the gallery in hue order so colors drift smoothly.
  const playOrder = useMemo(
    () => [...list].sort((a, b) => hueSortKey(a.color) - hueSortKey(b.color)),
    [list]
  );

  useEffect(() => {
    if (!playing || !playOrder.length) return;
    const advance = () => {
      setSelected((current) => {
        const idx = current ? playOrder.findIndex((p) => p.name === current.name) : -1;
        const next = playOrder[(idx + 1) % playOrder.length];
        // Warm the cache for the photo after next.
        const after = playOrder[(idx + 2) % playOrder.length];
        if (after) new Image().src = imageUrl(after.name, {v: after.v});
        return next;
      });
    };
    const id = setInterval(advance, 4000);
    return () => clearInterval(id);
  }, [playing, playOrder]);

  const closeLightbox = () => {
    setSelected(null);
    setPlaying(false);
  };

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
        onClose={closeLightbox}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        onFindSimilar={
          view === 'colors'
            ? (img) => {
                setSimTarget(img);
                setSelected(null);
                setPlaying(false);
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
          {view === 'wall' && <Wall images={list} onSelect={setSelected} />}
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
