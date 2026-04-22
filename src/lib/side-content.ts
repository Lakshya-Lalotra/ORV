import "server-only";
import { fetchContentJson } from "@/lib/content-fetch";
import type { ChapterIndexRow } from "@/lib/types";
import type { SequelChapter, SequelIndexEntry } from "@/lib/sequel-content";

/**
 * Server-only loader for the one-shot / side corpus (`content/side/`).
 * Same layout as sequel-content; chapters come from `npm run ingest:side`
 * (reads `content/orv_side.epub`). Lazy-fetched from R2 or local fs.
 */

const INDEX_REL = "content/side/index.json";
const chapterRel = (n: number) => `content/side/ch_${n}.json`;

export async function loadSideIndex(): Promise<SequelIndexEntry[]> {
  const indexed = await fetchContentJson<SequelIndexEntry[]>(INDEX_REL);
  if (indexed && Array.isArray(indexed) && indexed.length > 0) {
    return [...indexed].sort((a, b) => a.number - b.number);
  }
  return [];
}

export async function loadSideChapter(
  number: number,
): Promise<SequelChapter | null> {
  return fetchContentJson<SequelChapter>(chapterRel(number));
}

export async function loadSideChapterBySlug(
  slug: string,
): Promise<SequelChapter | null> {
  const match = /^orv-side-ch-(\d+)$/.exec(slug);
  if (!match) return null;
  return loadSideChapter(Number(match[1]));
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
