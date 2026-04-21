import fs from "node:fs";
import path from "node:path";
import type { ChapterIndexRow } from "@/lib/types";

/**
 * Server-only loader for the ORV Sequel corpus ingested into
 * `content/sequel/` via `npm run ingest:sequel`
 * (`scripts/ingest-sequel-epub.ts`, reads `content/orv_sequel.epub`).
 *
 * Never import from a Client Component — this uses `node:fs`. All
 * consumers should be Server Components or route handlers.
 */

export type SequelSegmentKind =
  | "line"
  | "notice"
  | "quote"
  | "window"
  | "divider"
  | "spacer";

export type SequelSegment = {
  kind: SequelSegmentKind;
  text: string;
  title?: string;
};

export type SequelChapter = {
  number: number;
  slug: string;
  title: string;
  order: number;
  segments: SequelSegment[];
  authorNote: SequelSegment[];
  sourceUrl: string;
  scrapedAt: string;
};

export type SequelIndexEntry = {
  number: number;
  slug: string;
  title: string;
  order: number;
};

const SEQUEL_DIR = path.join(process.cwd(), "content", "sequel");
const INDEX_PATH = path.join(SEQUEL_DIR, "index.json");

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Returns the full canonical index, whether chapters are on-disk or not. */
export function loadSequelIndex(): SequelIndexEntry[] {
  const indexed = safeReadJson<SequelIndexEntry[]>(INDEX_PATH);
  if (indexed && Array.isArray(indexed) && indexed.length > 0) {
    return [...indexed].sort((a, b) => a.number - b.number);
  }
  // Fallback: derive from on-disk per-chapter files if the index file is
  // missing (e.g. partial scrape in progress).
  if (!fs.existsSync(SEQUEL_DIR)) return [];
  const files = fs
    .readdirSync(SEQUEL_DIR)
    .filter((f) => /^ch_\d+\.json$/.test(f));
  const rows: SequelIndexEntry[] = [];
  for (const file of files) {
    const ch = safeReadJson<SequelChapter>(path.join(SEQUEL_DIR, file));
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

/** How many chapter files actually exist on disk (scrape progress). */
export function countAvailableSequelChapters(): number {
  if (!fs.existsSync(SEQUEL_DIR)) return 0;
  return fs
    .readdirSync(SEQUEL_DIR)
    .filter((f) => /^ch_\d+\.json$/.test(f)).length;
}

export function loadSequelChapter(number: number): SequelChapter | null {
  const file = path.join(SEQUEL_DIR, `ch_${number}.json`);
  return safeReadJson<SequelChapter>(file);
}

export function loadSequelChapterBySlug(slug: string): SequelChapter | null {
  const match = /^orv-seq-ch-(\d+)$/.exec(slug);
  if (!match) return null;
  return loadSequelChapter(Number(match[1]));
}

/**
 * Adapt the sequel index into the same shape the StoryLanding
 * component already knows how to render. We fill in a neutral
 * mood/intensity because the sequel scrape has no per-chapter
 * mood tagging.
 */
export function sequelChapterIndexRows(): ChapterIndexRow[] {
  const list = loadSequelIndex();
  const onDisk = new Set(
    fs.existsSync(SEQUEL_DIR)
      ? fs
          .readdirSync(SEQUEL_DIR)
          .filter((f) => /^ch_\d+\.json$/.test(f))
          .map((f) => f)
      : [],
  );

  return list.map((entry) => {
    const ch = onDisk.has(`ch_${entry.number}.json`)
      ? loadSequelChapter(entry.number)
      : null;
    const segCount = ch
      ? ch.segments.filter((s) => s.kind === "line" || s.kind === "window")
          .length
      : 0;
    return {
      id: `seq-${entry.number}`,
      slug: entry.slug,
      title: entry.title,
      mood: "calm",
      intensity: 50,
      order: entry.order,
      segmentCount: segCount,
    };
  });
}

/** Build prev/next navigation for the reader, relative to a number. */
export function sequelChapterNeighbors(number: number): {
  prev: SequelIndexEntry | null;
  next: SequelIndexEntry | null;
} {
  const index = loadSequelIndex();
  const i = index.findIndex((e) => e.number === number);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? index[i - 1] : null,
    next: i + 1 < index.length ? index[i + 1] : null,
  };
}
