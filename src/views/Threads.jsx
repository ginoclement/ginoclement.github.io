import {useMemo} from 'react';
import {hueSortKey} from '../lib/color.js';
import PaletteStrip from './PaletteStrip.jsx';

/** The whole gallery woven into one ribbon of palette strips, sorted by hue. */
export default function Threads({images, onSelect}) {
  const sorted = useMemo(
    () => [...images].sort((a, b) => hueSortKey(a.color) - hueSortKey(b.color)),
    [images]
  );
  return (
    <div className="view-pad">
      <p className="view-caption">
        Every photo as a woven strip of its dominant colors, sorted by hue.
        Click a strip to open the photo.
      </p>
      <div className="threads">
        {sorted.map((img) => (
          <PaletteStrip key={img.name} img={img} onClick={() => onSelect(img)} />
        ))}
      </div>
    </div>
  );
}
