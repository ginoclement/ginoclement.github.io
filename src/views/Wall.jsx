import {useMemo} from 'react';
import {hueSortKey} from '../lib/color.js';
import {imageUrl} from '../config.js';

/** Every photo as a square tile, sorted by hue into a gradient contact sheet. */
export default function Wall({images, onSelect}) {
  const sorted = useMemo(
    () => [...images].sort((a, b) => hueSortKey(a.color) - hueSortKey(b.color)),
    [images]
  );
  return (
    <div className="view-pad">
      <p className="view-caption">
        Every photo, arranged by color. Click a tile to open it.
      </p>
      <div className="wall">
        {sorted.map((img) => (
          <button
            key={img.name}
            className="wall-tile"
            title={img.name}
            style={{background: `rgb(${img.color.join(',')})`}}
            onClick={() => onSelect(img)}
          >
            <img src={imageUrl(img.name, {thumb: true, v: img.v})} alt={img.name} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
