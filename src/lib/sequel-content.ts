import "server-only";
import {
  loadCorpusChapter,
  loadCorpusChapterBySlug,
  loadCorpusIndex,
} from "@/lib/epub-corpus.server";
import type {
  SequelChapter,
  SequelIndexEntry,
  SequelSegment,
  SequelSegmentKind,
} from "@/lib/sequel-content-types";
import type { ChapterIndexRow } from "@/lib/types";

/**
 * Server-only loader for the ORV Sequel corpus. Content is parsed on-demand
 * from `content/orv_sequel.epub` via `epub-corpus.server.ts` — the EPUB is
 * downloaded from R2 once per process and then parsed lazily per chapter
 * with module-scoped caches. No parallel JSON tree is maintained.
 */

export type { SequelChapter, SequelIndexEntry, SequelSegment, SequelSegmentKind };

export async function loadSequelIndex(): Promise<SequelIndexEntry[]> {
  return loadCorpusIndex("sequel");
}

export async function loadSequelChapter(
  number: number,
): Promise<SequelChapter | null> {
  return loadCorpusChapter("sequel", number);
}

export async function loadSequelChapterBySlug(
  slug: string,
): Promise<SequelChapter | null> {
  return loadCorpusChapterBySlug("sequel", slug);
}

/** Landing page rows — cheap projection over the index (no chapter parse). */
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
