import type { Chapter, ChapterMood, ManhwaPanel, Segment } from "@prisma/client";
import { fetchContentJson } from "@/lib/content-fetch";
import { publicAssetUrl } from "@/lib/orv-blob-url";
import { corpusChapterToPayload } from "@/lib/corpus-chapter-payload";
import {
  loadCorpusChapter,
  loadCorpusChapterBySlug,
  loadCorpusIndex,
} from "@/lib/epub-corpus.server";
import type { SequelChapter } from "@/lib/sequel-content-types";
import type { ChapterIndexEntry, ChapterPayload, KeywordDef } from "./types";

type ChapterWithSegments = Chapter & {
  segments: (Segment & { panel: ManhwaPanel | null })[];
};

const MANHWA_MAP_REL = "content/manhwa-map.json";
const PANEL_ONLY_TEXT = "\u00A0";

function chapterNumberFromSlug(slug: string): number | null {
  const match = /^orv-ch-(\d+)$/i.exec(slug);
  if (!match) return null;
  const num = Number.parseInt(match[1]!, 10);
  return Number.isFinite(num) ? num : null;
}

function titleForMapOnlySlug(slug: string): string {
  const num = chapterNumberFromSlug(slug);
  if (num === 0) return "Ch. 0: Prologue";
  if (num !== null) return `Ch. ${num}: Manhwa chapter ${num}`;
  return slug;
}

function syntheticMoodForOrder(order: number): ChapterMood {
  const cycle: ChapterMood[] = ["calm", "tension", "chaos"];
  const idx = Math.abs(order) % cycle.length;
  return cycle[idx]!;
}

/** Matches the old `ingest:novel-epub` formulas so `/chapters` looks the same. */
function orvChapterMoodFor(num: number): ChapterMood {
  const cycle: ChapterMood[] = ["calm", "tension", "chaos"];
  return cycle[(num - 1 + cycle.length) % cycle.length]!;
}

function orvChapterIntensityFor(num: number): number {
  return Math.min(95, 35 + (num % 6) * 9);
}

function mergeManhwaPanels(
  slug: string,
  map: Record<string, string[]>,
): ChapterPayload["manhwaPanels"] {
  const urls = map[slug];
  if (!urls?.length) return [];
  return urls.map((imageUrl, index) => ({
    id: `${slug}-panel-${index + 1}`,
    imageUrl: publicAssetUrl(imageUrl),
    alt: `${slug} panel ${index + 1}`,
  }));
}

function parseKeywords(raw: string): KeywordDef[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as KeywordDef[]) : [];
  } catch {
    return [];
  }
}

export async function loadManhwaMap(): Promise<Record<string, string[]>> {
  const data = await fetchContentJson<Record<string, string[]>>(MANHWA_MAP_REL);
  return data ?? {};
}

export async function buildMapOnlyChapterPayload(
  slug: string,
): Promise<ChapterPayload | null> {
  const map = await loadManhwaMap();
  const mappedPanels = map[slug];
  if (!mappedPanels?.length) return null;

  const order = chapterNumberFromSlug(slug) ?? 0;
  return {
    slug,
    title: titleForMapOnlySlug(slug),
    mood: syntheticMoodForOrder(order),
    intensity: 55,
    manhwaPanels: mappedPanels.map((imageUrl, index) => ({
      id: `${slug}-panel-${index + 1}`,
      imageUrl: publicAssetUrl(imageUrl),
      alt: `${slug} panel ${index + 1}`,
    })),
    segments: mappedPanels.map((_, index) => ({
      id: `${slug}-segment-${index + 1}`,
      orderIndex: index,
      kind: "narration",
      text: PANEL_ONLY_TEXT,
      keywords: [],
      panel: null,
    })),
  };
}

export async function buildExtraMapChapterIndexEntries(
  existingSlugs: Set<string>,
): Promise<ChapterIndexEntry[]> {
  const map = await loadManhwaMap();
  return Object.keys(map)
    .filter((slug) => !existingSlugs.has(slug) && /^orv-ch-\d+$/i.test(slug))
    .sort((a, b) => (chapterNumberFromSlug(a) ?? 0) - (chapterNumberFromSlug(b) ?? 0))
    .map((slug) => ({
      slug,
      title: titleForMapOnlySlug(slug),
    }));
}

export async function buildExtraMapChapterIndexRows(
  existingSlugs: Set<string>,
): Promise<{
  id: string;
  slug: string;
  title: string;
  mood: ChapterMood;
  intensity: number;
  order: number;
  segmentCount: number;
}[]> {
  const map = await loadManhwaMap();
  return Object.entries(map)
    .filter(([slug]) => !existingSlugs.has(slug) && /^orv-ch-\d+$/i.test(slug))
    .sort(
      ([a], [b]) => (chapterNumberFromSlug(a) ?? 0) - (chapterNumberFromSlug(b) ?? 0),
    )
    .map(([slug, panels]) => {
      const order = chapterNumberFromSlug(slug) ?? 0;
      return {
        id: `map-${slug}`,
        slug,
        title: titleForMapOnlySlug(slug),
        mood: syntheticMoodForOrder(order),
        intensity: 55,
        order,
        segmentCount: panels.length,
      };
    });
}

