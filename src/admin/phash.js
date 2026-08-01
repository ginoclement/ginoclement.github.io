/**
 * Perceptual duplicate detection.
 *
 * Hash: dual-axis difference-hash — 64 bits of horizontal plus 64 bits of
 * vertical brightness gradients over a 9x9 grayscale downsample. Identical
 * content hashes the same regardless of filename, resolution, or
 * re-encoding; genuinely different structure diverges by tens of bits.
 *
 * Because dHash is grayscale, grouping additionally confirms with palette
 * distance (OKLab) when palettes are available, so a recolored variant of
 * the same structure isn't called a duplicate.
 */
import {paletteDistance} from '../lib/color.js';

const HASH_BITS_MAX = 18; // of 128
const PALETTE_MAX = 0.1; // OKLab palette distance ceiling for "same image"

/** @returns {string} 32-char hex hash (128 bits) */
export async function computeHash(source) {
  const blob = typeof source === 'string'
    ? await (await fetch(source)).blob()
    : source;
  const bitmap = await createImageBitmap(blob, {imageOrientation: 'from-image'});
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 9;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(bitmap, 0, 0, 9, 9);
  const data = ctx.getImageData(0, 0, 9, 9).data;

  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const at = (row, col) => gray[row * 9 + col];

  const bits = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) bits.push(at(row, col) > at(row, col + 1) ? 1 : 0);
  }
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) bits.push(at(row, col) > at(row + 1, col) ? 1 : 0);
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

/** Bits differing between two hex hashes; mismatched formats never match. */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/** True when two photos read as the same image. */
export function isDuplicatePair(a, b, hashBitsMax = HASH_BITS_MAX) {
  if (hammingDistance(a.hash, b.hash) > hashBitsMax) return false;
  // Structure matches — confirm color agrees when we have palette data.
  if ((a.palette || a.color) && (b.palette || b.color)) {
    return paletteDistance(a, b) <= PALETTE_MAX;
  }
  return true;
}

/** Groups photos that read as duplicates of each other (union-find). */
export function groupDuplicates(photos, hashBitsMax = HASH_BITS_MAX) {
  const withHash = photos.filter((p) => p.hash);
  const parent = withHash.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < withHash.length; i++) {
    for (let j = i + 1; j < withHash.length; j++) {
      if (isDuplicatePair(withHash[i], withHash[j], hashBitsMax)) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map();
  withHash.forEach((p, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(p.name);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
