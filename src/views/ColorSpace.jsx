import {useMemo, useState} from 'react';
import DeckGL from '@deck.gl/react';
import {PointCloudLayer, LineLayer} from '@deck.gl/layers';
import {COORDINATE_SYSTEM, OrbitView} from '@deck.gl/core';
import {rgbToHsl, paletteDistance} from '../lib/color.js';
import {pcaProject} from '../lib/pca.js';

const isMobile = window.matchMedia('(pointer: coarse)').matches;

// Hue/saturation as polar XY, lightness as Z.
const RADIUS_SCALE = 4;
const HEIGHT_SCALE = 3;
const GOLDEN_ANGLE = 2.399963229728653;

const INITIAL_VIEW_STATE = {
  target: [0, 0, 0],
  rotationOrbit: 0,
  rotationX: 0,
  minZoom: 0,
  maxZoom: 3,
  zoom: isMobile ? 0 : 0.5
};

function colorToPosition(color) {
  const [h, s, l] = rgbToHsl(color);
  const x = RADIUS_SCALE * s * Math.cos((h * Math.PI) / 180);
  const y = RADIUS_SCALE * s * Math.sin((h * Math.PI) / 180);
  return [x, y, (l - 50) * HEIGHT_SCALE];
}

function distSq(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

export default function ColorSpace({images, onSelect, simTarget, onClearSim}) {
  const [layout, setLayout] = useState('color');
  const [constellation, setConstellation] = useState(false);

  const featured = useMemo(() => images.filter((i) => i.features?.length), [images]);
  const hasFeatures = featured.length >= 10;

  const {data, positions, layoutKey} = useMemo(() => {
    // Similarity morph: the clicked photo at the center, everything else on
    // a golden-angle spiral, radius proportional to palette distance.
    if (simTarget) {
      const target = images.find((i) => i.name === simTarget.name) ?? simTarget;
      const others = images
        .filter((i) => i.name !== target.name)
        .map((i) => ({i, d: paletteDistance(target, i)}))
        .sort((a, b) => a.d - b.d);
      const dmax = Math.max(...others.map((o) => o.d), 1);
      const pos = new Map([[target.name, [0, 0, 0]]]);
      others.forEach((o, rank) => {
        const r = 70 + 380 * (o.d / dmax);
        const angle = rank * GOLDEN_ANGLE;
        pos.set(o.i.name, [r * Math.cos(angle), r * Math.sin(angle), 0]);
      });
      return {data: images, positions: pos, layoutKey: `sim:${target.name}`};
    }
    if (layout === 'shape' && hasFeatures) {
      const projected = pcaProject(featured.map((i) => i.features));
      const pos = new Map(featured.map((i, idx) => [i.name, projected[idx]]));
      return {data: featured, positions: pos, layoutKey: 'shape'};
    }
    const pos = new Map(images.map((i) => [i.name, colorToPosition(i.color)]));
    return {data: images, positions: pos, layoutKey: 'color'};
  }, [images, layout, simTarget, featured, hasFeatures]);

  // Constellation: connect each photo to its 2 nearest neighbors.
  const edges = useMemo(() => {
    if (!constellation) return [];
    const points = data.map((i) => positions.get(i.name));
    const result = [];
    for (let a = 0; a < points.length; a++) {
      const nearest = points
        .map((p, b) => ({b, d: b === a ? Infinity : distSq(points[a], p)}))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const {b} of nearest) {
        result.push({source: points[a], target: points[b]});
      }
    }
    return result;
  }, [constellation, data, positions]);

  const layers = useMemo(() => {
    const list = [];
    if (edges.length) {
      list.push(
        new LineLayer({
          id: 'constellation',
          data: edges,
          getSourcePosition: (d) => d.source,
          getTargetPosition: (d) => d.target,
          getColor: [120, 120, 145, 70],
          getWidth: 1,
          updateTriggers: {getSourcePosition: layoutKey, getTargetPosition: layoutKey}
        })
      );
    }
    list.push(
      new PointCloudLayer({
        id: 'photos',
        data,
        pickable: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        radiusPixels: isMobile ? 8 : 6,
        getPosition: (d) => positions.get(d.name),
        getColor: (d) => d.color,
        onClick: ({object}) => onSelect(object),
        updateTriggers: {getPosition: layoutKey},
        transitions: {getPosition: {duration: 800, easing: (t) => t * (2 - t)}}
      })
    );
    return list;
  }, [data, positions, edges, layoutKey, onSelect]);

  return (
    <div>
      <div className="space-controls">
        {simTarget ? (
          <span className="sim-banner">
            similar to <strong>{simTarget.name.split('/').pop()}</strong>
            <button onClick={onClearSim}>back to space</button>
          </span>
        ) : (
          hasFeatures && (
            <label>
              layout
              <select value={layout} onChange={(e) => setLayout(e.target.value)}>
                <option value="color">color space</option>
                <option value="shape">visual similarity</option>
              </select>
            </label>
          )
        )}
        <label>
          <input
            type="checkbox"
            checked={constellation}
            onChange={(e) => setConstellation(e.target.checked)}
          />
          constellation
        </label>
      </div>
      <div className="deck">
        <DeckGL
          views={new OrbitView()}
          initialViewState={INITIAL_VIEW_STATE}
          controller={true}
          layers={layers}
          getTooltip={({object}) => object && object.name}
          onClick={({layer}) => {
            if (!layer) onSelect(null);
          }}
        />
      </div>
    </div>
  );
}
