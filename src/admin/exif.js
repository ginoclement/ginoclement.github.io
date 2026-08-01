/**
 * Minimal JPEG EXIF reader: extracts the handful of fields the site's
 * visualizations use. Returns null when a file has no readable EXIF.
 *
 * Canvas re-encoding strips EXIF, so this must run against the ORIGINAL
 * file bytes (before compression); the result is stored in the manifest.
 */

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LON_REF = 0x0003;
const GPS_LON = 0x0004;
const TAG_EXPOSURE = 0x829a;
const TAG_FNUMBER = 0x829d;
const TAG_ISO = 0x8827;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_FOCAL_LENGTH = 0x920a;

const TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8};

export async function parseExif(blob) {
  try {
    const buffer = await blob.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

    // Walk JPEG segments looking for APP1/Exif.
    let offset = 2;
    let tiffStart = -1;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda) break; // start of scan — no EXIF past here
      const size = view.getUint16(offset + 2);
      if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
        tiffStart = offset + 10; // past "Exif\0\0"
        break;
      }
      offset += 2 + size;
    }
    if (tiffStart < 0) return null;

    const little = view.getUint16(tiffStart) === 0x4949;
    const u16 = (o) => view.getUint16(tiffStart + o, little);
    const u32 = (o) => view.getUint32(tiffStart + o, little);
    if (u16(2) !== 42) return null;

    const readEntries = (ifdOffset, wanted, out) => {
      if (tiffStart + ifdOffset + 2 > view.byteLength) return;
      const count = u16(ifdOffset);
      for (let i = 0; i < count; i++) {
        const entry = ifdOffset + 2 + i * 12;
        if (tiffStart + entry + 12 > view.byteLength) return;
        const tag = u16(entry);
        if (!wanted.has(tag)) continue;
        const type = u16(entry + 2);
        const num = u32(entry + 4);
        const byteLen = (TYPE_SIZES[type] ?? 1) * num;
        const valueOffset = byteLen > 4 ? u32(entry + 8) : entry + 8;
        if (tiffStart + valueOffset + byteLen > view.byteLength) continue;
        out[tag] = {type, num, offset: valueOffset};
      }
    };

    const readValue = (entry) => {
      if (!entry) return null;
      const {type, num, offset: o} = entry;
      if (type === 2) {
        let s = '';
        for (let i = 0; i < num - 1; i++) {
          const c = view.getUint8(tiffStart + o + i);
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        return s.trim();
      }
      if (type === 3) return u16(o);
      if (type === 4) return u32(o);
      if (type === 5) {
        const numerator = u32(o);
        const denominator = u32(o + 4);
        return denominator ? numerator / denominator : null;
      }
      return null;
    };

    const readRationals = (entry, n) => {
      if (!entry || entry.type !== 5 || entry.num < n) return null;
      const out = [];
      for (let i = 0; i < n; i++) {
        const numerator = u32(entry.offset + i * 8);
        const denominator = u32(entry.offset + i * 8 + 4);
        out.push(denominator ? numerator / denominator : 0);
      }
      return out;
    };

    const ifd0 = {};
    readEntries(u32(4), new Set([TAG_MAKE, TAG_MODEL, TAG_EXIF_IFD, TAG_GPS_IFD]), ifd0);
    const exifTags = {};
    if (ifd0[TAG_EXIF_IFD]) {
      readEntries(
        u32(ifd0[TAG_EXIF_IFD].offset),
        new Set([TAG_DATETIME_ORIGINAL, TAG_FNUMBER, TAG_FOCAL_LENGTH, TAG_ISO, TAG_EXPOSURE]),
        exifTags
      );
    }

    const result = {};
    const dateString = readValue(exifTags[TAG_DATETIME_ORIGINAL]);
    if (dateString) {
      // "YYYY:MM:DD HH:MM:SS" — treat as local time.
      const m = dateString.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        if (Number.isFinite(t) && t > 0) result.takenAt = t;
      }
    }
    const fNumber = readValue(exifTags[TAG_FNUMBER]);
    if (fNumber) result.fNumber = Math.round(fNumber * 10) / 10;
    const focal = readValue(exifTags[TAG_FOCAL_LENGTH]);
    if (focal) result.focalLength = Math.round(focal);
    const iso = readValue(exifTags[TAG_ISO]);
    if (iso) result.iso = iso;
    const exposure = readValue(exifTags[TAG_EXPOSURE]);
    if (exposure) result.exposure = exposure;
    // GPS: harvested now so a future photo-map has data to draw from.
    if (ifd0[TAG_GPS_IFD]) {
      const gpsTags = {};
      readEntries(
        u32(ifd0[TAG_GPS_IFD].offset),
        new Set([GPS_LAT_REF, GPS_LAT, GPS_LON_REF, GPS_LON]),
        gpsTags
      );
      const latParts = readRationals(gpsTags[GPS_LAT], 3);
      const lonParts = readRationals(gpsTags[GPS_LON], 3);
      if (latParts && lonParts) {
        let lat = latParts[0] + latParts[1] / 60 + latParts[2] / 3600;
        let lon = lonParts[0] + lonParts[1] / 60 + lonParts[2] / 3600;
        if (readValue(gpsTags[GPS_LAT_REF]) === 'S') lat = -lat;
        if (readValue(gpsTags[GPS_LON_REF]) === 'W') lon = -lon;
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
          result.lat = Math.round(lat * 1e5) / 1e5;
          result.lon = Math.round(lon * 1e5) / 1e5;
        }
      }
    }

    const make = readValue(ifd0[TAG_MAKE]) ?? '';
    const model = readValue(ifd0[TAG_MODEL]) ?? '';
    if (make || model) {
      result.camera = model.startsWith(make) ? model : `${make} ${model}`.trim();
    }

    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}
