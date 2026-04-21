import type { ChapterMood, SegmentKind } from "@prisma/client";

export type KeywordDef = { term: string; definition: string };

/** Ordered list for chapter jump control (full book can be hundreds of rows). */
export type ChapterIndexEntry = { slug: string; title: string };

/** Full chapter row used by the story-landing index (DB + map-only merged). */
export type ChapterIndexRow = {
  id: string;
  slug: string;
  title: string;
  mood: string;
  intensity: number;
  order: number;
  /** Segment count for novel chapters, panel count for manhwa-map rows. */
  segmentCount: number;
};

export type ChapterPayload = {
  slug: string;
  title: string;
  mood: ChapterMood;
  intensity: number;
  manhwaPanels: {
    id: string;
    imageUrl: string;
    alt: string;
  }[];
  segments: {
    id: string;
    orderIndex: number;
    kind: SegmentKind;
    text: string;
    keywords: KeywordDef[];
    panel: { imageUrl: string; alt: string } | null;
  }[];
};

/** Text-first vs image-first — same split as ORV-Reader (novel page vs illustrated read). */
export type ViewMode = "novel" | "manhwa";

/** Manhwa: vertical strip vs one panel at a time. */
export type ManhwaPanelLayout = "scroll" | "paged";

export type ColorScheme = "dark" | "light";

export type ReaderSettings = {
  viewMode: ViewMode;
  /** Used when viewMode is manhwa. */
  manhwaPanelLayout: ManhwaPanelLayout;
  /** App chrome and reader surfaces (accent stays warm gold). */
  colorScheme: ColorScheme;
  soundEnabled: boolean;
  musicEnabled: boolean;
  textScale: number;
  voiceEnabled: boolean;
  /**
   * Multiplier for the immersive reader view (novel + manhwa). 1 = normal;
   * lower values darken the whole reading UI via CSS `filter: brightness()`.
   * Does not use OS brightness APIs — works the same on mobile, desktop, and PWAs.
   */
  screenBrightness: number;
};

/** Lower bound for {@link ReaderSettings.screenBrightness} (50%). */
export const MIN_SCREEN_BRIGHTNESS = 0.5;

export const DEFAULT_SETTINGS: ReaderSettings = {
  viewMode: "novel",
  manhwaPanelLayout: "scroll",
  colorScheme: "dark",
  soundEnabled: true,
  musicEnabled: false,
  textScale: 1,
  voiceEnabled: false,
  screenBrightness: 1,
};
