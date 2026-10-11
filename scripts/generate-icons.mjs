#!/usr/bin/env node
// Renders the pixel-art app icon at every size the web app and the browser extension need.
// Pure Node (zlib only), so icons can be regenerated without image tooling.
//
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 16x16 design: s = steam, w = cup, c = coffee, h = highlight, . = background.
const GRID = [
  "................",
  "......s...s.....",
  ".....s...s......",
  "......s...s.....",
  "................",
  "..wwwwwwwwww....",
  "..wcccccccchwww.",
  "..wccccccccw..w.",
  "..wccccccccw..w.",
  "..wccccccccw..w.",
  "..wccccccccwww..",
  "..wccccccccw....",
  "...wccccccw.....",
  "....wwwwww......",
  "................",
  "................",
];

const COLORS = {
  s: [156, 163, 175, 255],
  w: [243, 244, 246, 255],
  c: [146, 104, 72, 255],
  h: [209, 213, 219, 255],
};
const BACKGROUND = [17, 24, 39, 255];
const CORNER_RADIUS_RATIO = 0.22;

function isInsideRoundedSquare(x, y, size) {
  const radius = size * CORNER_RADIUS_RATIO;
  const nearestX = Math.min(Math.max(x + 0.5, radius), size - radius);
  const nearestY = Math.min(Math.max(y + 0.5, radius), size - radius);
  return (x + 0.5 - nearestX) ** 2 + (y + 0.5 - nearestY) ** 2 <= radius ** 2;
}

function pixelAt(x, y, size) {
  const cell = GRID[Math.floor((y * GRID.length) / size)][Math.floor((x * GRID.length) / size)];
  if (COLORS[cell]) return COLORS[cell];
  return isInsideRoundedSquare(x, y, size) ? BACKGROUND : [0, 0, 0, 0];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const rows = Array.from({ length: size }, (_, y) =>
    Buffer.from([0, ...Array.from({ length: size }, (_, x) => pixelAt(x, y, size)).flat()]),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const OUTPUTS = [
  ["src/app/icon.png", 32],
  ["src/app/apple-icon.png", 180],
  ...[16, 32, 48, 128, 192, 512].map((size) => [`public/icons/icon-${size}.png`, size]),
];

for (const [path, size] of OUTPUTS) {
  const target = join(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, encodePng(size));
  console.log(`${path} (${size}x${size})`);
}
