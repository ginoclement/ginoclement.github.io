// Returns [hue 0-360, saturation 0-100, lightness 0-100].
export function rgbToHsl([r, g, b]) {
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

export function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function colorDistSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Distance between two photos' palettes: share-weighted nearest-cluster
 * distance, symmetrized. Falls back to dominant-color distance when a
 * palette is missing.
 */
export function paletteDistance(a, b) {
  const pa = a.palette ?? [{color: a.color, share: 1}];
  const pb = b.palette ?? [{color: b.color, share: 1}];
  const oneWay = (from, to) =>
    from.reduce(
      (sum, ca) =>
        sum + ca.share * Math.sqrt(Math.min(...to.map((cb) => colorDistSq(ca.color, cb.color)))),
      0
    );
  return (oneWay(pa, pb) + oneWay(pb, pa)) / 2;
}

/** Sort key that groups by hue but sinks near-grays and orders by lightness within a hue. */
export function hueSortKey(color) {
  const [h, s, l] = rgbToHsl(color);
  if (s < 12) return 400 + l; // grays after the hue wheel, light to dark
  return h + (100 - l) / 500;
}
