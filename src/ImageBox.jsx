import {imageUrl} from './config.js';

export default function ImageBox({image, onClose}) {
  if (!image) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="centered">
        <img src={imageUrl(image.name, {v: image.v})} alt={image.name} />
      </div>
    </div>
  );
}
