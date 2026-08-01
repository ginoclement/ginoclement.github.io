import {useMemo, useState} from 'react';
import {rgbCss} from '../../lib/color.js';
import {ACCENT, ACCENT_RGB, STOPS, nearestStop} from './helpers.js';

const FOCAL_TICKS = [10, 16, 24, 35, 50, 85, 135, 200, 400, 600];

/** Log-scale focal length axis; each photo is a dot in its own color.
 * Dots open the photo. */
export function LensAxis({withExif, onSelect}) {
  const photos = useMemo(
    () => withExif.filter((p) => p.exif.focalLength).sort((a, b) => a.name.localeCompare(b.name)),
    [withExif]
  );
  if (!photos.length) return null;

  const W = 720;
  const PAD = 24;
  const domain = [Math.log(9), Math.log(700)];
  const x = (mm) =>
    PAD + ((Math.log(mm) - domain[0]) / (domain[1] - domain[0])) * (W - 2 * PAD);

  const stacks = new Map();
  for (const p of photos) {
    if (!stacks.has(p.exif.focalLength)) stacks.set(p.exif.focalLength, []);
    stacks.get(p.exif.focalLength).push(p);
  }
  const maxStack = Math.max(...[...stacks.values()].map((s) => s.length));
  const DOT = Math.min(9, Math.max(4, 150 / maxStack));
  const plotH = Math.min(190, maxStack * DOT + 10);
  const H = plotH + 40;
  const baseline = plotH + 8;

  const median = photos
    .map((p) => p.exif.focalLength)
    .sort((a, b) => a - b)[Math.floor(photos.length / 2)];

  return (
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Lens axis</span>
        <span className="chart-note">
          each dot is a photo in its own color — click a dot to open it
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photos by focal length">
        <line x1={PAD} x2={W - PAD} y1={baseline} y2={baseline} stroke="#d8d8e0" />
        {FOCAL_TICKS.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={baseline} y2={baseline + 4} stroke="#c8c8d2" />
            <text x={x(t)} y={baseline + 16} textAnchor="middle" className="axis-label">
              {t}
            </text>
          </g>
        ))}
        <text x={W - PAD} y={baseline + 28} textAnchor="end" className="axis-label">
          mm
        </text>
        <g>
          <line
            x1={x(median)}
            x2={x(median)}
            y1={baseline - plotH}
            y2={baseline}
            stroke="#c8c8d2"
            strokeDasharray="3 3"
          />
          <text x={x(median)} y={baseline - plotH + 2} textAnchor="middle" className="axis-label strong">
            median {median}mm
          </text>
        </g>
        {[...stacks.keys()].sort((a, b) => a - b).map((mm) =>
          stacks.get(mm).map((p, i) => (
            <circle
              key={p.name}
              cx={x(mm)}
              cy={baseline - DOT / 2 - 1 - i * DOT}
              r={DOT / 2 - 0.5}
              fill={rgbCss(p.color)}
              stroke="#fff"
              strokeWidth="1"
              style={{cursor: 'pointer'}}
              onClick={() => onSelect(p)}
            >
              <title>{`${p.name} — ${mm}mm`}</title>
            </circle>
          ))
        )}
      </svg>
    </figure>
  );
}

