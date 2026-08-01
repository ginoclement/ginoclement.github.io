import {useMemo, useState} from 'react';

// Chart color validated for the light surface (dataviz six-checks).
const BAR_COLOR = '#4257A8';

/**
 * Single-series histogram: thin bars, 4px rounded tops anchored to the
 * baseline, 2px gaps, recessive grid, hover tooltip. Text wears ink, not
 * the series color.
 */
function Histogram({title, bins, note}) {
  const [hover, setHover] = useState(null);
  const W = 560;
  const H = 200;
  const PAD = {top: 26, right: 8, bottom: 26, left: 8};
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const step = plotW / bins.length;
  const barW = Math.max(2, step - 2);
  const radius = Math.min(4, barW / 2);

  const labelEvery = Math.ceil(bins.length / 12);

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        {note && <span className="chart-note">{note}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * (1 - f)}
            y2={PAD.top + plotH * (1 - f)}
            stroke="#ececf1"
          />
        ))}
        <text x={PAD.left} y={PAD.top - 8} className="axis-label">
          {max}
        </text>
        {bins.map((bin, i) => {
          const h = (bin.count / max) * plotH;
          const x = PAD.left + i * step + (step - barW) / 2;
          const y = PAD.top + plotH - h;
          const r = Math.min(radius, h);
          const path = h
            ? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`
            : null;
          return (
            <g
              key={bin.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={PAD.left + i * step}
                y={PAD.top}
                width={step}
                height={plotH}
                fill="transparent"
              />
              {path && <path d={path} fill={BAR_COLOR} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {hover === i && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="value-label">
                  {bin.count}
                </text>
              )}
              {(i % labelEvery === 0 || hover === i) && (
                <text
                  x={PAD.left + i * step + step / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={`axis-label${hover === i ? ' strong' : ''}`}
                >
                  {bin.label}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="#d8d8e0"
        />
      </svg>
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

const HOURS = Array.from({length: 24}, (_, h) => h);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FOCAL_BUCKETS = [
  {label: '≤16', max: 16},
  {label: '17–24', max: 24},
  {label: '25–35', max: 35},
  {label: '36–50', max: 50},
  {label: '51–85', max: 85},
  {label: '86–135', max: 135},
  {label: '136–200', max: 200},
  {label: '200+', max: Infinity}
];
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

export default function Stats({images}) {
  const stats = useMemo(() => {
    const withExif = images.filter((i) => i.exif);
    const dated = withExif.filter((i) => i.exif.takenAt);

    const hourBins = HOURS.map((h) => ({label: `${h}`, count: 0}));
    const monthBins = MONTHS.map((m) => ({label: m, count: 0}));
    let golden = 0;
    for (const i of dated) {
      const d = new Date(i.exif.takenAt);
      hourBins[d.getHours()].count++;
      monthBins[d.getMonth()].count++;
      if ((d.getHours() >= 6 && d.getHours() < 9) || (d.getHours() >= 17 && d.getHours() < 20)) {
        golden++;
      }
    }

    const focalBins = FOCAL_BUCKETS.map((b) => ({label: b.label, count: 0}));
    const focals = [];
    for (const i of withExif) {
      if (!i.exif.focalLength) continue;
      focals.push(i.exif.focalLength);
      focalBins[FOCAL_BUCKETS.findIndex((b) => i.exif.focalLength <= b.max)].count++;
    }

    const apertureBins = STOPS.map((s) => ({label: `f/${s}`, count: 0}));
    for (const i of withExif) {
      if (!i.exif.fNumber) continue;
      let best = 0;
      STOPS.forEach((s, idx) => {
        if (Math.abs(s - i.exif.fNumber) < Math.abs(STOPS[best] - i.exif.fNumber)) best = idx;
      });
      apertureBins[best].count++;
    }

    const cameras = new Map();
    for (const i of withExif) {
      if (i.exif.camera) cameras.set(i.exif.camera, (cameras.get(i.exif.camera) ?? 0) + 1);
    }
    const topCamera = [...cameras.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    focals.sort((a, b) => a - b);
    const medianFocal = focals.length ? focals[Math.floor(focals.length / 2)] : null;

    return {withExif, dated, hourBins, monthBins, focalBins, apertureBins, golden, topCamera, medianFocal};
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
        {stats.dated.length > 0 && (
          <Histogram title="Hour of day" bins={stats.hourBins} note="when the shutter fires" />
        )}
        {stats.dated.length > 0 && (
          <Histogram title="Month of year" bins={stats.monthBins} note="seasons of shooting" />
        )}
        {stats.focalBins.some((b) => b.count) && (
          <Histogram title="Focal length (mm)" bins={stats.focalBins} note="wide vs. long" />
        )}
        {stats.apertureBins.some((b) => b.count) && (
          <Histogram title="Aperture" bins={stats.apertureBins} note="nearest full stop" />
        )}
      </div>
    </div>
  );
}
