import {rgbCss, rgbToHsl} from '../lib/color.js';

/** One photo as a vertical stack of its palette colors, light to dark. */
export default function PaletteStrip({img, onClick, className = ''}) {
  const segments = (img.palette ?? [{color: img.color, share: 1}])
    .slice()
    .sort((a, b) => rgbToHsl(b.color)[2] - rgbToHsl(a.color)[2]);
  return (
    <button className={`thread ${className}`} title={img.name} onClick={onClick}>
      {segments.map((s, i) => (
        <span
          key={i}
          style={{background: rgbCss(s.color), flexGrow: Math.max(s.share, 0.02)}}
        />
      ))}
    </button>
  );
}
