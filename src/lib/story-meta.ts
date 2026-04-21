/**
 * Per-series metadata for the story landing page.
 *
 * Mirrors the cards on https://orv.pages.dev/stories/ (title, author,
 * chapter count, status, description, cover) but styled in this app's
 * own design language.
 *
 *   "main:novel"  → ORV novel   (`viewMode = "novel"`)
 *   "main:manhwa" → ORV manhwa  (`viewMode = "manhwa"`)
 *   "sequel"      → ORV Sequel (EPUB ingest)
 *   "side"        → One-shots / side EPUB (`orv_side.epub`)
 */

import type { ViewMode } from "@/lib/types";
import {
  BITTU_COVER_ONESHOT_WEBP,
  BITTU_COVER_ORV_WEBP,
  BITTU_COVER_SEQUEL_WEBP,
  ORV_WEBTOON_KEY_VISUAL_JPG,
} from "@/lib/bittu-orv-assets";

export type StoryStatus = "Completed" | "Ongoing" | "Hiatus";

/** Discriminator used across landing + local-progress code paths. */
export type StorySeriesId = "novel" | "manhwa" | "sequel" | "side";

export type StoryMeta = {
  seriesId: StorySeriesId;
  /** Short tag shown above the title in the hero. */
  eyebrow: string;
  title: string;
  author: string;
  /** Human-readable chapter / episode count, e.g. "551 chapters". */
  chapterLabel: string;
  status: StoryStatus;
  description: string;
  cover: string;
  coverAlt: string;
  /** Word used in CTAs, e.g. "Read", "Watch". */
  verb: string;
  /** Granular unit label used on chapter cards, e.g. "panels" or "segments". */
  unitLabel: string;
  /** Base path for the chapter reader (resolved as `${chapterBase}/${slug}`). */
  chapterBase: string;
};

const NOVEL: StoryMeta = {
  seriesId: "novel",
  eyebrow: "Novel route",
  title: "Omniscient Reader's Viewpoint",
  author: "Sing Shong",
  chapterLabel: "551 chapters",
  status: "Completed",
  description:
    "Dokja, an average office worker, finds his favorite web novel Three Ways to Survive the Apocalypse becoming reality. With unique knowledge of the impending doom, he strives to alter the story's fate and reshape his world.",
  cover: BITTU_COVER_ORV_WEBP,
  coverAlt: "Omniscient Reader's Viewpoint cover illustration",
  verb: "Read",
  unitLabel: "segments",
  chapterBase: "/chapter",
};

const MANHWA: StoryMeta = {
  seriesId: "manhwa",
  eyebrow: "Manhwa route",
  title: "Omniscient Reader",
  author: "Art: Sleepy-C · Story: Sing Shong",
  chapterLabel: "Ongoing",
  status: "Ongoing",
  description:
    "The webtoon adaptation of Sing Shong's Omniscient Reader's Viewpoint. Rendered in full-color vertical panels with cinematic framing and the apocalyptic atmosphere the story demands.",
  cover: ORV_WEBTOON_KEY_VISUAL_JPG,
  coverAlt: "Omniscient Reader's Viewpoint webtoon key visual",
  verb: "Read",
  unitLabel: "panels",
  chapterBase: "/chapter",
};

const SIDE: StoryMeta = {
  seriesId: "side",
  eyebrow: "One-shots",
  title: "Omniscient Reader's Viewpoint — Side stories",
  author: "Sing Shong",
  chapterLabel: "One-shots (orv_side.epub)",
  status: "Completed",
  description:
    "Short stories and side content from the ORV universe, read from the bundled EPUB in this reader.",
  cover: BITTU_COVER_ONESHOT_WEBP,
  coverAlt: "ORV one-shot side stories",
  verb: "Read",
  unitLabel: "segments",
  chapterBase: "/chapter",
};

const SEQUEL: StoryMeta = {
  seriesId: "sequel",
  eyebrow: "Side story",
  title: "Omniscient Reader's Viewpoint — Sequel",
  author: "Sing Shong",
  chapterLabel: "447 side-story chapters (Ch 553–999)",
  status: "Ongoing",
  description:
    "The story follows Lee Hakhyun, the author of ORV from another worldline. He transmigrates into Ways of Survival with other ORV readers. However, the scenarios have been messed up due to the participation of ORV readers and KimCom.",
  cover: BITTU_COVER_SEQUEL_WEBP,
  coverAlt: "Omniscient Reader's Viewpoint Sequel cover illustration",
  verb: "Read",
  unitLabel: "segments",
  chapterBase: "/chapter",
};

export function storyMeta(mode: ViewMode): StoryMeta {
  return mode === "manhwa" ? MANHWA : NOVEL;
}

export function storyMetaForSeries(series: StorySeriesId): StoryMeta {
  if (series === "manhwa") return MANHWA;
  if (series === "sequel") return SEQUEL;
  if (series === "side") return SIDE;
  return NOVEL;
}

/** Shared pill styles for publication status (cover chip, hero meta, home cards). */
export function readingStatusPillClass(status: StoryStatus): string {
  const base =
    "inline-flex w-fit max-w-full items-center rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] leading-none";
  switch (status) {
    case "Completed":
      return `${base} border-emerald-400/40 bg-emerald-500/15 text-emerald-100/95`;
    case "Ongoing":
      return `${base} border-amber-400/40 bg-amber-500/15 text-amber-50/95`;
    case "Hiatus":
    default:
      return `${base} border-[var(--hairline-strong)] bg-black/45 text-[var(--reader-muted)]`;
  }
}
