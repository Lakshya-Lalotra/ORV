import { loadManhwaMap } from "./chapter-payload";

/** Highest `orv-ch-N` numeric N in the manhwa map, or -1 if none. */
export function getMaxNumericOrvChapterFromMap(): number {
  const map = loadManhwaMap();
  let max = -1;
  for (const k of Object.keys(map)) {
    const m = /^orv-ch-(\d+)$/i.exec(k);
    if (m) max = Math.max(max, Number.parseInt(m[1]!, 10));
  }
  return max;
}

export type ManhwaIncrementalRange = { from: number; to: number };

/**
 * Next numeric range to scrape after the latest `orv-ch-N` in the map.
 * Returns null if the map has no numeric chapters yet (run a full scrape first).
 */
export function getNextManhwaIncrementalRange(): ManhwaIncrementalRange | null {
  const max = getMaxNumericOrvChapterFromMap();
  if (max < 0) return null;

  const rawMax = process.env.ORV_MANHWA_INCREMENTAL_MAX?.trim();
  const batch = Math.max(
    1,
    Math.min(50, rawMax ? Number.parseInt(rawMax, 10) || 5 : 5),
  );

  const capRaw = process.env.ORV_MANHWA_SCRAPE_TO_CAP?.trim();
  const capTo =
    capRaw && Number.isFinite(Number.parseInt(capRaw, 10))
      ? Number.parseInt(capRaw, 10)
      : null;

  const from = max + 1;
  let to = from + batch - 1;
  if (capTo !== null && capTo > 0) {
    to = Math.min(to, capTo);
  }

  if (from > to) return null;
  return { from, to };
}

export function defaultManhwaChapter0Url(): string {
  return (
    process.env.ORV_MANHWA_BASE_URL?.trim() ||
    "https://www.mangaread.org/manga/omniscient-readers-viewpoint/chapter-0/"
  );
}