export async function buildChapterPayload(
  chapter: ChapterWithSegments,
): Promise<ChapterPayload> {
  const map = await loadManhwaMap();
  const mappedPanels = map[chapter.slug] ?? [];

  const segments = chapter.segments.map((segment) => ({
    id: segment.id,
    orderIndex: segment.orderIndex,
    kind: segment.kind,
    text: segment.text,
    keywords: parseKeywords(segment.keywordsJson),
    panel: segment.panel
      ? { imageUrl: publicAssetUrl(segment.panel.imageUrl), alt: segment.panel.alt }
      : null,
  }));
  const manhwaPanels =
    mappedPanels.length > 0
      ? mappedPanels.map((imageUrl, index) => ({
          id: `${chapter.slug}-panel-${index + 1}`,
          imageUrl: publicAssetUrl(imageUrl),
          alt: `${chapter.slug} panel ${index + 1}`,
        }))
      : segments
          .filter((segment) => segment.panel)
          .map((segment) => ({
            id: segment.id,
            imageUrl: publicAssetUrl(segment.panel!.imageUrl),
            alt: segment.panel!.alt,
          }));

  return {
    slug: chapter.slug,
    title: chapter.title,
    mood: chapter.mood,
    intensity: chapter.intensity,
    manhwaPanels,
    segments,
  };
}

// ---------- ORV main novel: direct-from-EPUB loaders ----------

export type OrvChapterIndexRow = {
  id: string;
  slug: string;
  title: string;
  mood: ChapterMood;
  intensity: number;
  order: number;
  segmentCount: number;
};

export type OrvChapterIndexEntry = ChapterIndexEntry & { order: number };

/**
 * Landing rows for `/chapters`. The novel EPUB is parsed lazily: here we
 * only read the spine index (no chapter body parsing), so the listing
 * renders fast. Segment counts are omitted (shown as 0) because counting
 * would require parsing every chapter; the UI tolerates this.
 */
export async function loadOrvChapterIndexRows(): Promise<OrvChapterIndexRow[]> {
  const index = await loadCorpusIndex("orv");
  return index.map((e) => ({
    id: `orv-${e.slug}`,
    slug: e.slug,
    title: e.title,
    mood: orvChapterMoodFor(e.number),
    intensity: orvChapterIntensityFor(e.number),
    order: e.order,
    segmentCount: 0,
  }));
}

export async function loadOrvChapterIndexEntries(): Promise<OrvChapterIndexEntry[]> {
  const index = await loadCorpusIndex("orv");
  return index.map((e) => ({ slug: e.slug, title: e.title, order: e.order }));
}

function orvCorpusToPayload(
  corpus: SequelChapter,
  map: Record<string, string[]>,
): ChapterPayload {
  const base = corpusChapterToPayload(corpus);
  return {
    ...base,
    mood: orvChapterMoodFor(corpus.number),
    intensity: orvChapterIntensityFor(corpus.number),
    manhwaPanels: mergeManhwaPanels(corpus.slug, map),
  };
}

/**
 * Main-novel chapter payload, sourced from `content/Final Ebup.epub`
 * (R2 in prod, `content/` in dev). Falls back to a map-only payload if
 * the EPUB has no matching chapter but the manhwa map does — keeps
 * the manhwa-only chapters (e.g. above the novel range) navigable.
 */
export async function loadOrvChapterPayloadBySlug(
  slug: string,
): Promise<ChapterPayload | null> {
  const [corpus, map] = await Promise.all([
    loadCorpusChapterBySlug("orv", slug),
    loadManhwaMap(),
  ]);
  if (corpus) return orvCorpusToPayload(corpus, map);
  // No EPUB chapter for this slug — fall back to manhwa-only rendering.
  return buildMapOnlyChapterPayloadFromMap(slug, map);
}

function buildMapOnlyChapterPayloadFromMap(
  slug: string,
  map: Record<string, string[]>,
): ChapterPayload | null {
  const mappedPanels = map[slug];
  if (!mappedPanels?.length) return null;
  const order = chapterNumberFromSlug(slug) ?? 0;
  return {
    slug,
    title: titleForMapOnlySlug(slug),
    mood: syntheticMoodForOrder(order),
    intensity: 55,
    manhwaPanels: mappedPanels.map((imageUrl, index) => ({
      id: `${slug}-panel-${index + 1}`,
      imageUrl: publicAssetUrl(imageUrl),
      alt: `${slug} panel ${index + 1}`,
    })),
    segments: mappedPanels.map((_, index) => ({
      id: `${slug}-segment-${index + 1}`,
      orderIndex: index,
      kind: "narration",
      text: PANEL_ONLY_TEXT,
      keywords: [],
      panel: null,
    })),
  };
}

// Keep the explicit-number variant exported so scripts / future callers
// (e.g. search indexers) can iterate the EPUB without slug parsing.
export async function loadOrvChapterPayload(
  number: number,
): Promise<ChapterPayload | null> {
  const [corpus, map] = await Promise.all([
    loadCorpusChapter("orv", number),
    loadManhwaMap(),
  ]);
  if (!corpus) return null;
  return orvCorpusToPayload(corpus, map);
}
