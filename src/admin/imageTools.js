/**
 * Client-side image compression: downscale + re-encode to JPEG via canvas.
 *
 * Canvas re-encoding produces a metadata-free JPEG, so compressImage
 * transplants the original's EXIF (APP1) segment into the output — with
 * Orientation reset to 1, since the canvas draw bakes rotation into the
 * pixels.
 */

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
  const withExif = await transplantExif(blob, out);
  return {blob: withExif, width: canvas.width, height: canvas.height, compressed: true};
}

// ---- EXIF transplant ----

/** Finds the APP1/Exif segment (marker + payload) in JPEG bytes, or null. */
function findExifSegment(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xda) return null; // start of scan
    const size = view.getUint16(offset + 2);
    const end = offset + 2 + size;
    if (
      marker === 0xe1 &&
      end <= bytes.length &&
      bytes[offset + 4] === 0x45 && // "Exif"
      bytes[offset + 5] === 0x78 &&
      bytes[offset + 6] === 0x69 &&
      bytes[offset + 7] === 0x66
    ) {
      return bytes.slice(offset, end);
    }
    offset = end;
  }
  return null;
}

/** Sets IFD0's Orientation tag to 1 in an APP1/Exif segment, in place. */
function neutralizeOrientation(segment) {
  try {
    const tiff = 10; // after FF E1 <len> "Exif\0\0"
    const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
    const little = view.getUint16(tiff) === 0x4949;
    if (view.getUint16(tiff + 2, little) !== 42) return;
    const ifd0 = view.getUint32(tiff + 4, little);
    const count = view.getUint16(tiff + ifd0, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd0 + 2 + i * 12;
      if (tiff + entry + 12 > segment.length) return;
      if (view.getUint16(tiff + entry, little) === 0x0112) {
        view.setUint16(tiff + entry + 8, 1, little);
        return;
      }
    }
  } catch {
    // best effort — a malformed segment is copied as-is
  }
}

/** Copies the original JPEG's EXIF segment into a re-encoded JPEG. */
export async function transplantExif(originalBlob, compressedBlob) {
  try {
    const head = new Uint8Array(await originalBlob.slice(0, 512 * 1024).arrayBuffer());
    const segment = findExifSegment(head);
    if (!segment) return compressedBlob;
    neutralizeOrientation(segment);
    const compressed = new Uint8Array(await compressedBlob.arrayBuffer());
    if (compressed.length < 2 || compressed[0] !== 0xff || compressed[1] !== 0xd8) {
      return compressedBlob;
    }
    return new Blob([compressed.slice(0, 2), segment, compressed.slice(2)], {
      type: 'image/jpeg'
    });
  } catch {
    return compressedBlob;
  }
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
