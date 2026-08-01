export const ACCENT = '#4257A8';
export const ACCENT_RGB = [66, 87, 168];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];

export function averageColor(photos) {
  if (!photos.length) return null;
  const sum = [0, 0, 0];
  for (const p of photos) {
    sum[0] += p.color[0];
    sum[1] += p.color[1];
    sum[2] += p.color[2];
  }
  return sum.map((v) => Math.round(v / photos.length));
}

export function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function nearestStop(fNumber) {
  let best = STOPS[0];
  for (const s of STOPS) {
    if (Math.abs(s - fNumber) < Math.abs(best - fNumber)) best = s;
  }
  return best;
}

export function dayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
