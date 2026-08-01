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

/**
 * sRGB -> OKLab. Distances in OKLab track human perception far better than
 * raw RGB (which overweights lightness differences).
 */
export function rgbToOklab([r8, g8, b8]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

function labDistSq(a, b) {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

// Cached per-photo palette in OKLab, keyed by the photo object.
const labCache = new WeakMap();
function labPalette(img) {
  let cached = labCache.get(img);
  if (!cached) {
    const palette = img.palette ?? [{color: img.color, share: 1}];
    cached = palette.map((p) => ({lab: rgbToOklab(p.color), share: p.share}));
    labCache.set(img, cached);
  }
  return cached;
}

/**
 * Perceptual distance between two photos' palettes: share-weighted
 * nearest-cluster OKLab distance, symmetrized.
 */
export function paletteDistance(a, b) {
  const pa = labPalette(a);
  const pb = labPalette(b);
  const oneWay = (from, to) =>
    from.reduce(
      (sum, ca) =>
        sum + ca.share * Math.sqrt(Math.min(...to.map((cb) => labDistSq(ca.lab, cb.lab)))),
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
