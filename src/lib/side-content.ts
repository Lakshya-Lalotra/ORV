import fs from "node:fs";
import path from "node:path";
import type { ChapterIndexRow } from "@/lib/types";
import type { SequelChapter, SequelIndexEntry } from "@/lib/sequel-content";

/**
 * Server-only loader for one-shot / side-story EPUB ingested into
 * `content/side/` via `npm run ingest:side` (`content/orv_side.epub`).
 *
 * JSON shape matches `SequelChapter` so `corpusChapterToPayload` / `ChapterReader` can render it.
 */

const SIDE_DIR = path.join(process.cwd(), "content", "side");
const INDEX_PATH = path.join(SIDE_DIR, "index.json");

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadSideIndex(): SequelIndexEntry[] {
  const indexed = safeReadJson<SequelIndexEntry[]>(INDEX_PATH);
  if (indexed && Array.isArray(indexed) && indexed.length > 0) {
    return [...indexed].sort((a, b) => a.number - b.number);
  }
  if (!fs.existsSync(SIDE_DIR)) return [];
  const files = fs.readdirSync(SIDE_DIR).filter((f) => /^ch_\d+\.json$/.test(f));
  const rows: SequelIndexEntry[] = [];
  for (const file of files) {
    const ch = safeReadJson<SequelChapter>(path.join(SIDE_DIR, file));
    if (!ch) continue;
    rows.push({
      number: ch.number,
      slug: ch.slug,
      title: ch.title,
      order: ch.order,
    });
  }
  return rows.sort((a, b) => a.number - b.number);
}

export function loadSideChapter(number: number): SequelChapter | null {
  const file = path.join(SIDE_DIR, `ch_${number}.json`);
  return safeReadJson<SequelChapter>(file);
}

export function loadSideChapterBySlug(slug: string): SequelChapter | null {
  const match = /^orv-side-ch-(\d+)$/.exec(slug);
  if (!match) return null;
  return loadSideChapter(Number(match[1]));
}

export function sideChapterIndexRows(): ChapterIndexRow[] {
  const list = loadSideIndex();
  const onDisk = new Set(
    fs.existsSync(SIDE_DIR)
      ? fs.readdirSync(SIDE_DIR).filter((f) => /^ch_\d+\.json$/.test(f))
      : [],
  );

  return list.map((entry) => {
    const ch = onDisk.has(`ch_${entry.number}.json`)
      ? loadSideChapter(entry.number)
      : null;
    const segCount = ch
      ? ch.segments.filter((s) => s.kind === "line" || s.kind === "window").length
      : 0;
    return {
      id: `side-${entry.number}`,
      slug: entry.slug,
      title: entry.title,
      mood: "calm",
      intensity: 50,
      order: entry.order,
      segmentCount: segCount,
    };
  });
}

export function sideChapterNeighbors(number: number): {
  prev: SequelIndexEntry | null;
  next: SequelIndexEntry | null;
} {
  const index = loadSideIndex();
  const i = index.findIndex((e) => e.number === number);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? index[i - 1] : null,
    next: i + 1 < index.length ? index[i + 1] : null,
  };
}
