# ginoclement.github.io

My personal site: an interactive 3D gallery of my photography. Each photo is a
dot placed in HSL color space by its dominant color (hue/saturation as polar
coordinates, lightness as height), rendered with [deck.gl](https://deck.gl).
Click a dot to view the photo. A Projects panel showcases my other GitHub
repositories.

Built with Vite + React, deployed to GitHub Pages by the workflow in
`.github/workflows/deploy.yml` on every push to `master`.

## Architecture

```
GitHub Pages (this repo)           Cloudflare
┌──────────────────────┐           ┌─────────────────────────────┐
│ /            gallery │──fetch───▶│ Worker (worker/)            │
│ /admin.html  admin   │──OIDC────▶│  /api/gallery  public       │
└──────────────────────┘   API     │  /images/*     public       │
                                   │  /api/photos…  admin only   │
                                   │        │                    │
                                   │   R2 bucket (photos +       │
                                   │   _manifest.json metadata)  │
                                   └─────────────────────────────┘
```

- **Public page** loads the published gallery from the Worker
  (`/api/gallery`), falling back to the snapshot bundled in `src/images.json`.
- **Admin page** (`/admin.html`) is fronted by Google Sign-In (OIDC). The
  Worker verifies each request's ID token signature against Google's JWKS and
  only accepts allowlisted emails. From there you can upload photos
  (drag & drop), publish/unpublish, delete, and run the dominant-color
  K-Means analysis — the same algorithm as `generate/process.py`, ported to
  the browser in `src/admin/kmeans.js`.
- **Photos** live at the root of an R2 bucket; metadata (dominant color,
  palette, published state) lives in `_manifest.json` in the same bucket.
  Files uploaded straight through the Cloudflare dashboard are adopted with
  the admin's "Sync bucket" button, then colored with "Analyze missing".

## One-time setup

1. **R2 bucket** — in the Cloudflare dashboard create a bucket (default name
   `gino-photos`; adjust `worker/wrangler.toml` if different).

2. **Google OAuth client** — at
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   create an *OAuth client ID* of type *Web application* with authorized
   JavaScript origins `https://ginoclement.github.io` and
   `http://localhost:5173`. Copy the client ID.

3. **Deploy the Worker**

   ```sh
   cd worker
   # set GOOGLE_CLIENT_ID in wrangler.toml (ALLOWED_EMAILS is already set)
   npx wrangler deploy
   ```

   Note the deployed URL, e.g. `https://gino-photos.<account>.workers.dev`.

4. **Repository variables** — in this repo's Settings → Secrets and
   variables → Actions → Variables, set:
   - `API_BASE_URL` = the Worker URL
   - `GOOGLE_CLIENT_ID` = the OAuth client ID

   Then re-run the deploy workflow. The Pages source (Settings → Pages) must
   be set to "GitHub Actions".

5. Open `https://ginoclement.github.io/admin.html`, sign in, hit
   **Sync bucket** to register anything you already uploaded, then
   **Analyze missing** and **Publish**.

## Development

```sh
npm install
npm run dev      # site at http://localhost:5173, admin at /admin.html
npm run build    # production build in dist/

cd worker && npx wrangler dev   # run the API locally (uses a local R2 sim)
```

For local development against the API, create `.env.local`:

```
VITE_API_BASE_URL=http://localhost:8787
VITE_GOOGLE_CLIENT_ID=<client id>
```

## Regenerating color data offline

`generate/process.py` is the original offline version of the color analysis
(K-Means over pixels, dominant color = largest cluster):

```sh
cd generate
pip install -r requirements.txt
python process.py /path/to/photos --output ../src/images.json
```

The admin page's "Export JSON" button downloads the published set in the same
format, which is how `src/images.json` (the bundled fallback) gets refreshed.
