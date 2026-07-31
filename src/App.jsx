import {useEffect, useMemo, useState} from 'react';
import DeckGL from '@deck.gl/react';
import {PointCloudLayer} from '@deck.gl/layers';
import {COORDINATE_SYSTEM, OrbitView} from '@deck.gl/core';
import bundledImages from './images.json';
import {API_BASE_URL} from './config.js';
import ImageBox from './ImageBox.jsx';
import Projects from './Projects.jsx';
import './App.css';

const isMobile = window.matchMedia('(pointer: coarse)').matches;

// Each photo becomes a dot placed in HSL color space: hue and saturation as
// polar coordinates in the XY plane, lightness on the Z axis.
const RADIUS_SCALE = 4;
const HEIGHT_SCALE = 3;

const INITIAL_VIEW_STATE = {
  target: [0, 0, 0],
  rotationOrbit: 0,
  rotationX: 0,
  minZoom: 0,
  maxZoom: 3,
  zoom: isMobile ? 0 : 0.5
};

// Returns [hue 0-360, saturation 0-100, lightness 0-100].
function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function colorToPosition(color) {
  const [h, s, l] = rgbToHsl(color);
  const x = RADIUS_SCALE * s * Math.cos((h * Math.PI) / 180);
  const y = RADIUS_SCALE * s * Math.sin((h * Math.PI) / 180);
  return [x, y, (l - 50) * HEIGHT_SCALE];
}

export default function App() {
  // With an API configured, the published gallery is the source of truth
  // (null = still loading); the bundled snapshot is only a fallback for when
  // the API can't be reached, or for API-less builds.
  const [images, setImages] = useState(API_BASE_URL ? null : bundledImages.data);
  const [selected, setSelected] = useState(null);
  const [showProjects, setShowProjects] = useState(false);

  useEffect(() => {
    if (!API_BASE_URL) return;
    fetch(`${API_BASE_URL}/api/gallery`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((json) => setImages(json.data ?? []))
      .catch(() => setImages(bundledImages.data));
  }, []);

  const layers = useMemo(
    () => [
      new PointCloudLayer({
        id: 'picture-point-layer',
        data: images ?? [],
        pickable: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        radiusPixels: isMobile ? 8 : 6,
        getPosition: (d) => colorToPosition(d.color),
        getColor: (d) => d.color,
        onClick: ({object}) => setSelected(object)
      })
    ],
    [images]
  );

  return (
    <div>
      <header className="site-header">
        <div className="brand">
          <h1>Gino Clement</h1>
          <p>photography, arranged by color — drag to orbit, click a dot to view</p>
        </div>
        <nav>
          <button className="nav-btn" onClick={() => setShowProjects(true)}>
            Projects
          </button>
          <a className="nav-btn" href="https://github.com/ginoclement" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>
      <Projects open={showProjects} onClose={() => setShowProjects(false)} />
      {images?.length === 0 && (
        <p className="status-msg">No photos published yet — check back soon.</p>
      )}
      <ImageBox image={selected} onClose={() => setSelected(null)} />
      <div className="deck">
        <DeckGL
          views={new OrbitView()}
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          getTooltip={({object}) => object && object.name}
          onClick={({layer}) => {
            if (!layer) setSelected(null);
          }}
        />
      </div>
    </div>
  );
}
