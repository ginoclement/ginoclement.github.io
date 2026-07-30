# ginoclement.github.io

My personal site: an interactive 3D gallery of my photography. Each photo is a
dot placed in HSL color space by its dominant color (hue/saturation as polar
coordinates, lightness as height), rendered with [deck.gl](https://deck.gl).
Click a dot to view the photo.

Built with Vite + React, deployed to GitHub Pages by the workflow in
`.github/workflows/deploy.yml` on every push to `master`.

## Development

```sh
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build in dist/
```

## Photos

The photos themselves are not stored in this repo. `src/config.js` builds image
URLs from a base URL, which defaults to `/images` and can be overridden at
build time with the `VITE_IMAGE_BASE_URL` environment variable (the deploy
workflow reads it from the `IMAGE_BASE_URL` repository variable). Point it at
wherever the photos are hosted, e.g. a CDN bucket.

## Regenerating the color data

`src/images.json` maps each photo filename to its dominant color, computed by
K-Means clustering over the pixels:

```sh
cd generate
pip install -r requirements.txt
python process.py /path/to/photos --output ../src/images.json
```
