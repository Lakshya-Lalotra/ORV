/**
 * One-shot asset helper.
 *
 * `public/branding/orv-reader-wordmark.png` ships with a pale paper /
 * grid background behind the blue OMNISCIENT × READER lettering. For
 * the finale scene we want the letters floating on the dark stage, so
 * we generate a sibling PNG where the cream background is alpha-keyed
 * out based on luminance.
 *
 *   npm exec tsx scripts/make-wordmark-transparent.ts
 *
 * Writes: public/branding/orv-reader-wordmark-transparent.png
 */
import path from "node:path";
import sharp from "sharp";

const SRC = path.resolve("public/branding/orv-reader-wordmark.png");
const OUT = path.resolve("public/branding/orv-reader-wordmark-transparent.png");

async function main() {
  const img = sharp(SRC).ensureAlpha();
  const { data, info } = await img
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`expected RGBA, got ${channels} channels`);
  }

  const out = Buffer.from(data);
  // Soft-key cream/white paper to transparent. Rules:
  //   * Luminance >= 240 → fully transparent.
  //   * Luminance <= 170 → fully opaque (preserve the blue lettering).
  //   * In between → linear ramp, so anti-aliased letter edges stay
  //                  feathered instead of jagged.
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let alpha: number;
    if (lum >= 240) alpha = 0;
    else if (lum <= 170) alpha = 255;
    else alpha = Math.round(255 * (1 - (lum - 170) / (240 - 170)));
    out[i + 3] = alpha;
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${width}×${height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
