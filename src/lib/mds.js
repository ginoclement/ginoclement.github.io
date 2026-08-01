/**
 * Classical multidimensional scaling: embeds n items in 3D so that
 * euclidean distances approximate the given pairwise distances. Small n
 * (hundreds), so the direct O(n^2) Gram matrix + power iteration is fine.
 *
 * @param {number} n item count
 * @param {(i: number, j: number) => number} dist pairwise distance
 * @param {number} radius scale of the output cube
 * @returns {number[][]} n coordinates [x, y, z]
 */
export function mdsProject(n, dist, radius = 400) {
  if (n < 3) return Array.from({length: n}, () => [0, 0, 0]);

  const d2 = Array.from({length: n}, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(i, j);
      d2[i][j] = d * d;
      d2[j][i] = d * d;
    }
  }

  // Double centering: B = -1/2 * J D^2 J
  const rowMean = d2.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const totalMean = rowMean.reduce((a, b) => a + b, 0) / n;
  const B = Array.from({length: n}, (_, i) =>
    Array.from({length: n}, (_, j) => -0.5 * (d2[i][j] - rowMean[i] - rowMean[j] + totalMean))
  );

  const coords = Array.from({length: n}, () => [0, 0, 0]);
  for (let axis = 0; axis < 3; axis++) {
    // Deterministic start so layouts are stable between loads.
    let v = Array.from({length: n}, (_, i) => Math.sin(i * 1.7 + axis * 5) + 1e-4);
    let eigenvalue = 0;
    for (let iter = 0; iter < 80; iter++) {
      const next = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const Bi = B[i];
        let sum = 0;
        for (let j = 0; j < n; j++) sum += Bi[j] * v[j];
        next[i] = sum;
      }
      const norm = Math.hypot(...next) || 1;
      v = next.map((x) => x / norm);
      eigenvalue = norm;
    }
    const scale = Math.sqrt(Math.max(eigenvalue, 0));
    for (let i = 0; i < n; i++) coords[i][axis] = v[i] * scale;
    // Deflate.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        B[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  for (let axis = 0; axis < 3; axis++) {
    const extent = Math.max(...coords.map((c) => Math.abs(c[axis]))) || 1;
    for (const c of coords) c[axis] = (c[axis] / extent) * radius;
  }
  return coords;
}