/** Concentric rings sized like a real lens pupil per f-stop. Rings filter. */
export function ApertureIris({withExif, filter, onFilter}) {
  const [hover, setHover] = useState(null);
  const bins = useMemo(() => {
    const counts = new Map();
    for (const p of withExif) {
      if (!p.exif.fNumber) continue;
      const s = nearestStop(p.exif.fNumber);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return STOPS.filter((s) => counts.has(s)).map((s) => ({stop: s, count: counts.get(s)}));
  }, [withExif]);
  if (!bins.length) return null;

  const SIZE = 260;
  const c = SIZE / 2;
  const max = Math.max(...bins.map((b) => b.count));
  const radius = (stop) => 112 / stop + 4;
  const active = (stop) => hover === stop || filter?.key === `stop:${stop}`;

  const makeFilter = (stop) => ({
    key: `stop:${stop}`,
    label: `shot around f/${stop}`,
    test: (p) => p.exif?.fNumber && nearestStop(p.exif.fNumber) === stop
  });

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Aperture iris</span>
        <span className="chart-note">rings sized like the pupil at each f-stop — click to filter</span>
      </figcaption>
      <div className="iris-row">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Photos by aperture">
          {bins.map((b) => (
            <circle
              key={b.stop}
              cx={c}
              cy={c}
              r={radius(b.stop)}
              fill="none"
              stroke={ACCENT}
              strokeWidth={2 + 8 * (b.count / max)}
              strokeOpacity={
                hover === null && !filter?.key.startsWith('stop:')
                  ? 0.25 + 0.75 * (b.count / max)
                  : active(b.stop)
                    ? 0.25 + 0.75 * (b.count / max)
                    : 0.12
              }
              style={{cursor: 'pointer'}}
              onMouseEnter={() => setHover(b.stop)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFilter(makeFilter(b.stop))}
            />
          ))}
          <circle cx={c} cy={c} r={2.5} fill="#999" />
        </svg>
        <ul className="iris-legend">
          {bins.map((b) => (
            <li
              key={b.stop}
              className={active(b.stop) ? 'strong' : ''}
              onMouseEnter={() => setHover(b.stop)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFilter(makeFilter(b.stop))}
              style={{cursor: 'pointer'}}
            >
              <i style={{background: `rgba(${ACCENT_RGB}, ${0.25 + 0.75 * (b.count / max)})`}} />
              f/{b.stop} — {b.count}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

const SHUTTER_TICKS = [
  {v: 1 / 4000, label: '1/4000'},
  {v: 1 / 1000, label: '1/1000'},
  {v: 1 / 250, label: '1/250'},
  {v: 1 / 60, label: '1/60'},
  {v: 1 / 15, label: '1/15'},
  {v: 1 / 4, label: '1/4'},
  {v: 1, label: '1s'},
  {v: 4, label: '4s'}
];
const F_TICKS = [1.4, 2.8, 5.6, 11, 22];

/** Exposure map: shutter x aperture scatter, ISO as size, photos as colored
 * dots that open on click. Shooting modes cluster visibly. */
export function ExposureMap({withExif, onSelect}) {
  const photos = useMemo(
    () => withExif.filter((p) => p.exif.exposure && p.exif.fNumber),
    [withExif]
  );
  if (photos.length < 3) return null;

  const W = 720;
  const H = 300;
  const PAD = {left: 40, right: 16, top: 18, bottom: 30};
  const xDomain = [Math.log2(1 / 8000), Math.log2(8)];
  const yDomain = [Math.log2(1), Math.log2(32)];
  const x = (s) =>
    PAD.left +
    ((Math.min(Math.max(Math.log2(s), xDomain[0]), xDomain[1]) - xDomain[0]) /
      (xDomain[1] - xDomain[0])) *
      (W - PAD.left - PAD.right);
  // Wide apertures (small f) at the top.
  const y = (f) =>
    PAD.top +
    ((Math.min(Math.max(Math.log2(f), yDomain[0]), yDomain[1]) - yDomain[0]) /
      (yDomain[1] - yDomain[0])) *
      (H - PAD.top - PAD.bottom);

  return (
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Exposure map</span>
        <span className="chart-note">
          shutter × aperture, dot size = ISO — tripod work sinks right, low light rises left
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photos by shutter speed and aperture">
        {SHUTTER_TICKS.map((t) => (
          <g key={t.label}>
            <line x1={x(t.v)} x2={x(t.v)} y1={PAD.top} y2={H - PAD.bottom} stroke="#f0f0f4" />
            <text x={x(t.v)} y={H - 12} textAnchor="middle" className="axis-label">
              {t.label}
            </text>
          </g>
        ))}
        {F_TICKS.map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(f)} y2={y(f)} stroke="#f0f0f4" />
            <text x={PAD.left - 6} y={y(f) + 3} textAnchor="end" className="axis-label">
              f/{f}
            </text>
          </g>
        ))}
        <text x={PAD.left + 4} y={PAD.top + 10} className="ghost-label">
          fast &amp; wide
        </text>
        <text x={W - PAD.right - 4} y={H - PAD.bottom - 6} textAnchor="end" className="ghost-label">
          long &amp; stopped down
        </text>
        {photos.map((p) => (
          <circle
            key={p.name}
            cx={x(p.exif.exposure)}
            cy={y(p.exif.fNumber)}
            r={3 + 4 * Math.sqrt(Math.min(p.exif.iso ?? 100, 12800) / 12800)}
            fill={rgbCss(p.color)}
            stroke="#fff"
            strokeWidth="1"
            fillOpacity="0.9"
            style={{cursor: 'pointer'}}
            onClick={() => onSelect(p)}
          >
            <title>{`${p.name} — ${p.exif.exposure < 1 ? `1/${Math.round(1 / p.exif.exposure)}` : `${p.exif.exposure}s`} · f/${p.exif.fNumber}${p.exif.iso ? ` · ISO ${p.exif.iso}` : ''}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

/** Horizontal bands per camera body over time; photo ticks in their own
 * colors. Bands filter. */
export function GearTimeline({withExif, filter, onFilter}) {
  const rows = useMemo(() => {
    const byCamera = new Map();
    for (const p of withExif) {
      if (!p.exif.camera || !p.exif.takenAt) continue;
      if (!byCamera.has(p.exif.camera)) byCamera.set(p.exif.camera, []);
      byCamera.get(p.exif.camera).push(p);
    }
    return [...byCamera.entries()]
      .map(([camera, photos]) => ({
        camera,
        photos,
        first: Math.min(...photos.map((p) => p.exif.takenAt)),
        last: Math.max(...photos.map((p) => p.exif.takenAt))
      }))
      .sort((a, b) => a.first - b.first);
  }, [withExif]);
  if (!rows.length) return null;

  const W = 720;
  const ROW_H = 34;
  const LEFT = 8;
  const TOP = 6;
  const H = TOP + rows.length * ROW_H + 26;
  const t0 = Math.min(...rows.map((r) => r.first));
  const t1 = Math.max(...rows.map((r) => r.last));
  const span = Math.max(t1 - t0, 1);
  const x = (t) => LEFT + ((t - t0) / span) * (W - 2 * LEFT);

  const years = [];
  for (let y = new Date(t0).getFullYear(); y <= new Date(t1).getFullYear(); y++) {
    years.push(y);
  }

  return (
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Gear timeline</span>
        <span className="chart-note">
          when each camera was in your hands; ticks are photos — click a band to filter
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Camera bodies over time">
        {years.map((yr) => {
          const t = new Date(yr, 0, 1).getTime();
          if (t < t0 || t > t1) return null;
          return (
            <g key={yr}>
              <line x1={x(t)} x2={x(t)} y1={TOP} y2={H - 22} stroke="#f0f0f4" />
              <text x={x(t)} y={H - 8} textAnchor="middle" className="axis-label">
                {yr}
              </text>
            </g>
          );
        })}
        {rows.map((row, i) => {
          const yTop = TOP + i * ROW_H + 4;
          const bandH = 16;
          const x0 = x(row.first);
          const x1 = Math.max(x(row.last), x0 + 12);
          const selected = filter?.key === `camera:${row.camera}`;
          return (
            <g
              key={row.camera}
              style={{cursor: 'pointer'}}
              onClick={() =>
                onFilter({
                  key: `camera:${row.camera}`,
                  label: `shot on the ${row.camera}`,
                  test: (p) => p.exif?.camera === row.camera
                })
              }
            >
              <rect
                x={x0}
                y={yTop}
                width={x1 - x0}
                height={bandH}
                rx={8}
                fill="#eef0f8"
                stroke={selected ? '#222' : '#dcdfee'}
                strokeWidth={selected ? 1.5 : 1}
              />
              {row.photos.map((p) => (
                <line
                  key={p.name}
                  x1={x(p.exif.takenAt)}
                  x2={x(p.exif.takenAt)}
                  y1={yTop + 2}
                  y2={yTop + bandH - 2}
                  stroke={rgbCss(p.color)}
                  strokeWidth="2"
                />
              ))}
              <text x={x0} y={yTop + bandH + 11} className="axis-label strong">
                {row.camera} · {row.photos.length}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
