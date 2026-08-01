/**
 * Projects feature vectors onto their top-3 principal components,
 * scaled to roughly fill a [-R, R] cube. Small data (hundreds of
 * photos x 64 dims), so a direct covariance + power iteration is fine.
 */
export function pcaProject(vectors, radius = 400) {
  const n = vectors.length;
  if (n < 3) return vectors.map(() => [0, 0, 0]);
  const d = vectors[0].length;

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  const centered = vectors.map((v) => v.map((x, j) => x - mean[j]));

  const cov = Array.from({length: d}, () => new Array(d).fill(0));
  for (const v of centered) {
    for (let i = 0; i < d; i++) {
      if (v[i] === 0) continue;
      for (let j = i; j < d; j++) cov[i][j] += (v[i] * v[j]) / n;
    }
  }
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) cov[i][j] = cov[j][i];

  const components = [];
  const work = cov.map((row) => row.slice());
  for (let c = 0; c < 3; c++) {
    // Deterministic start vector so layouts are stable between loads.
    let vec = new Array(d).fill(0).map((_, i) => Math.sin(i + c * 7) + 1e-3);
    let eigenvalue = 0;
    for (let iter = 0; iter < 60; iter++) {
      const next = new Array(d).fill(0);
      for (let i = 0; i < d; i++) {
        let sum = 0;
        for (let j = 0; j < d; j++) sum += work[i][j] * vec[j];
        next[i] = sum;
      }
      const norm = Math.hypot(...next) || 1;
      vec = next.map((x) => x / norm);
      eigenvalue = norm;
    }
    components.push(vec);
    // Deflate.
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        work[i][j] -= eigenvalue * vec[i] * vec[j];
      }
    }
  }

  const projected = centered.map((v) =>
    components.map((comp) => comp.reduce((sum, x, j) => sum + x * v[j], 0))
  );
  // Scale each axis independently to fill the cube.
  for (let axis = 0; axis < 3; axis++) {
    const extent = Math.max(...projected.map((p) => Math.abs(p[axis]))) || 1;
    for (const p of projected) p[axis] = (p[axis] / extent) * radius;
  }
  return projected;
}
