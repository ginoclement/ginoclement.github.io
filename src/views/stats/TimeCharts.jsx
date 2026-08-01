import {useMemo, useState} from 'react';
import {rgbCss} from '../../lib/color.js';
import {ACCENT, MONTHS, averageColor, polar, dayKey} from './helpers.js';

/** 24-hour radial clock; spoke length = count, spoke color = the average
 * dominant color of photos taken that hour. Spokes filter on click. */
export function DayClock({dated, filter, onFilter}) {
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
  const gap = 0.012;

  const wedge = (hour, rOuter, rInner = R0) => {
    const a0 = ((hour / 24) * 2 - 0.5) * Math.PI + gap;
    const a1 = (((hour + 1) / 24) * 2 - 0.5) * Math.PI - gap;
    const [x0, y0] = polar(cx, cy, rInner, a0);
    const [x1, y1] = polar(cx, cy, rOuter, a0);
    const [x2, y2] = polar(cx, cy, rOuter, a1);
    const [x3, y3] = polar(cx, cy, rInner, a1);
    return `M${x0},${y0} L${x1},${y1} A${rOuter},${rOuter} 0 0 1 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 0 0 ${x0},${y0} Z`;
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

  const hourFiltered = filter?.key.startsWith('hour:');
  const hovered = hover !== null ? bins[hover] : null;

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Day clock</span>
        <span className="chart-note">
          tinted the average color of each hour's photos — click a spoke to filter
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Photos by hour of day">
        <path d={goldenBand(6, 9)} fill="#f3ecdc" />
        <path d={goldenBand(17, 20)} fill="#f3ecdc" />
        <circle cx={cx} cy={cy} r={R0 - 4} fill="none" stroke="#ececf1" />
        {bins.map((b) => {
          if (b.count === 0) return null;
          const selected = filter?.key === `hour:${b.hour}`;
          return (
            <path
              key={b.hour}
              d={wedge(b.hour, R0 + (b.count / max) * (R1 - R0))}
              fill={b.color ? rgbCss(b.color) : ACCENT}
              stroke={selected ? '#222' : '#fff'}
              strokeWidth={selected ? 2 : 1}
              opacity={
                (hourFiltered && !selected) || (hover !== null && hover !== b.hour) ? 0.3 : 1
              }
              style={{cursor: 'pointer'}}
              onMouseEnter={() => setHover(b.hour)}
              onMouseLeave={() => setHover(null)}
              onClick={() =>
                onFilter({
                  key: `hour:${b.hour}`,
                  label: `shot between ${b.hour}:00 and ${b.hour + 1}:00`,
                  test: (p) =>
                    p.exif?.takenAt && new Date(p.exif.takenAt).getHours() === b.hour
                })
              }
            />
          );
        })}
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
          {hovered ? `${hovered.count} photo${hovered.count === 1 ? '' : 's'}` : 'photos'}
        </text>
      </svg>
    </figure>
  );
}

