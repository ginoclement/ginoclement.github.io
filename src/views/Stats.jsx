import {useMemo, useState} from 'react';
import {rgbCss} from '../lib/color.js';

// Accent validated for the light surface; sequential use varies only opacity.
const ACCENT = '#4257A8';
const ACCENT_RGB = [66, 87, 168];

function averageColor(photos) {
  if (!photos.length) return null;
  const sum = [0, 0, 0];
  for (const p of photos) {
    sum[0] += p.color[0];
    sum[1] += p.color[1];
    sum[2] += p.color[2];
  }
  return sum.map((v) => Math.round(v / photos.length));
}

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/** 24-hour radial clock; spoke length = count, spoke color = the average
 * dominant color of photos taken that hour. */
function DayClock({dated}) {
  const [hover, setHover] = useState(null);
  const bins = useMemo(() => {
    const groups = Array.from({length: 24}, () => []);
    for (const p of dated) groups[new Date(p.exif.takenAt).getHours()].push(p);
    return groups.map((g, hour) => ({hour, count: g.length, color: averageColor(g)}));
  }, [dated]);

  const SIZE = 360;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R0 = 46;
  const R1 = 150;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const gap = 0.012; // radians — the 2px spacer, angularly

  const wedge = (hour, rOuter) => {
    const a0 = ((hour / 24) * 2 - 0.5) * Math.PI + gap;
    const a1 = (((hour + 1) / 24) * 2 - 0.5) * Math.PI - gap;
    const [x0, y0] = polar(cx, cy, R0, a0);
    const [x1, y1] = polar(cx, cy, rOuter, a0);
    const [x2, y2] = polar(cx, cy, rOuter, a1);
    const [x3, y3] = polar(cx, cy, R0, a1);
    return `M${x0},${y0} L${x1},${y1} A${rOuter},${rOuter} 0 0 1 ${x2},${y2} L${x3},${y3} A${R0},${R0} 0 0 0 ${x0},${y0} Z`;
  };

  const goldenBand = (h0, h1) => {
    const a0 = ((h0 / 24) * 2 - 0.5) * Math.PI;
    const a1 = ((h1 / 24) * 2 - 0.5) * Math.PI;
    const [x0, y0] = polar(cx, cy, R0, a0);
    const [x1, y1] = polar(cx, cy, R1 + 6, a0);
    const [x2, y2] = polar(cx, cy, R1 + 6, a1);
    const [x3, y3] = polar(cx, cy, R0, a1);
    return `M${x0},${y0} L${x1},${y1} A${R1 + 6},${R1 + 6} 0 0 1 ${x2},${y2} L${x3},${y3} A${R0},${R0} 0 0 0 ${x0},${y0} Z`;
  };

  const hovered = hover !== null ? bins[hover] : null;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Day clock</span>
        <span className="chart-note">
          when the shutter fires, tinted the average color of that hour's photos
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Photos by hour of day">
        <path d={goldenBand(6, 9)} fill="#f3ecdc" />
        <path d={goldenBand(17, 20)} fill="#f3ecdc" />
        <circle cx={cx} cy={cy} r={R0 - 4} fill="none" stroke="#ececf1" />
        {bins.map((b) =>
          b.count === 0 ? null : (
            <path
              key={b.hour}
              d={wedge(b.hour, R0 + (b.count / max) * (R1 - R0))}
              fill={b.color ? rgbCss(b.color) : ACCENT}
              stroke="#fff"
              strokeWidth="1"
              opacity={hover === null || hover === b.hour ? 1 : 0.35}
              onMouseEnter={() => setHover(b.hour)}
              onMouseLeave={() => setHover(null)}
            />
          )
        )}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = polar(cx, cy, R1 + 22, ((h / 24) * 2 - 0.5) * Math.PI);
          return (
            <text key={h} x={x} y={y + 3} textAnchor="middle" className="axis-label">
              {h}:00
            </text>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="clock-center">
          {hovered ? `${hovered.hour}:00` : dated.length}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="axis-label">
          {hovered
            ? `${hovered.count} photo${hovered.count === 1 ? '' : 's'}`
            : 'photos'}
        </text>
      </svg>
    </figure>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Twelve cells, each the mean dominant color of that month's photos. */
function MonthStrip({dated}) {
  const bins = useMemo(() => {
    const groups = Array.from({length: 12}, () => []);
    for (const p of dated) groups[new Date(p.exif.takenAt).getMonth()].push(p);
    return groups.map((g, m) => ({month: m, count: g.length, color: averageColor(g)}));
  }, [dated]);
  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">The color of your seasons</span>
        <span className="chart-note">mean dominant color per month</span>
      </figcaption>
      <div className="month-strip">
        {bins.map((b) => (
          <div key={b.month} className="month-cell" title={`${MONTHS[b.month]}: ${b.count} photos`}>
            <div
              className="month-swatch"
              style={b.color ? {background: rgbCss(b.color)} : {border: '1px dashed #ddd'}}
            />
            <span className="axis-text">{MONTHS[b.month]}</span>
            <span className="axis-text muted">{b.count || ''}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Month rows x hour columns heatmap: seasons meeting daylight. */
function SeasonHeatmap({dated}) {
  const [hover, setHover] = useState(null);
  const grid = useMemo(() => {
    const g = Array.from({length: 12}, () => new Array(24).fill(0));
    for (const p of dated) {
      const d = new Date(p.exif.takenAt);
      g[d.getMonth()][d.getHours()]++;
    }
    return g;
  }, [dated]);
  const max = Math.max(...grid.flat(), 1);

  const CELL = 20;
  const GAP = 2;
  const LEFT = 34;
  const TOP = 8;
  const W = LEFT + 24 * (CELL + GAP);
  const H = TOP + 12 * (CELL + GAP) + 22;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Seasons × daylight</span>
        <span className="chart-note">
          {hover
            ? `${MONTHS[hover[0]]}, ${hover[1]}:00 — ${grid[hover[0]][hover[1]]} photo${grid[hover[0]][hover[1]] === 1 ? '' : 's'}`
            : 'month by hour of day'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photos by month and hour">
        {grid.map((row, m) =>
          row.map((count, h) => (
            <rect
              key={`${m}-${h}`}
              x={LEFT + h * (CELL + GAP)}
              y={TOP + m * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={3}
              fill={count ? ACCENT : '#f2f2f6'}
              fillOpacity={count ? 0.15 + 0.85 * (count / max) : 1}
              stroke={hover && hover[0] === m && hover[1] === h ? '#222' : 'none'}
              onMouseEnter={() => setHover([m, h])}
              onMouseLeave={() => setHover(null)}
            />
          ))
        )}
        {grid.map((_, m) => (
          <text key={m} x={LEFT - 8} y={TOP + m * (CELL + GAP) + CELL / 2 + 3} textAnchor="end" className="axis-label">
            {MONTHS[m][0]}
          </text>
        ))}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={LEFT + h * (CELL + GAP) + CELL / 2}
            y={H - 6}
            textAnchor="middle"
            className="axis-label"
          >
            {h}:00
          </text>
        ))}
      </svg>
    </figure>
  );
}

const FOCAL_TICKS = [10, 16, 24, 35, 50, 85, 135, 200, 400, 600];

/** Log-scale focal length axis; each photo is a dot in its own color,
 * stacking into towers at favorite focal lengths. */
function LensAxis({withExif}) {
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
    const key = p.exif.focalLength;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(p);
  }
  const maxStack = Math.max(...[...stacks.values()].map((s) => s.length));
  const DOT = Math.min(9, Math.max(4, 150 / maxStack));
  const plotH = Math.min(190, maxStack * DOT + 10);
  const H = plotH + 40;
  const baseline = plotH + 8;

  const sortedFocals = [...stacks.keys()].sort((a, b) => a - b);
  const median = sortedFocals.length
    ? photos.map((p) => p.exif.focalLength).sort((a, b) => a - b)[Math.floor(photos.length / 2)]
    : null;

  return (
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Lens axis</span>
        <span className="chart-note">
          each dot is a photo in its own color, stacked at its focal length (log scale)
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
        {median && (
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
        )}
        {sortedFocals.map((mm) =>
          stacks.get(mm).map((p, i) => (
            <circle
              key={p.name}
              cx={x(mm)}
              cy={baseline - DOT / 2 - 1 - i * DOT}
              r={DOT / 2 - 0.5}
              fill={rgbCss(p.color)}
              stroke="#fff"
              strokeWidth="1"
            >
              <title>{`${p.name} — ${mm}mm`}</title>
            </circle>
          ))
        )}
      </svg>
    </figure>
  );
}

const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

/** Concentric rings sized like a real lens pupil per f-stop; ring weight and
 * intensity = how often that stop is used. */
function ApertureIris({withExif}) {
  const [hover, setHover] = useState(null);
  const bins = useMemo(() => {
    const counts = new Map();
    for (const p of withExif) {
      if (!p.exif.fNumber) continue;
      let best = STOPS[0];
      for (const s of STOPS) {
        if (Math.abs(s - p.exif.fNumber) < Math.abs(best - p.exif.fNumber)) best = s;
      }
      counts.set(best, (counts.get(best) ?? 0) + 1);
    }
    return STOPS.filter((s) => counts.has(s)).map((s) => ({stop: s, count: counts.get(s)}));
  }, [withExif]);
  if (!bins.length) return null;

  const SIZE = 260;
  const c = SIZE / 2;
  const max = Math.max(...bins.map((b) => b.count));
  const radius = (stop) => 112 / stop + 4;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Aperture iris</span>
        <span className="chart-note">rings sized like the pupil at each f-stop</span>
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
                hover === null || hover === b.stop ? 0.25 + 0.75 * (b.count / max) : 0.12
              }
              onMouseEnter={() => setHover(b.stop)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          <circle cx={c} cy={c} r={2.5} fill="#999" />
        </svg>
        <ul className="iris-legend">
          {bins.map((b) => (
            <li
              key={b.stop}
              className={hover === b.stop ? 'strong' : ''}
              onMouseEnter={() => setHover(b.stop)}
              onMouseLeave={() => setHover(null)}
            >
              <i
                style={{
                  background: `rgba(${ACCENT_RGB}, ${0.25 + 0.75 * (b.count / max)})`
                }}
              />
              f/{b.stop} — {b.count}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function StatTile({value, label}) {
  return (
    <div className="stat-tile">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

export default function Stats({images}) {
  const stats = useMemo(() => {
    const withExif = images.filter((i) => i.exif);
    const dated = withExif.filter((i) => i.exif.takenAt);
    let golden = 0;
    for (const i of dated) {
      const h = new Date(i.exif.takenAt).getHours();
      if ((h >= 6 && h < 9) || (h >= 17 && h < 20)) golden++;
    }
    const cameras = new Map();
    for (const i of withExif) {
      if (i.exif.camera) cameras.set(i.exif.camera, (cameras.get(i.exif.camera) ?? 0) + 1);
    }
    const topCamera = [...cameras.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const focals = withExif.map((i) => i.exif.focalLength).filter(Boolean).sort((a, b) => a - b);
    const medianFocal = focals.length ? focals[Math.floor(focals.length / 2)] : null;
    return {withExif, dated, golden, topCamera, medianFocal};
  }, [images]);

  if (!stats.withExif.length) {
    return (
      <div className="view-pad">
        <p className="view-caption">
          No shooting data yet. Camera settings and capture times come from
          EXIF, which is extracted when photos are uploaded or re-analyzed in
          the admin.
        </p>
      </div>
    );
  }

  return (
    <div className="view-pad stats">
      <p className="view-caption">
        Shooting habits, read from the EXIF of {stats.withExif.length} of{' '}
        {images.length} published photos.
      </p>
      <div className="stat-tiles">
        <StatTile value={stats.withExif.length} label="photos with data" />
        {stats.dated.length > 0 && (
          <StatTile
            value={`${Math.round((stats.golden / stats.dated.length) * 100)}%`}
            label="shot in golden hour"
          />
        )}
        {stats.medianFocal && <StatTile value={`${stats.medianFocal}mm`} label="median focal length" />}
        {stats.topCamera && <StatTile value={stats.topCamera} label="most-used camera" />}
      </div>
      <div className="chart-grid">
        {stats.dated.length > 0 && <DayClock dated={stats.dated} />}
        {stats.dated.length > 0 && <MonthStrip dated={stats.dated} />}
        <ApertureIris withExif={stats.withExif} />
      </div>
      {stats.dated.length > 0 && <SeasonHeatmap dated={stats.dated} />}
      <LensAxis withExif={stats.withExif} />
    </div>
  );
}
