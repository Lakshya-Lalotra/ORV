/**
 * Local (client-only) reading progress.
 *
 * We already write to a server table via `/api/progress`, but the
 * story landing page needs progress *fast* and per-mode — for every
 * chapter in the index — so we mirror it into `localStorage` too.
 *
 * Layout (stored as one JSON blob under `orv-reader-progress`):
 *
 *   {
 *     novel:  { lastSlug, lastTitle, lastAt, chapters: { [slug]: Entry } },
 *     manhwa: { lastSlug, lastTitle, lastAt, chapters: { [slug]: Entry } },
 *   }
 *
 * `Entry.position` counts segments for novel / panels for manhwa.
 * `Entry.total` is the best-known count (latest writer wins).
 * `Entry.completed` is sticky — once true, it stays true.
 *
 * All functions are no-ops on the server (SSR).
 */

import type { ViewMode } from "@/lib/types";
import type { StorySeriesId } from "@/lib/story-meta";

/**
 * Progress buckets. `ViewMode` keys (`novel`, `manhwa`) are retained
 * for backward-compat with existing writes from `ChapterReader`; the
 * `sequel` / `side` buckets are written when reading `orv-seq-ch-*` / `orv-side-ch-*` slugs.
 */
export type ProgressBucketKey = ViewMode | StorySeriesId;

export const LOCAL_PROGRESS_KEY = "orv-reader-progress";
export const LOCAL_PROGRESS_EVENT = "orv-reader-progress-changed";

/** Explicit shelf status; if omitted, derived from progress (see `effectiveChapterMark`). */
export type ChapterMark = "unread" | "reading" | "read";

export type ChapterEntry = {
  /** 0-based index — latest segment (novel) or panel (manhwa) seen. */
  position: number;
  /** Total units in the chapter the last time we wrote progress. 0 = unknown. */
  total: number;
  /** Sticky once set. */
  completed: boolean;
  /** Chapter title snapshot, for hero CTA rendering without extra lookups. */
  title: string;
  /** ms epoch of last update. */
  updatedAt: number;
  /** Manual read / reading / unread override from index or reader. */
  mark?: ChapterMark;
};

export type ModeProgress = {
  lastSlug: string | null;
  lastTitle: string | null;
  lastAt: number;
  chapters: Record<string, ChapterEntry>;
};

export type LocalProgress = {
  novel: ModeProgress;
  manhwa: ModeProgress;
  sequel: ModeProgress;
  side: ModeProgress;
};

const EMPTY_MODE: ModeProgress = {
  lastSlug: null,
  lastTitle: null,
  lastAt: 0,
  chapters: {},
};

export const EMPTY_PROGRESS: LocalProgress = {
  novel: { ...EMPTY_MODE, chapters: {} },
  manhwa: { ...EMPTY_MODE, chapters: {} },
  sequel: { ...EMPTY_MODE, chapters: {} },
  side: { ...EMPTY_MODE, chapters: {} },
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function sanitizeMark(raw: unknown): ChapterMark | undefined {
  if (raw === "unread" || raw === "reading" || raw === "read") return raw;
  return undefined;
}

function sanitizeEntry(raw: unknown): ChapterEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ChapterEntry>;
  const position = Number.isFinite(r.position) ? Math.max(0, r.position as number) : 0;
  const total = Number.isFinite(r.total) ? Math.max(0, r.total as number) : 0;
  const completed = Boolean(r.completed);
  const title = typeof r.title === "string" ? r.title : "";
  const updatedAt = Number.isFinite(r.updatedAt) ? (r.updatedAt as number) : 0;
  const mark = sanitizeMark(r.mark);
  const entry: ChapterEntry = { position, total, completed, title, updatedAt };
  if (mark !== undefined) entry.mark = mark;
  return entry;
}

function sanitizeMode(raw: unknown): ModeProgress {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MODE, chapters: {} };
  const r = raw as Partial<ModeProgress>;
  const chapters: Record<string, ChapterEntry> = {};
  if (r.chapters && typeof r.chapters === "object") {
    for (const [slug, entry] of Object.entries(r.chapters)) {
      const clean = sanitizeEntry(entry);
      if (clean) chapters[slug] = clean;
    }
  }
  return {
    lastSlug: typeof r.lastSlug === "string" ? r.lastSlug : null,
    lastTitle: typeof r.lastTitle === "string" ? r.lastTitle : null,
    lastAt: Number.isFinite(r.lastAt) ? (r.lastAt as number) : 0,
    chapters,
  };
}

