import {useMemo, useState} from 'react';
import {imageUrl} from '../config.js';
import {DayClock, MonthStrip, SeasonHeatmap, ActivityCalendar} from './stats/TimeCharts.jsx';
import {LensAxis, ApertureIris, ExposureMap, GearTimeline, FovFan} from './stats/GearCharts.jsx';
import {HueWheel, MoodMap} from './stats/ColorCharts.jsx';

function StatTile({value, label}) {
  return (
    <div className="stat-tile">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

/** Thumbnails of the photos matching the active chart filter. */
function MatchGrid({matches, label, onClear, onSelect}) {
  return (
    <div className="match-panel">
      <div className="match-head">
        <span>
          <strong>{matches.length}</strong> photo{matches.length === 1 ? '' : 's'} {label}
        </span>
        <button onClick={onClear}>clear filter ×</button>
      </div>
      {matches.length > 0 && (
        <div className="match-grid">
          {matches.map((p) => (
            <button key={p.name} className="folder-photo" title={p.name} onClick={() => onSelect(p)}>
              <img src={imageUrl(p.name, {thumb: true, v: p.v})} alt={p.name} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Stats({images, onSelect}) {
  const [filter, setFilter] = useState(null);
  const toggleFilter = (next) =>
    setFilter((current) => (current?.key === next.key ? null : next));

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
    const days = new Set(dated.map((i) => new Date(i.exif.takenAt).toDateString()));
    return {withExif, dated, golden, topCamera, medianFocal, shootingDays: days.size};
  }, [images]);

  const matches = useMemo(
    () => (filter ? images.filter(filter.test) : null),
    [images, filter]
  );

  const hasExif = stats.withExif.length > 0;
  const hasDates = stats.dated.length > 0;

  return (
    <div className="view-pad stats">
      <p className="view-caption">
        {hasExif
          ? `Shooting habits, read from the EXIF of ${stats.withExif.length} of ${images.length} published photos. Click chart elements to see which photos they contain.`
          : 'Color analysis of the gallery. Camera settings and capture times will appear here once EXIF is extracted (upload or re-analyze in the admin).'}
      </p>

      {hasExif && (
        <div className="stat-tiles">
          <StatTile value={stats.withExif.length} label="photos with data" />
          {hasDates && <StatTile value={stats.shootingDays} label="days out shooting" />}
          {hasDates && (
            <StatTile
              value={`${Math.round((stats.golden / stats.dated.length) * 100)}%`}
              label="shot in golden hour"
            />
          )}
          {stats.medianFocal && (
            <StatTile value={`${stats.medianFocal}mm`} label="median focal length" />
          )}
          {stats.topCamera && <StatTile value={stats.topCamera} label="most-used camera" />}
        </div>
      )}

      {filter && matches && (
        <MatchGrid
          matches={matches}
          label={filter.label}
          onClear={() => setFilter(null)}
          onSelect={onSelect}
        />
      )}

      {hasDates && (
        <>
          <h2 className="stats-section">Time</h2>
          <div className="chart-grid">
            <DayClock dated={stats.dated} filter={filter} onFilter={toggleFilter} />
            <MonthStrip dated={stats.dated} filter={filter} onFilter={toggleFilter} />
          </div>
          <ActivityCalendar dated={stats.dated} filter={filter} onFilter={toggleFilter} />
          <SeasonHeatmap dated={stats.dated} filter={filter} onFilter={toggleFilter} />
        </>
      )}

      {hasExif && (
        <>
          <h2 className="stats-section">Gear &amp; exposure</h2>
          <div className="chart-grid">
            <ApertureIris withExif={stats.withExif} filter={filter} onFilter={toggleFilter} />
          </div>
          <GearTimeline withExif={stats.withExif} filter={filter} onFilter={toggleFilter} />
          <FovFan withExif={stats.withExif} filter={filter} onFilter={toggleFilter} />
          <LensAxis withExif={stats.withExif} onSelect={onSelect} />
          <ExposureMap withExif={stats.withExif} onSelect={onSelect} />
        </>
      )}

      <h2 className="stats-section">Color</h2>
      <div className="chart-grid">
        <HueWheel images={images} filter={filter} onFilter={toggleFilter} />
        <MoodMap images={images} onSelect={onSelect} />
      </div>
    </div>
  );
}
