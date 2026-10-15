import {useEffect, useMemo, useRef} from 'react';

/**
 * A Platonic solid whose faces are the projects: 4 → tetrahedron,
 * 6 → cube, 8 → octahedron, 12 → dodecahedron, 20 → icosahedron (the
 * smallest solid that fits; spare faces become ornaments). Pure CSS 3D —
 * each face is a clipped <a> positioned with a matrix3d computed from the
 * solid's geometry. Auto-rotates; drag to spin; click a face to visit.
 */

const PHI = (1 + Math.sqrt(5)) / 2;

function signs(values) {
  // All sign combinations of the non-zero entries.
  const out = [[]];
  for (const v of values) {
    const next = [];
    for (const row of out) {
      if (v === 0) next.push([...row, 0]);
      else {
        next.push([...row, v]);
        next.push([...row, -v]);
      }
    }
    out.length = 0;
    out.push(...next);
  }
  return out;
}

function cyclic(triple) {
  const [a, b, c] = triple;
  return [
    [a, b, c],
    [c, a, b],
    [b, c, a]
  ];
}

const SOLIDS = {
  4: {
    name: 'tetrahedron',
    verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    dirs: [[-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]],
    pick: 3
  },
  6: {
    name: 'cube',
    verts: signs([1, 1, 1]),
    dirs: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    pick: 4
  },
  8: {
    name: 'octahedron',
    verts: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    dirs: signs([1, 1, 1]),
    pick: 3
  },
  12: {
    name: 'dodecahedron',
    verts: [...signs([1, 1, 1]), ...cyclic([0, 1 / PHI, PHI]).flatMap((t) => signs(t))],
    // Face normals are the dual icosahedron's vertex directions — note the
    // (0, PHI, 1) ordering, not (0, 1, PHI).
    dirs: cyclic([0, PHI, 1]).flatMap((t) => signs(t)),
    pick: 5
  },
  20: {
    name: 'icosahedron',
    verts: cyclic([0, 1, PHI]).flatMap((t) => signs(t)),
    dirs: [...signs([1, 1, 1]), ...cyclic([0, PHI, 1 / PHI]).flatMap((t) => signs(t))],
    pick: 3
  }
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Face geometry: outline (2D px), box size, and the CSS matrix3d. */
function buildFaces(solid, radiusPx) {
  const scale = radiusPx / Math.max(...solid.verts.map((v) => Math.hypot(...v)));
  const verts = solid.verts.map((v) => v.map((x) => x * scale));
  return solid.dirs.map((d) => {
    const dir = norm(d);
    const picked = verts
      .map((v) => ({v, score: dot(norm(v), dir)}))
      .sort((a, b) => b.score - a.score)
      .slice(0, solid.pick)
      .map((x) => x.v);
    const center = picked
      .reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0])
      .map((x) => x / picked.length);
    const n = norm(center);
    // Orient each face's text toward world-up (fallback: world-z for the
    // poles), so labels read naturally when the face swings to the front.
    const up = Math.abs(n[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const upProjected = norm(up.map((x, i) => x - dot(up, n) * n[i]));
    const t2 = upProjected; // CSS y-down maps to projected world-up flipped in-plane
    const t1 = cross(t2, n);
    // Project vertices into the face plane and order them by angle.
    const pts = picked
      .map((v) => {
        const r = sub(v, center);
        return [dot(r, t1), dot(r, t2)];
      })
      .sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const clip = pts
      .map((p) => `${(((p[0] - minX) / w) * 100).toFixed(2)}% ${(((p[1] - minY) / h) * 100).toFixed(2)}%`)
      .join(', ');
    const m = [
      t1[0], t1[1], t1[2], 0,
      t2[0], t2[1], t2[2], 0,
      n[0], n[1], n[2], 0,
      center[0], center[1], center[2], 1
    ];
    return {
      w,
      h,
      minX,
      minY,
      clip,
      matrix: `matrix3d(${m.map((x) => x.toFixed(4)).join(',')})`
    };
  });
}

function pickSolid(count) {
  for (const n of [4, 6, 8, 12, 20]) {
    if (count <= n) return SOLIDS[n];
  }
  return SOLIDS[20];
}

function accentHue(title) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export default function ProjectHedron({links}) {
  const solidRef = useRef(null);
  const dragRef = useRef({down: false, moved: 0, rx: -18, ry: 24, vx: 0.12, vy: 0.05, px: 0, py: 0});

  const solid = pickSolid(Math.max(links.length, 4));
  const faces = useMemo(() => buildFaces(solid, 128), [solid]);

  useEffect(() => {
    const el = solidRef.current;
    if (!el) return;
    const state = dragRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf;
    const tick = () => {
      if (!state.down) {
        state.ry += state.vx;
        state.rx += state.vy;
        // Ease any drag-flick back toward the idle drift.
        state.vx += (0.12 - state.vx) * 0.01;
        state.vy += (0.05 - state.vy) * 0.01;
      }
      el.style.transform = `rotateX(${state.rx}deg) rotateY(${state.ry}deg)`;
      raf = requestAnimationFrame(tick);
    };
    if (reduced) {
      el.style.transform = `rotateX(${state.rx}deg) rotateY(${state.ry}deg)`;
      return;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e) => {
    const state = dragRef.current;
    state.down = true;
    state.moved = 0;
    state.px = e.clientX;
    state.py = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const state = dragRef.current;
    if (!state.down) return;
    const dx = e.clientX - state.px;
    const dy = e.clientY - state.py;
    state.px = e.clientX;
    state.py = e.clientY;
    state.moved += Math.abs(dx) + Math.abs(dy);
    state.ry += dx * 0.45;
    state.rx -= dy * 0.45;
    state.vx = dx * 0.12;
    state.vy = -dy * 0.12;
  };
  const onPointerUp = () => {
    dragRef.current.down = false;
  };
  const onFaceClick = (e) => {
    // A drag that ended on a face is not a click.
    if (dragRef.current.moved > 8) e.preventDefault();
  };

  return (
    <div className="ph-wrap">
      <div
        className="ph-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ph-solid" ref={solidRef}>
          {faces.map((face, i) => {
            const link = links[i];
            const hue = link ? accentHue(link.title) : 230;
            return (
              <a
                key={i}
                className={`ph-face${link ? '' : ' blank'}`}
                href={link?.url}
                target="_blank"
                rel="noreferrer"
                draggable={false}
                onClick={link ? onFaceClick : (e) => e.preventDefault()}
                style={{
                  width: `${face.w}px`,
                  height: `${face.h}px`,
                  // Anchor the projected face center (local 0,0) at the solid's
                  // origin, and rotate/translate about that same point.
                  marginLeft: `${face.minX}px`,
                  marginTop: `${face.minY}px`,
                  transformOrigin: `${-face.minX}px ${-face.minY}px`,
                  clipPath: `polygon(${face.clip})`,
                  transform: face.matrix,
                  background: link
                    ? `linear-gradient(145deg, hsl(${hue}, 62%, 60%), hsl(${(hue + 40) % 360}, 58%, 42%))`
                    : 'linear-gradient(145deg, #2b2b36, #17171f)'
                }}
              >
                {link ? (
                  <span className="ph-label">
                    <strong>{link.title}</strong>
                    {link.tag && <em>{link.tag}</em>}
                  </span>
                ) : (
                  <span className="ph-label">✦</span>
                )}
              </a>
            );
          })}
        </div>
      </div>
      <p className="ph-caption">
        {links.length} project{links.length === 1 ? '' : 's'} · one per face ·{' '}
        {solid.name} — drag to spin, click a face to visit
      </p>
    </div>
  );
}
