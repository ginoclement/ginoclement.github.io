import {useMemo, useState} from 'react';
import {rgbCss, rgbToHsl} from '../../lib/color.js';
import {polar} from './helpers.js';

const HUE_BINS = 24;
const GRAY_SAT = 12;

function hueName(deg) {
  if (deg < 15 || deg >= 345) return 'reds';
  if (deg < 45) return 'oranges';
  if (deg < 70) return 'yellows';
  if (deg < 160) return 'greens';
  if (deg < 200) return 'teals';
  if (deg < 260) return 'blues';
  if (deg < 300) return 'purples';
  return 'pinks';
}

/** Circular histogram of dominant hues; the hub holds the near-grays.
 * Sectors and hub filter. */
export function HueWheel({images, filter, onFilter}) {
  const [hover, setHover] = useState(null);
  const {bins, grays} = useMemo(() => {
    const b = Array.from({length: HUE_BINS}, () => 0);
    let g = 0;
    for (const img of images) {
      const [h, s] = rgbToHsl(img.color);
      if (s < GRAY_SAT) g++;
      else b[Math.floor(h / (360 / HUE_BINS)) % HUE_BINS]++;
    }
    return {bins: b, grays: g};
  }, [images]);

  const SIZE = 340;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R0 = 52;
  const R1 = 150;
  const max = Math.max(...bins, 1);
  const gap = 0.015;

  const binHue = (i) => (i + 0.5) * (360 / HUE_BINS);

  const wedge = (i, rOuter) => {
    const a0 = ((i / HUE_BINS) * 2 - 0.5) * Math.PI + gap;
    const a1 = (((i + 1) / HUE_BINS) * 2 - 0.5) * Math.PI - gap;
    const [x0, y0] = polar(cx, cy, R0, a0);
    const [x1, y1] = polar(cx, cy, rOuter, a0);
    const [x2, y2] = polar(cx, cy, rOuter, a1);
    const [x3, y3] = polar(cx, cy, R0, a1);
    return `M${x0},${y0} L${x1},${y1} A${rOuter},${rOuter} 0 0 1 ${x2},${y2} L${x3},${y3} A${R0},${R0} 0 0 0 ${x0},${y0} Z`;
  };

  const grayFilterActive = filter?.key === 'hue:gray';

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Hue wheel</span>
        <span className="chart-note">what colors you actually shoot — click to filter</span>
      </figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Photos by dominant hue">
        {bins.map((count, i) => {
          if (!count) return null;
          const selected = filter?.key === `hue:${i}`;
          return (
            <path
              key={i}
              d={wedge(i, R0 + (count / max) * (R1 - R0))}
              fill={`hsl(${binHue(i)}, 65%, 52%)`}
              stroke={selected ? '#222' : '#fff'}
              strokeWidth={selected ? 2 : 1}
              opacity={hover !== null && hover !== i ? 0.35 : 1}
              style={{cursor: 'pointer'}}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() =>
                onFilter({
                  key: `hue:${i}`,
                  label: `${hueName(binHue(i))} (hues near ${Math.round(binHue(i))}°)`,
                  test: (p) => {
                    const [h, s] = rgbToHsl(p.color);
                    return s >= GRAY_SAT && Math.floor(h / (360 / HUE_BINS)) % HUE_BINS === i;
                  }
                })
              }
            >
              <title>{`${hueName(binHue(i))}: ${count}`}</title>
            </path>
          );
        })}
        <circle
          cx={cx}
          cy={cy}
          r={R0 - 8}
          fill="#f0f0f2"
          stroke={grayFilterActive ? '#222' : '#ddd'}
          style={{cursor: grays ? 'pointer' : 'default'}}
          onClick={() =>
            grays &&
            onFilter({
              key: 'hue:gray',
              label: 'near-grays and neutrals',
              test: (p) => rgbToHsl(p.color)[1] < GRAY_SAT
            })
          }
        />
        <text x={cx} y={cy - 2} textAnchor="middle" className="clock-center" style={{fontSize: 18}}>
          {grays}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="axis-label">
          grays
        </text>
      </svg>
    </figure>
  );
}

/** Saturation x lightness scatter — every photo as a dot in its own color.
 * Dots open the photo. */
export function MoodMap({images, onSelect}) {
  const W = 340;
  const H = 300;
  const PAD = 26;
  const x = (s) => PAD + (s / 100) * (W - 2 * PAD);
  const y = (l) => H - PAD - (l / 100) * (H - 2 * PAD);

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Mood map</span>
        <span className="chart-note">saturation × lightness — click a dot to open</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photos by saturation and lightness">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#d8d8e0" />
        <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#d8d8e0" />
        <text x={PAD} y={PAD - 8} className="ghost-label">
          luminous
        </text>
        <text x={PAD} y={H - 8} className="ghost-label">
          muted
        </text>
        <text x={W - PAD} y={H - 8} textAnchor="end" className="ghost-label">
          vivid
        </text>
        {images.map((img) => {
          const [, s, l] = rgbToHsl(img.color);
          return (
            <circle
              key={img.name}
              cx={x(s)}
              cy={y(l)}
              r={4.5}
              fill={rgbCss(img.color)}
              stroke="#fff"
              strokeWidth="1"
              style={{cursor: 'pointer'}}
              onClick={() => onSelect(img)}
            >
              <title>{img.name}</title>
            </circle>
          );
        })}
      </svg>
    </figure>
  );
}
