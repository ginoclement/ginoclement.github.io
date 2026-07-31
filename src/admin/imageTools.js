/** Client-side image compression: downscale + re-encode to JPEG via canvas. */

const FULL_MAX_DIM = 2560;
const FULL_QUALITY = 0.82;
const THUMB_MAX_DIM = 640;
const THUMB_QUALITY = 0.75;

async function loadBitmap(source) {
  const blob = typeof source === 'string'
    ? await (await fetch(source)).blob()
    : source;
  const bitmap = await createImageBitmap(blob, {imageOrientation: 'from-image'});
  return {bitmap, blob};
}

function drawScaled(bitmap, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Compresses an image for web display. Returns the original untouched when
 * re-encoding wouldn't meaningfully shrink it (already small/optimized).
 *
 * @param {Blob|string} source image blob, or a URL to fetch
 * @returns {{blob: Blob, width: number, height: number, compressed: boolean}}
 */
export async function compressImage(source, {maxDim = FULL_MAX_DIM, quality = FULL_QUALITY} = {}) {
  const {bitmap, blob} = await loadBitmap(source);
  const canvas = drawScaled(bitmap, maxDim);
  const out = await toJpegBlob(canvas, quality);
  const withinDims = bitmap.width <= maxDim && bitmap.height <= maxDim;
  if (withinDims && out.size >= blob.size * 0.9) {
    return {blob, width: bitmap.width, height: bitmap.height, compressed: false};
  }
  return {blob: out, width: canvas.width, height: canvas.height, compressed: true};
}

/** Small variant for grid views. */
export async function makeThumbnail(source) {
  const {bitmap} = await loadBitmap(source);
  return toJpegBlob(drawScaled(bitmap, THUMB_MAX_DIM), THUMB_QUALITY);
}

export function formatBytes(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