/** Twelve cells, each the mean dominant color of that month's photos. */
export function MonthStrip({dated, filter, onFilter}) {
  const bins = useMemo(() => {
    const groups = Array.from({length: 12}, () => []);
    for (const p of dated) groups[new Date(p.exif.takenAt).getMonth()].push(p);
    return groups.map((g, m) => ({month: m, count: g.length, color: averageColor(g)}));
  }, [dated]);
  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">The color of your seasons</span>
        <span className="chart-note">mean dominant color per month — click to filter</span>
      </figcaption>
      <div className="month-strip">
        {bins.map((b) => {
          const selected = filter?.key === `month:${b.month}`;
          return (
            <button
              key={b.month}
              className={`month-cell${selected ? ' selected' : ''}`}
              title={`${MONTHS[b.month]}: ${b.count} photos`}
              disabled={!b.count}
              onClick={() =>
                onFilter({
                  key: `month:${b.month}`,
                  label: `shot in ${MONTHS[b.month]}`,
                  test: (p) =>
                    p.exif?.takenAt && new Date(p.exif.takenAt).getMonth() === b.month
                })
              }
            >
              <div
                className="month-swatch"
                style={b.color ? {background: rgbCss(b.color)} : {border: '1px dashed #ddd'}}
              />
              <span className="axis-text">{MONTHS[b.month]}</span>
              <span className="axis-text muted">{b.count || ''}</span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}

/** Month rows x hour columns heatmap: seasons meeting daylight. */
export function SeasonHeatmap({dated, filter, onFilter}) {
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
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Seasons × daylight</span>
        <span className="chart-note">
          {hover
            ? `${MONTHS[hover[0]]}, ${hover[1]}:00 — ${grid[hover[0]][hover[1]]} photo${grid[hover[0]][hover[1]] === 1 ? '' : 's'}`
            : 'month by hour of day — click a cell to filter'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photos by month and hour">
        {grid.map((row, m) =>
          row.map((count, h) => {
            const selected = filter?.key === `cell:${m}:${h}`;
            return (
              <rect
                key={`${m}-${h}`}
                x={LEFT + h * (CELL + GAP)}
                y={TOP + m * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                fill={count ? ACCENT : '#f2f2f6'}
                fillOpacity={count ? 0.15 + 0.85 * (count / max) : 1}
                stroke={selected || (hover && hover[0] === m && hover[1] === h) ? '#222' : 'none'}
                style={count ? {cursor: 'pointer'} : undefined}
                onMouseEnter={() => setHover([m, h])}
                onMouseLeave={() => setHover(null)}
                onClick={() =>
                  count &&
                  onFilter({
                    key: `cell:${m}:${h}`,
                    label: `shot in ${MONTHS[m]} around ${h}:00`,
                    test: (p) => {
                      if (!p.exif?.takenAt) return false;
                      const d = new Date(p.exif.takenAt);
                      return d.getMonth() === m && d.getHours() === h;
                    }
                  })
                }
              />
            );
          })
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

/** Contribution-style calendar: a cell per day, filled with that day's
 * average photo color. */
export function ActivityCalendar({dated, filter, onFilter}) {
  const years = useMemo(() => {
    const byDay = new Map();
    for (const p of dated) {
      const key = dayKey(p.exif.takenAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(p);
    }
    const byYear = new Map();
    for (const [key, photos] of byDay) {
      const year = Number(key.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push({key, photos});
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [dated]);

  const CELL = 11;
  const GAP = 2;
  const LEFT = 8;
  const TOP = 18;
  const W = LEFT + 53 * (CELL + GAP) + 8;
  const H = TOP + 7 * (CELL + GAP) + 6;

  return (
    <figure className="chart chart-wide">
      <figcaption>
        <span className="chart-title">Shooting calendar</span>
        <span className="chart-note">
          a cell per day, in that day's average photo color — click a day to filter
        </span>
      </figcaption>
      {years.map(([year, days]) => {
        const jan1 = new Date(year, 0, 1);
        const startDow = jan1.getDay();
        return (
          <div key={year} className="calendar-year">
            <span className="axis-text">{year}</span>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Shooting days in ${year}`}>
              {MONTHS.map((m, i) => {
                const first = new Date(year, i, 1);
                const week = Math.floor((first - jan1) / 86400000 + startDow) / 7;
                return (
                  <text
                    key={m}
                    x={LEFT + Math.floor(week) * (CELL + GAP)}
                    y={TOP - 6}
                    className="axis-label"
                  >
                    {m[0]}
                  </text>
                );
              })}
              {days.map(({key, photos}) => {
                const date = new Date(`${key}T12:00:00`);
                const dayIndex = Math.floor((date - jan1) / 86400000);
                const week = Math.floor((dayIndex + startDow) / 7);
                const dow = date.getDay();
                const selected = filter?.key === `day:${key}`;
                const color = averageColor(photos);
                return (
                  <rect
                    key={key}
                    x={LEFT + week * (CELL + GAP)}
                    y={TOP + dow * (CELL + GAP)}
                    width={CELL}
                    height={CELL}
                    rx={2.5}
                    fill={rgbCss(color)}
                    stroke={selected ? '#222' : 'none'}
                    strokeWidth={selected ? 1.5 : 0}
                    style={{cursor: 'pointer'}}
                    onClick={() =>
                      onFilter({
                        key: `day:${key}`,
                        label: `shot on ${date.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}`,
                        test: (p) => p.exif?.takenAt && dayKey(p.exif.takenAt) === key
                      })
                    }
                  >
                    <title>{`${key}: ${photos.length} photo${photos.length === 1 ? '' : 's'}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
        );
      })}
    </figure>
  );
}
