import "server-only";
import {
  loadCorpusChapter,
  loadCorpusChapterBySlug,
  loadCorpusIndex,
} from "@/lib/epub-corpus.server";
import type {
  SequelChapter,
  SequelIndexEntry,
} from "@/lib/sequel-content-types";
import type { ChapterIndexRow } from "@/lib/types";

/**
 * Server-only loader for the ORV one-shot / side corpus. Same strategy as
 * `sequel-content.ts`: parse `content/orv_side.epub` at runtime (R2 →
 * tmpdir once per process), cache in memory, no separate JSON index.
 */

export async function loadSideIndex(): Promise<SequelIndexEntry[]> {
  return loadCorpusIndex("side");
}

export async function loadSideChapter(
  number: number,
): Promise<SequelChapter | null> {
  return loadCorpusChapter("side", number);
}

export async function loadSideChapterBySlug(
  slug: string,
): Promise<SequelChapter | null> {
  return loadCorpusChapterBySlug("side", slug);
}

export async function sideChapterIndexRows(): Promise<ChapterIndexRow[]> {
  const list = await loadSideIndex();
  return list.map((entry) => ({
    id: `side-${entry.number}`,
    slug: entry.slug,
    title: entry.title,
    mood: "calm",
    intensity: 50,
    order: entry.order,
    segmentCount: 0,
  }));
}

export async function sideChapterNeighbors(number: number): Promise<{
  prev: SequelIndexEntry | null;
  next: SequelIndexEntry | null;
}> {
  const index = await loadSideIndex();
  const i = index.findIndex((e) => e.number === number);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? index[i - 1]! : null,
    next: i + 1 < index.length ? index[i + 1]! : null,
  };
}
