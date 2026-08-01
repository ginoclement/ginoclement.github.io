import {imageUrl} from './config.js';
import {rgbCss} from './lib/color.js';

function exifCaption(image) {
  const e = image.exif;
  if (!e) return null;
  const parts = [];
  if (e.takenAt) {
    parts.push(
      new Date(e.takenAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      })
    );
  }
  if (e.focalLength) parts.push(`${e.focalLength}mm`);
  if (e.fNumber) parts.push(`f/${e.fNumber}`);
  if (e.exposure) {
    parts.push(e.exposure < 1 ? `1/${Math.round(1 / e.exposure)}s` : `${e.exposure}s`);
  }
  if (e.iso) parts.push(`ISO ${e.iso}`);
  return parts.join(' · ') || null;
}

/** Renders a downloadable poster: the photo, its palette, and its caption. */
async function downloadPoster(image) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = imageUrl(image.name, {v: image.v});
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('image failed to load'));
  });

  const W = 1400;
  const PAD = 70;
  const imgW = W - 2 * PAD;
  const imgH = Math.round((img.naturalHeight / img.naturalWidth) * imgW);
  const PALETTE_H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = imgH + PALETTE_H + 250;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, PAD, PAD, imgW, imgH);

  const palette = image.palette ?? [{color: image.color, share: 1}];
  const totalShare = palette.reduce((s, p) => s + p.share, 0) || 1;
  let x = PAD;
  const paletteY = PAD + imgH + 36;
  for (const seg of palette) {
    const w = (seg.share / totalShare) * imgW;
    ctx.fillStyle = rgbCss(seg.color);
    ctx.fillRect(x, paletteY, Math.ceil(w), PALETTE_H);
    x += w;
  }

  ctx.fillStyle = '#1c1c22';
  ctx.font = '600 34px -apple-system, "Segoe UI", sans-serif';
  const base = image.name.split('/').pop().replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  ctx.fillText(base, PAD, paletteY + PALETTE_H + 58);
  const caption = exifCaption(image);
  if (caption) {
    ctx.fillStyle = '#8a8a96';
    ctx.font = '24px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(caption, PAD, paletteY + PALETTE_H + 96);
  }

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.92);
  a.download = `${base.replace(/\s+/g, '-')}-poster.jpg`;
  a.click();
}

export default function ImageBox({image, onClose, onFindSimilar, playing, onTogglePlay}) {
  if (!image) return null;
  const caption = exifCaption(image);
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="centered" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl(image.name, {v: image.v})}
          alt={image.name}
          onClick={onClose}
        />
        <div className="lightbox-bar">
          <span className="lightbox-caption">
            {image.name.split('/').pop()}
            {caption && <em> — {caption}</em>}
          </span>
          <span className="lightbox-actions">
            {onTogglePlay && (
              <button onClick={onTogglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            )}
            {onFindSimilar && (
              <button onClick={() => onFindSimilar(image)}>Show similar</button>
            )}
            <button onClick={() => downloadPoster(image).catch(() => {})}>Poster</button>
          </span>
        </div>
      </div>
    </div>
  );
}
