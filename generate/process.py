"""Compute the dominant color of each photo and emit the JSON consumed by the site.

Usage:
    python process.py /path/to/images --output ../src/images.json

The output format is: {"data": [{"name": "<filename>", "color": [r, g, b]}, ...]}
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from sklearn.cluster import KMeans

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def centroid_histogram(clt):
    # Histogram of how many pixels were assigned to each cluster, normalized
    # to sum to one.
    num_labels = np.arange(0, len(np.unique(clt.labels_)) + 1)
    (hist, _) = np.histogram(clt.labels_, bins=num_labels)
    hist = hist.astype("float")
    hist /= hist.sum()
    return hist


def detect_dominant_color(image, num_clusters):
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pixels = image.reshape((image.shape[0] * image.shape[1], 3))

    clt = KMeans(n_clusters=num_clusters, n_init="auto")
    clt.fit(pixels)

    hist = centroid_histogram(clt)
    return clt.cluster_centers_[np.argmax(hist)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path, help="Folder containing the photos")
    parser.add_argument("--output", type=Path, default=Path("images.json"),
                        help="Where to write the JSON (default: images.json)")
    parser.add_argument("--clusters", type=int, default=7,
                        help="Number of K-Means clusters; the largest cluster "
                             "is taken as the dominant color (default: 7)")
    parser.add_argument("--resize", type=int, default=200,
                        help="Downscale longest edge to this many pixels before "
                             "clustering, 0 to disable (default: 200)")
    args = parser.parse_args()

    entries = []
    files = sorted(p for p in args.folder.iterdir()
                   if p.suffix.lower() in IMAGE_EXTENSIONS)
    if not files:
        parser.error(f"no images found in {args.folder}")

    for path in files:
        image = cv2.imread(str(path))
        if image is None:
            print(f"skipping unreadable file {path.name}")
            continue
        if args.resize:
            scale = args.resize / max(image.shape[:2])
            if scale < 1:
                image = cv2.resize(image, None, fx=scale, fy=scale,
                                   interpolation=cv2.INTER_AREA)
        color = np.rint(detect_dominant_color(image, args.clusters))
        entries.append({"name": path.name, "color": [int(c) for c in color]})
        print(f"{path.name}: {entries[-1]['color']}")

    args.output.write_text(json.dumps({"data": entries}, indent=1))
    print(f"wrote {len(entries)} entries to {args.output}")


if __name__ == "__main__":
    main()
