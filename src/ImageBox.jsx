import {imageUrl} from './config.js';

export default function ImageBox({image, onClose, onFindSimilar}) {
  if (!image) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="centered" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl(image.name, {v: image.v})}
          alt={image.name}
          onClick={onClose}
        />
        <div className="lightbox-bar">
          <span>{image.name.split('/').pop()}</span>
          {onFindSimilar && (
            <button onClick={() => onFindSimilar(image)}>Show similar</button>
          )}
        </div>
      </div>
    </div>
  );
}
