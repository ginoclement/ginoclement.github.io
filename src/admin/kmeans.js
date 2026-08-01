/**
 * Browser port of generate/process.py: K-Means over the pixels of a
 * downscaled copy of the image, dominant color = largest cluster.
 */

/**
 * @param {Blob|string} source image blob/file, or a URL to fetch
 * @returns {{color: number[], palette: {color: number[], share: number}[],
 *            width: number, height: number}}
 */
export async function computePalette(source, {clusters = 7, maxDim = 120} = {}) {
  const blob = typeof source === 'string'
    ? await (await fetch(source)).blob()
    : source;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const {data} = ctx.getImageData(0, 0, w, h);

  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  const {centroids, counts} = kmeans(pixels, Math.min(clusters, pixels.length));
  const total = counts.reduce((a, b) => a + b, 0);
  const palette = centroids
    .map((c, i) => ({
      color: c.map((v) => Math.round(v)),
      share: counts[i] / total
    }))
    .sort((a, b) => b.share - a.share);

  return {
    color: palette[0].color,
    palette,
    features: colorHistogram(pixels),
    width: bitmap.width,
    height: bitmap.height
  };
}

/**
 * 4x4x4 RGB histogram (64 dims), normalized and quantized to 0-255.
 * Used as a similarity feature vector for the PCA layout on the site.
 */
function colorHistogram(pixels) {
  const bins = new Array(64).fill(0);
  for (const [r, g, b] of pixels) {
    const idx = (Math.min(3, r >> 6) << 4) | (Math.min(3, g >> 6) << 2) | Math.min(3, b >> 6);
    bins[idx]++;
  }
  const max = Math.max(...bins, 1);
  return bins.map((v) => Math.round((v / max) * 255));
}

function distSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function kmeans(points, k, iterations = 12) {
  // k-means++ style seeding: spread initial centroids apart.
  const centroids = [points[Math.floor(Math.random() * points.length)].slice()];
  while (centroids.length < k) {
    let best = null;
    let bestDist = -1;
    // Sample candidates rather than scanning every point for speed.
    for (let s = 0; s < 200; s++) {
      const p = points[Math.floor(Math.random() * points.length)];
      const d = Math.min(...centroids.map((c) => distSq(p, c)));
      if (d > bestDist) {
        bestDist = d;
        best = p;
      }
    }
    centroids.push(best.slice());
  }

  const assignment = new Array(points.length).fill(0);
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distSq(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assignment[i] !== bestC) {
        assignment[i] = bestC;
        changed = true;
      }
    }
    const sums = Array.from({length: k}, () => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignment[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = sums[c].map((v) => v / counts[c]);
      }
    }
    if (!changed) break;
  }
  return {centroids, counts};
}