export function readLocalProgress(): LocalProgress {
  if (!isBrowser()) return EMPTY_PROGRESS;
  try {
    const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<LocalProgress>;
    return {
      novel: sanitizeMode(parsed?.novel),
      manhwa: sanitizeMode(parsed?.manhwa),
      sequel: sanitizeMode(parsed?.sequel),
      side: sanitizeMode(parsed?.side),
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function writeLocalProgress(next: LocalProgress) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(LOCAL_PROGRESS_EVENT));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

/** Merge-update (never overwrites existing fields you don't pass). */
export function updateChapterProgress(
  mode: ProgressBucketKey,
  slug: string,
  patch: {
    title?: string;
    position?: number;
    total?: number;
    /** Pass `true` to mark complete. Never un-marks. */
    completed?: boolean;
  },
): void {
  if (!isBrowser() || !slug) return;
  const all = readLocalProgress();
  const bucket = all[mode];
  const prev: ChapterEntry = bucket.chapters[slug] ?? {
    position: 0,
    total: 0,
    completed: false,
    title: "",
    updatedAt: 0,
  };

  const nextPosition =
    typeof patch.position === "number" && Number.isFinite(patch.position)
      ? Math.max(prev.position, Math.max(0, patch.position))
      : prev.position;
  const nextTotal =
    typeof patch.total === "number" && Number.isFinite(patch.total)
      ? Math.max(prev.total, Math.max(0, patch.total))
      : prev.total;
  const nextTitle =
    typeof patch.title === "string" && patch.title ? patch.title : prev.title;
  const now = Date.now();
  const autoCompleted =
    nextTotal > 0 && nextPosition >= nextTotal - 1 ? true : prev.completed;
  const nextCompleted =
    patch.completed === true ? true : autoCompleted;

  let nextMark: ChapterMark | undefined = prev.mark;
  if (nextMark === "unread" && nextPosition > 0) {
    nextMark = undefined;
  }

  const nextEntry: ChapterEntry = {
    position: nextPosition,
    total: nextTotal,
    completed: nextCompleted,
    title: nextTitle,
    updatedAt: now,
  };
  if (nextMark !== undefined) nextEntry.mark = nextMark;

  bucket.chapters[slug] = nextEntry;
  bucket.lastSlug = slug;
  bucket.lastTitle = nextTitle || bucket.lastTitle;
  bucket.lastAt = now;

  writeLocalProgress(all);
}

export function markChapterComplete(
  mode: ProgressBucketKey,
  slug: string,
  title?: string,
): void {
  updateChapterProgress(mode, slug, { completed: true, title });
}

export function clearModeProgress(mode: ProgressBucketKey): void {
  if (!isBrowser()) return;
  const all = readLocalProgress();
  all[mode] = { ...EMPTY_MODE, chapters: {} };
  writeLocalProgress(all);
}

/**
 * 0..1 fraction of a chapter that has been consumed.
 * Falls back to 1 if `completed` is set even without total.
 */
export function entryFraction(entry: ChapterEntry | undefined): number {
  if (!entry) return 0;
  if (entry.completed) return 1;
  if (entry.total <= 0) return 0;
  return Math.min(1, Math.max(0, (entry.position + 1) / entry.total));
}

/**
 * Shelf label: manual `mark` wins; otherwise infer from `completed` / scroll progress.
 */
export function effectiveChapterMark(entry: ChapterEntry | undefined): ChapterMark {
  if (!entry) return "unread";
  if (entry.mark) return entry.mark;
  if (entry.completed) return "read";
  const f = entryFraction(entry);
  if (f > 0 && f < 1) return "reading";
  if (f >= 1) return "read";
  return "unread";
}

/**
 * Progress bar width (0–1): respects manual unread/read; slight hint for "reading" at 0%.
 */
export function displayFractionForEntry(entry: ChapterEntry | undefined): number {
  if (!entry) return 0;
  if (entry.mark === "read") return 1;
  if (entry.mark === "unread") return 0;
  const base = entryFraction(entry);
  if (entry.mark === "reading" && base === 0) return 0.06;
  return base;
}

/** Set shelf from chapter index or reader (persists to localStorage). */
export function setChapterMark(
  mode: ProgressBucketKey,
  slug: string,
  mark: ChapterMark,
  title?: string,
): void {
  if (!isBrowser() || !slug) return;
  const all = readLocalProgress();
  const bucket = all[mode];
  const prev: ChapterEntry = bucket.chapters[slug] ?? {
    position: 0,
    total: 0,
    completed: false,
    title: "",
    updatedAt: 0,
  };
  const t = (typeof title === "string" && title ? title : prev.title) || "";
  const now = Date.now();
  const total = prev.total;

  if (mark === "unread") {
    bucket.chapters[slug] = {
      position: 0,
      total,
      completed: false,
      mark: "unread",
      title: t,
      updatedAt: now,
    };
  } else if (mark === "reading") {
    bucket.chapters[slug] = {
      ...prev,
      completed: false,
      mark: "reading",
      title: t || prev.title,
      updatedAt: now,
    };
  } else {
    const pos = total > 0 ? total - 1 : prev.position;
    bucket.chapters[slug] = {
      ...prev,
      position: pos,
      total,
      completed: true,
      mark: "read",
      title: t || prev.title,
      updatedAt: now,
    };
  }

  bucket.lastSlug = slug;
  bucket.lastTitle = bucket.chapters[slug]!.title || bucket.lastTitle;
  bucket.lastAt = now;
  writeLocalProgress(all);
}
