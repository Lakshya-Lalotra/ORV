/**
 * Flood-fill transparent from image edges: removes solid/near-black canvas
 * around the ORV wiki site logo (Fandom PNG).
 *
 * Input: public/branding/orv-wiki-logo-raw.png (downloaded if missing)
 * Output: public/branding/orv-wiki-logo.png
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIKI_LOGO_URL =
  "https://static.wikia.nocookie.net/omniscient-readers-viewpoint/images/e/e6/Site-logo.png/revision/latest?cb=20210605154148";

const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "public", "branding", "orv-wiki-logo-raw.png");
const OUTPUT = path.join(ROOT, "public", "branding", "orv-wiki-logo.png");

async function ensureInput() {
  if (fs.existsSync(INPUT)) return;
  fs.mkdirSync(path.dirname(INPUT), { recursive: true });
  const res = await fetch(WIKI_LOGO_URL);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(INPUT, buf);
  console.log("Downloaded", INPUT);
}

/** Pixels at or below this max(R,G,B) on the outer edge seed the flood. */
const EDGE_SEED_MAX = 40;
/** Expand flood to neighbors with max channel <= this (slightly softer edge). */
const FLOOD_MAX = 48;

function idx(x: number, y: number, w: number) {
  return (y * w + x) * 4;
}

async function main() {
  await ensureInput();

  const { data, info } = await sharp(INPUT)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const buf = Buffer.from(data);
  const n = w * h;
  const transparent = new Uint8Array(n);

  const isDark = (i: number) => {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const m = r > g ? r : g;
    return (m > b ? m : b) <= FLOOD_MAX;
  };

  const isEdgeSeed = (i: number) => {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const m = r > g ? r : g;
    return (m > b ? m : b) <= EDGE_SEED_MAX;
  };

  const queue: number[] = [];
  const inQueue = new Uint8Array(n);

  const push = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (inQueue[p]) return;
    const i = idx(x, y, w);
    if (!isEdgeSeed(i)) return;
    inQueue[p] = 1;
    queue.push(p);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const p = queue[head++]!;
    const x = p % w;
    const y = (p / w) | 0;
    const i = idx(x, y, w);
    if (!isDark(i)) continue;
    transparent[p] = 1;
    const neigh = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;
    for (const [nx, ny] of neigh) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const np = ny * w + nx;
      if (inQueue[np]) continue;
      const ni = idx(nx, ny, w);
      if (!isDark(ni)) continue;
      inQueue[np] = 1;
      queue.push(np);
    }
  }

  for (let p = 0; p < n; p++) {
    if (!transparent[p]) continue;
    const i = p * 4;
    buf[i + 3] = 0;
  }

  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT);

  console.log("Wrote", OUTPUT, `${w}x${h}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
