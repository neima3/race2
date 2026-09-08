import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.42;
  const r2 = size * 0.335;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = x - cx;
      const ny = y - cy;
      const d = Math.hypot(nx, ny);

      let r = 11;
      let g = 14;
      let b = 26;
      const diag = nx * 0.6 + ny * 0.8;
      r += Math.max(0, 22 - diag * 0.05);
      g += Math.max(0, 14 - diag * 0.03);
      b += Math.max(0, 30 - diag * 0.05);

      const inRing = d < R && d > r2;
      const spoke = Math.abs(nx) < size * 0.055 && ny < 0 && d < R && d > r2;
      if (inRing || spoke) {
        const t = Math.min(1, Math.max(0, (R - d) / (R - r2)));
        r = 41 + t * 60;
        g = 230 - t * 90;
        b = 255;
      }

      const numZone = nx > -size * 0.18 && nx < size * 0.18 && ny > -size * 0.1 && ny < size * 0.3;
      if (numZone && d < r2) {
        const bar = size * 0.05;
        const inBar =
          (Math.abs(nx - size * 0.09) < bar && ny > -size * 0.02 && ny < size * 0.24) ||
          (Math.abs(nx + size * 0.09) < bar && ny > -size * 0.02 && ny < size * 0.06) ||
          (Math.abs(ny - size * 0.06) < bar * 0.8 && nx > -size * 0.13 && nx < size * 0.09) ||
          (Math.abs(ny - size * 0.18) < bar * 0.8 && nx > -size * 0.13 && nx < size * 0.13) ||
          (Math.abs(nx + size * 0.09) < bar && ny > size * 0.12 && ny < size * 0.24);
        if (inBar) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      px[i] = Math.round(r);
      px[i + 1] = Math.round(g);
      px[i + 2] = Math.round(b);
      px[i + 3] = 255;
    }
  }
  return encodePNG(size, size, px);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, drawIcon(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}
