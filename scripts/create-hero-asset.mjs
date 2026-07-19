import { writeFile, mkdir } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const width = 1200;
const height = 720;
const pixels = new Uint8Array(width * height * 4);

function rgba(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function blend(base, top) {
  const alpha = top[3] / 255;
  return [
    Math.round(top[0] * alpha + base[0] * (1 - alpha)),
    Math.round(top[1] * alpha + base[1] * (1 - alpha)),
    Math.round(top[2] * alpha + base[2] * (1 - alpha)),
    255,
  ];
}

function setPixel(x, y, color) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const index = (y * width + x) * 4;
  const current = [pixels[index], pixels[index + 1], pixels[index + 2], 255];
  const next = color[3] === 255 ? color : blend(current, color);
  pixels[index] = next[0];
  pixels[index + 1] = next[1];
  pixels[index + 2] = next[2];
  pixels[index + 3] = next[3];
}

function fillRect(x, y, w, h, color) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      setPixel(col, row, color);
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
        setPixel(x, y, color);
      }
    }
  }
}

function fillRoundedRect(x, y, w, h, radius, color) {
  fillRect(x + radius, y, w - radius * 2, h, color);
  fillRect(x, y + radius, w, h - radius * 2, color);
  fillCircle(x + radius, y + radius, radius, color);
  fillCircle(x + w - radius, y + radius, radius, color);
  fillCircle(x + radius, y + h - radius, radius, color);
  fillCircle(x + w - radius, y + h - radius, radius, color);
}

function drawLine(x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    setPixel(x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const t = y / height;
    const leftGlow = Math.max(0, 1 - Math.hypot((x - 160) / 520, (y - 150) / 360));
    const rightGlow = Math.max(0, 1 - Math.hypot((x - 930) / 440, (y - 250) / 330));
    const base = [
      Math.round(247 - t * 8 + leftGlow * 20),
      Math.round(243 - t * 16 + rightGlow * 16),
      Math.round(236 - t * 20 + rightGlow * 24),
      255,
    ];
    setPixel(x, y, base);
  }
}

fillCircle(240, 130, 110, rgba("#dcecf5", 180));
fillCircle(1020, 120, 86, rgba("#f6d27f", 110));
fillRect(0, 548, width, 172, rgba("#eadfd0", 180));

for (let i = 0; i < 28; i += 1) {
  drawLine(90 + i * 42, 615, 220 + i * 42, 720, rgba("#d6c8b8", 90));
}

fillRoundedRect(476, 206, 512, 326, 30, rgba("#18202a", 255));
fillRoundedRect(504, 232, 456, 270, 18, rgba("#eef8fb", 255));
fillRoundedRect(534, 264, 208, 22, 8, rgba("#0f7b6c", 255));
fillRoundedRect(534, 314, 360, 18, 8, rgba("#b9d9d4", 255));
fillRoundedRect(534, 352, 308, 18, 8, rgba("#d5e5eb", 255));
fillRoundedRect(534, 410, 126, 40, 12, rgba("#0f7b6c", 255));
fillRoundedRect(686, 410, 126, 40, 12, rgba("#ffffff", 255));
fillRoundedRect(842, 268, 72, 72, 16, rgba("#f6d27f", 255));

fillRoundedRect(418, 524, 626, 46, 18, rgba("#3b4652", 255));
fillRoundedRect(360, 558, 744, 38, 14, rgba("#6b7480", 255));
fillRoundedRect(622, 562, 218, 12, 6, rgba("#9aa3ad", 255));

fillRoundedRect(236, 414, 142, 126, 22, rgba("#ffffff", 215));
fillRoundedRect(260, 438, 90, 14, 7, rgba("#0f7b6c", 255));
fillRoundedRect(260, 474, 70, 12, 6, rgba("#d5e5eb", 255));
fillRoundedRect(260, 502, 86, 12, 6, rgba("#d5e5eb", 255));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

const scanlines = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const scanlineStart = y * (width * 4 + 1);
  scanlines[scanlineStart] = 0;
  for (let x = 0; x < width * 4; x += 1) {
    scanlines[scanlineStart + 1 + x] = pixels[y * width * 4 + x];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(scanlines)),
  chunk("IEND"),
]);

await mkdir("public/assets", { recursive: true });
await writeFile("public/assets/hero.png", png);
console.log("Created public/assets/hero.png");
