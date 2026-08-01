import {useRef, useState} from 'react';
import {imageUrl} from '../config.js';

const TILE_PX = 28;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function colorDistSq(r, g, b, c) {
  return (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
}

/** Rebuilds one photo out of tiles of all the others, matched by dominant color. */
export default function Mosaic({images}) {
  const [target, setTarget] = useState(images[0]?.name ?? '');
  const [cols, setCols] = useState(48);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const canvasRef = useRef(null);

  const build = async () => {
    const targetImg = images.find((i) => i.name === target);
    if (!targetImg || busy) return;
    setBusy(true);
    setDownloadUrl(null);
    try {
      setProgress('Loading target…');
      const full = await loadImage(imageUrl(targetImg.name, {v: targetImg.v}));
      const rows = Math.max(1, Math.round((cols * full.naturalHeight) / full.naturalWidth));

      // Average color per cell, from a cell-resolution downsample.
      const sample = document.createElement('canvas');
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext('2d');
      sctx.drawImage(full, 0, 0, cols, rows);
      const cells = sctx.getImageData(0, 0, cols, rows).data;

      setProgress('Loading tiles…');
      const tiles = (
        await Promise.allSettled(
          images.map(async (i) => ({
            color: i.color,
            img: await loadImage(imageUrl(i.name, {thumb: true, v: i.v}))
          }))
        )
      )
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);
      if (!tiles.length) throw new Error('no tiles loaded');

      const canvas = canvasRef.current;
      canvas.width = cols * TILE_PX;
      canvas.height = rows * TILE_PX;
      const ctx = canvas.getContext('2d');

      for (let row = 0; row < rows; row++) {
        setProgress(`Placing tiles… row ${row + 1}/${rows}`);
        await new Promise((resolve) => setTimeout(resolve)); // keep UI alive
        for (let col = 0; col < cols; col++) {
          const px = (row * cols + col) * 4;
          const r = cells[px];
          const g = cells[px + 1];
          const b = cells[px + 2];
          let best = tiles[0];
          let bestDist = Infinity;
          for (const tile of tiles) {
            const d = colorDistSq(r, g, b, tile.color);
            if (d < bestDist) {
              bestDist = d;
              best = tile;
            }
          }
          const src = best.img;
          const side = Math.min(src.naturalWidth, src.naturalHeight);
          ctx.drawImage(
            src,
            (src.naturalWidth - side) / 2,
            (src.naturalHeight - side) / 2,
            side,
            side,
            col * TILE_PX,
            row * TILE_PX,
            TILE_PX,
            TILE_PX
          );
        }
      }
      setProgress(null);
      try {
        setDownloadUrl(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        // canvas tainted (e.g. CORS) — mosaic still displays, just no download
      }
    } catch (err) {
      setProgress(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view-pad">
      <p className="view-caption">
        Rebuild any photo out of tiles of all the others, matched by dominant
        color.
      </p>
      <div className="mosaic-controls">
        <label>
          photo
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {images.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name.split('/').pop()}
              </option>
            ))}
          </select>
        </label>
        <label>
          tiles across
          <select value={cols} onChange={(e) => setCols(Number(e.target.value))}>
            <option value={32}>32</option>
            <option value={48}>48</option>
            <option value={64}>64</option>
          </select>
        </label>
        <button className="nav-btn" onClick={build} disabled={busy}>
          {busy ? 'Building…' : 'Build mosaic'}
        </button>
        {downloadUrl && (
          <a className="nav-btn" href={downloadUrl} download="mosaic.jpg">
            Download
          </a>
        )}
      </div>
      {progress && <p className="view-caption">{progress}</p>}
      <canvas ref={canvasRef} className="mosaic-canvas" />
    </div>
  );
}
