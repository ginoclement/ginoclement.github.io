import {useMemo} from 'react';
import PaletteStrip from './PaletteStrip.jsx';

/** A color diary: palette strips in capture order, with month markers. */
export default function Timeline({images, onSelect}) {
  const dated = useMemo(
    () =>
      images
        .filter((i) => i.exif?.takenAt)
        .sort((a, b) => a.exif.takenAt - b.exif.takenAt),
    [images]
  );

  if (!dated.length) {
    return (
      <div className="view-pad">
        <p className="view-caption">
          No capture dates available yet. Dates come from EXIF, which is
          extracted when photos are uploaded or re-analyzed in the admin.
        </p>
      </div>
    );
  }

  const items = [];
  let lastLabel = '';
  for (const img of dated) {
    const label = new Date(img.exif.takenAt).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric'
    });
    if (label !== lastLabel) {
      items.push({type: 'label', label, key: `label:${label}`});
      lastLabel = label;
    }
    items.push({type: 'photo', img, key: img.name});
  }

  return (
    <div className="view-pad">
      <p className="view-caption">
        A color diary: each photo's palette in the order it was taken.
        {dated.length < images.length &&
          ` ${dated.length} of ${images.length} photos have capture dates.`}
      </p>
      <div className="timeline-scroll">
        {items.map((item) =>
          item.type === 'label' ? (
            <div key={item.key} className="timeline-label">
              <span>{item.label}</span>
            </div>
          ) : (
            <PaletteStrip
              key={item.key}
              img={item.img}
              className="timeline-thread"
              onClick={() => onSelect(item.img)}
            />
          )
        )}
      </div>
    </div>
  );
}
