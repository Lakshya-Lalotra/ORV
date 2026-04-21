/**
 * Map Bittu5134/ORV-Reader chapter markup to repo image URLs.
 * Chapter .txt files use lines like:
 *   <cover>[Some Title - file.jpg][]
 *   <img>[002 - scene description.jpg][ ]
 * Filenames match website/assets/images/ on the repo (same license as ingest source).
 *
 * @see https://github.com/Bittu5134/ORV-Reader
 */

export const BITTU_REPO_IMAGES_BASE =
  "https://raw.githubusercontent.com/Bittu5134/ORV-Reader/main/website/assets/images/";

const ASSET_EXT = /\.(webp|png|jpe?g|gif|avif)$/i;

/** Placeholder paragraph consumed by write-novel-db (not AI — deterministic parse). */
export const BITTU_IMG_MARKER_PREFIX = "[[[BITTU_IMG:";
export const BITTU_IMG_MARKER_SUFFIX = "]]]";

export function bittuIllustrationsEnabled(): boolean {
  const v = process.env.ORV_BITTU_ILLUSTRATIONS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

export function urlForBittuAssetFilename(filename: string): string {
  return `${BITTU_REPO_IMAGES_BASE}${encodeURIComponent(filename)}`;
}

/**
 * Replace standalone <cover> / <img> bracket lines with marker paragraphs so strip + split keep order.
 */
const LINE_TAG =
  /^<(?:cover|img)>\s*\[([^\]]+)\]\s*\[[^\]]*\]\s*$/i;

/**
 * List image filenames referenced in a raw Bittu chapter .txt (for EPUB/TXT cross-attach).
 */
export function listBittuIllustrationFilenamesFromChapterRaw(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const names: string[] = [];
  for (const line of lines) {
    const m = line.trim().match(LINE_TAG);
    if (!m) continue;
    const inner = m[1]!.trim();
    if (!ASSET_EXT.test(inner)) continue;
    names.push(inner);
  }
  return names;
}

export function preprocessBittuIllustrationLines(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out = lines.map((line) => {
    const t = line.trim();
    const m = t.match(LINE_TAG);
    if (!m) return line;
    const inner = m[1]!.trim();
    if (!ASSET_EXT.test(inner)) return line;
    const enc = encodeURIComponent(inner);
    return `${BITTU_IMG_MARKER_PREFIX}${enc}${BITTU_IMG_MARKER_SUFFIX}`;
  });
  return out.join("\n");
}
