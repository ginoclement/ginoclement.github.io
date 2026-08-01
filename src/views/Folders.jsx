import {useMemo, useState} from 'react';
import {hueSortKey, rgbCss} from '../lib/color.js';
import {imageUrl} from '../config.js';

function folderOf(name) {
  const i = name.lastIndexOf('/');
  return i === -1 ? '' : name.slice(0, i);
}

/** Each collection's color signature: its photos' dominant colors, sorted by hue. */
export default function Folders({images, onSelect}) {
  const [open, setOpen] = useState(null);

  const groups = useMemo(() => {
    const map = new Map();
    for (const img of images) {
      const folder = folderOf(img.name) || 'unsorted';
      if (!map.has(folder)) map.set(folder, []);
      map.get(folder).push(img);
    }
    return [...map.entries()]
      .map(([folder, list]) => [folder, [...list].sort((a, b) => hueSortKey(a.color) - hueSortKey(b.color))])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [images]);

  return (
    <div className="view-pad">
      <p className="view-caption">
        Each collection's color signature — every photo's dominant color, sorted
        by hue. Click a signature to browse the collection.
      </p>
      {groups.map(([folder, list]) => {
        const dates = list.map((i) => i.exif?.takenAt).filter(Boolean);
        let range = null;
        if (dates.length) {
          const y1 = new Date(Math.min(...dates)).getFullYear();
          const y2 = new Date(Math.max(...dates)).getFullYear();
          range = y1 === y2 ? `${y1}` : `${y1}–${y2}`;
        }
        return (
          <div key={folder} className="folder-sig">
            <div className="folder-sig-head">
              <h3>{folder}</h3>
              <span>
                {list.length} photo{list.length === 1 ? '' : 's'}
                {range && ` · ${range}`}
              </span>
            </div>
            <button
              className="signature"
              onClick={() => setOpen(open === folder ? null : folder)}
            >
              {list.map((i) => (
                <span key={i.name} style={{background: rgbCss(i.color)}} />
              ))}
            </button>
            {open === folder && (
              <div className="folder-browse">
                {list.map((i) => (
                  <button
                    key={i.name}
                    className="folder-photo"
                    title={i.name}
                    onClick={() => onSelect(i)}
                  >
                    <img
                      src={imageUrl(i.name, {thumb: true, v: i.v})}
                      alt={i.name}
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
