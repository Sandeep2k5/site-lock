// Generates icons/icon-{16,32,48,128}.png and store/logo-300.png (white padlock on a blue rounded square).
// Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [59, 91, 219];      // #3b5bdb
const FG = [255, 255, 255];
const SAMPLES = 8;             // 8x8 supersampling for anti-aliasing

// Signed distance to a rounded rectangle (negative = inside).
function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const dx = Math.abs(x - cx) - hx, dy = Math.abs(y - cy) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

// Returns [r, g, b, a] in 0..1 coverage terms for a point in unit space.
function shade(x, y, detailed) {
  if (roundRect(x, y, 0, 0, 1, 1, 0.22) > 0) return null;              // outside tile

  // Shackle: an upside-down U.
  const cx = 0.5, cy = 0.4, r = 0.15, half = 0.045;
  const shackle = y < cy
    ? Math.abs(Math.hypot(x - cx, y - cy) - r) <= half
    : y <= 0.55 && Math.abs(Math.abs(x - cx) - r) <= half;

  const body = roundRect(x, y, 0.24, 0.46, 0.76, 0.82, 0.07) <= 0;

  let keyhole = false;
  if (detailed) {
    keyhole = Math.hypot(x - 0.5, y - 0.6) <= 0.055 ||
      (Math.abs(x - 0.5) <= 0.022 && y >= 0.6 && y <= 0.72);
  }

  return (shackle || body) && !keyhole ? FG : BG;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const detailed = size >= 32;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = shade((pxi + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, detailed);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (py * size + pxi) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return encodePng(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), render(size));
}

// 300x300 logo for the Edge Add-ons store listing (not shipped in the extension).
const storeDir = new URL('../store/', import.meta.url);
mkdirSync(storeDir, { recursive: true });
writeFileSync(new URL('logo-300.png', storeDir), render(300));
console.log('Wrote icons/icon-{16,32,48,128}.png and store/logo-300.png');
