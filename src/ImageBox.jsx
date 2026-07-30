import {imageUrl} from './config.js';

export default function ImageBox({image, onClose}) {
  if (!image) {
    return <p className="hint">Click a dot!</p>;
  }
  return (
    <div>
      <p className="hint">Click outside the image to close!</p>
      <div className="centered" onClick={onClose}>
        <img src={imageUrl(image.name)} alt={image.name} />
      </div>
    </div>
  );
}
