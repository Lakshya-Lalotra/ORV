import "server-only";
import { fetchContentJson } from "@/lib/content-fetch";
import type { ChapterIndexRow } from "@/lib/types";

/**
 * Server-only loader for the ORV Sequel corpus.
 *
 * Source of truth is `content/sequel/` produced by
 * `npm run ingest:sequel` (reads `content/orv_sequel.epub`).
 * At runtime we lazy-fetch each JSON:
 *   - from R2 when `NEXT_PUBLIC_ORV_BLOB_BASE` is set
 *     (mirror the folder as `content/sequel/ch_N.json` in the bucket),
 *   - otherwise from the local filesystem.
 *
 * Never import from a Client Component.
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

const INDEX_REL = "content/sequel/index.json";
const chapterRel = (n: number) => `content/sequel/ch_${n}.json`;

/** Returns the full canonical index (sequel/index.json). */
export async function loadSequelIndex(): Promise<SequelIndexEntry[]> {
  const indexed = await fetchContentJson<SequelIndexEntry[]>(INDEX_REL);
  if (indexed && Array.isArray(indexed) && indexed.length > 0) {
    return [...indexed].sort((a, b) => a.number - b.number);
  }
  return [];
}

export async function loadSequelChapter(
  number: number,
): Promise<SequelChapter | null> {
  return fetchContentJson<SequelChapter>(chapterRel(number));
}

export async function loadSequelChapterBySlug(
  slug: string,
): Promise<SequelChapter | null> {
  const match = /^orv-seq-ch-(\d+)$/.exec(slug);
  if (!match) return null;
  return loadSequelChapter(Number(match[1]));
}

/**
 * Adapt the sequel index into `ChapterIndexRow[]` for StoryLanding. We
 * only use the index here (no per-chapter fetches) so the landing page
 * stays cheap even with hundreds of chapters.
 */
export async function sequelChapterIndexRows(): Promise<ChapterIndexRow[]> {
  const list = await loadSequelIndex();
  return list.map((entry) => ({
    id: `seq-${entry.number}`,
    slug: entry.slug,
    title: entry.title,
    mood: "calm",
    intensity: 50,
    order: entry.order,
    segmentCount: 0,
  }));
}

/** Build prev/next navigation for the reader, relative to a number. */
export async function sequelChapterNeighbors(number: number): Promise<{
  prev: SequelIndexEntry | null;
  next: SequelIndexEntry | null;
}> {
  const index = await loadSequelIndex();
  const i = index.findIndex((e) => e.number === number);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? index[i - 1]! : null,
    next: i + 1 < index.length ? index[i + 1]! : null,
  };
}
