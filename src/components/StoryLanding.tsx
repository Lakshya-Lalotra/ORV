"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReader } from "@/context/ReaderContext";
import { useLocalProgress } from "@/hooks/useLocalProgress";
import {
  storyMeta,
  storyMetaForSeries,
  readingStatusPillClass,
  type StorySeriesId,
} from "@/lib/story-meta";
import {
  displayFractionForEntry,
  effectiveChapterMark,
  type ChapterMark,
  type ProgressBucketKey,
} from "@/lib/local-progress";
import type { ChapterIndexRow } from "@/lib/types";
import { ChapterShelfSelect } from "@/components/ChapterShelfSelect";
import { OrvLibraryWordmark } from "@/components/OrvLibraryWordmark";

/**
 * Story landing page — one per reading mode (novel / manhwa).
 *
 * Mirrors the shape of https://orv.pages.dev/stories/orv/:
 *   ┌─ cover ─┬──────────────────────────────┐
 *   │         │ eyebrow · title              │
 *   │         │ author / chapters / status   │
 *   │         │ description                  │
 *   │         │ [Continue where you left]    │
 *   │         │ [Start from chapter one]     │
 *   └─────────┴──────────────────────────────┘
 *   ┌── chapter grid ─────────────────────────┐
 *   │ search · sort                          │
 *   │ chapter cards with read/progress marks │
 *   └────────────────────────────────────────┘
 *
 * Design tokens (gold accent, `orv-panel`, serif heads, mono labels)
 * come from the existing system — no new palette introduced.
 *
 * Progress marks pull from `localStorage` via `useLocalProgress()` so
 * freshly-read chapters reflect immediately without a round-trip.
 */

type Props = {
  /** Full, merged chapter index (DB + map) passed from the server. */
  chapters: ChapterIndexRow[];
  /**
   * Which story this landing represents. Defaults to the main-story
   * novel/manhwa pairing driven by ReaderContext. Pass "sequel" to
   * render the side-story landing with its own meta + progress bucket
   * and reader base path.
   */
  series?: StorySeriesId;
  /**
   * From `/chapters` only: slugs that have manhwa panels. In manhwa mode the grid
   * lists only these chapters.
   */
  manhwaReadySlugs?: string[];
};

const moodLabel: Record<string, string> = {
  calm: "Calm",
  tension: "Tension",
  chaos: "Chaos",
};

type SortKey =
  | "order-asc"
  | "order-desc"
  | "title-asc"
  | "title-desc"
  | "read-first"
  | "unread-first";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "order-asc", label: "Chapter order 1 to end" },
  { value: "order-desc", label: "Chapter order end to 1" },
  { value: "title-asc", label: "Title A to Z" },
  { value: "title-desc", label: "Title Z to A" },
  { value: "read-first", label: "Progress: most read first" },
  { value: "unread-first", label: "Progress: untouched first" },
];

function SortListbox({
  value,
  onChange,
  manhwaMode,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
  /** Hide title A–Z / Z–A (novel-only; manhwa cards use chapter numbers only). */
  manhwaMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = useMemo(
    () =>
      manhwaMode
        ? SORT_OPTIONS.filter(
            (o) => o.value !== "title-asc" && o.value !== "title-desc",
          )
        : SORT_OPTIONS,
    [manhwaMode],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0]!;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--overlay-mid)] px-4 py-3 text-left font-sans text-sm text-[var(--reader-fg)] outline-none ring-[var(--accent)]/25 focus-visible:border-[var(--accent)]/35 focus-visible:ring-2"
      >
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        <span
          aria-hidden
          className="shrink-0 text-[10px] text-[var(--reader-muted)]"
        >
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[80] max-h-64 overflow-auto rounded-xl border border-[var(--hairline-strong)] bg-[var(--reader-elevated)] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`w-full px-4 py-2.5 text-left font-sans text-sm transition-colors ${
                    selected
                      ? "bg-[var(--accent)]/20 font-medium text-[var(--reader-fg)]"
                      : "text-[var(--reader-fg)] hover:bg-[var(--overlay-mid)]"
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

type ChapterWithProgress = ChapterIndexRow & {
  /** Bar width + sort key (respects manual unread/read). */
  fraction: number;
  shelf: ChapterMark;
  completed: boolean;
  position: number;
  total: number;
  isLastRead: boolean;
};

function matchesQuery(ch: ChapterIndexRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const blob = `${ch.title} ${ch.slug} ${ch.order}`.toLowerCase();
  return blob.includes(q);
}

function sortChapters(
  list: ChapterWithProgress[],
  key: SortKey,
): ChapterWithProgress[] {
  const next = [...list];
  switch (key) {
    case "order-desc":
      return next.sort((a, b) => b.order - a.order);
    case "title-asc":
      return next.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
    case "title-desc":
      return next.sort((a, b) =>
        b.title.localeCompare(a.title, undefined, { sensitivity: "base" }),
      );
    case "read-first":
      return next.sort((a, b) => {
        if (a.fraction !== b.fraction) return b.fraction - a.fraction;
        return a.order - b.order;
      });
    case "unread-first":
      return next.sort((a, b) => {
        if (a.fraction !== b.fraction) return a.fraction - b.fraction;
        return a.order - b.order;
      });
    case "order-asc":
    default:
      return next.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });
  }
}

export function StoryLanding({ chapters, series, manhwaReadySlugs }: Props) {
  const { settings } = useReader();
  const isMainSeries = !series || series === "novel" || series === "manhwa";
  const mode = settings.viewMode;
  const meta = series
    ? storyMetaForSeries(series)
    : storyMeta(mode);
  const progress = useLocalProgress();
  const bucketKey = series ?? mode;
  const bucket = progress[bucketKey];

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("order-asc");

  const chaptersWithProgress = useMemo<ChapterWithProgress[]>(() => {
    return chapters.map((ch) => {
      const entry = bucket.chapters[ch.slug];
      const fraction = displayFractionForEntry(entry);
      const shelf = effectiveChapterMark(entry);
      return {
        ...ch,
        fraction,
        shelf,
        completed: shelf === "read",
        position: entry?.position ?? 0,
        total: entry?.total ?? 0,
        isLastRead: bucket.lastSlug === ch.slug,
      };
    });
  }, [chapters, bucket]);

  const manhwaMode = isMainSeries && mode === "manhwa";

  const manhwaReadySet = useMemo(
    () =>
      manhwaReadySlugs && manhwaReadySlugs.length > 0
        ? new Set(manhwaReadySlugs)
        : null,
    [manhwaReadySlugs],
  );

  const chaptersForUi = useMemo(() => {
    if (!manhwaMode || !manhwaReadySet) return chaptersWithProgress;
    return chaptersWithProgress.filter((c) => manhwaReadySet.has(c.slug));
  }, [chaptersWithProgress, manhwaMode, manhwaReadySet]);

  const totalCount = chaptersForUi.length;
  const startedCount = chaptersForUi.filter((c) => c.shelf === "reading").length;
  const completedCount = chaptersForUi.filter((c) => c.shelf === "read").length;
  const overallFraction = totalCount
    ? chaptersForUi.reduce((sum, c) => sum + c.fraction, 0) / totalCount
    : 0;

  const lastReadChapter =
    bucket.lastSlug != null
      ? chaptersForUi.find((c) => c.slug === bucket.lastSlug) ?? null
      : null;

  const firstChapter = useMemo(
    () =>
      [...chaptersForUi].sort((a, b) => a.order - b.order)[0] ?? null,
    [chaptersForUi],
  );
  // Derive the effective sort inline instead of mirroring it into state:
  // this removes a cascading setState-in-effect (flagged by React's
  // `set-state-in-effect` rule) and preserves the reader's saved
  // `title-*` preference when they hop back to novel mode.
  const effectiveSortKey: SortKey =
    manhwaMode && (sortKey === "title-asc" || sortKey === "title-desc")
      ? "order-asc"
      : sortKey;

  const visible = useMemo(() => {
    const filtered = chaptersForUi.filter((ch) => matchesQuery(ch, query));
    return sortChapters(filtered, effectiveSortKey);
  }, [chaptersForUi, query, effectiveSortKey]);
  const modeQuery = isMainSeries ? `?mode=${mode}` : "";

  const chapterHref = (slug: string) => {
    if (series === "sequel" || series === "side") {
      return `${meta.chapterBase}/${slug}`;
    }
    return `${meta.chapterBase}/${slug}${modeQuery}`;
  };

  const continueHref = lastReadChapter ? chapterHref(lastReadChapter.slug) : null;
  const startHref = firstChapter ? chapterHref(firstChapter.slug) : null;

  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.set("[data-gs='cover']", { opacity: 0, y: 28, scale: 0.96, filter: "blur(6px)" });
      gsap.set("[data-gs='hero-eyebrow']", { opacity: 0, y: 10 });
      gsap.set("[data-gs='hero-title']", { opacity: 0, y: 18 });
      gsap.set("[data-gs='hero-meta'] > div", { opacity: 0, y: 10 });
      gsap.set("[data-gs='hero-desc']", { opacity: 0, y: 12 });
      gsap.set("[data-gs='hero-cta'] > *", { opacity: 0, y: 12 });
      gsap.set("[data-gs='overall']", { opacity: 0, y: 10 });
      gsap.set("[data-gs='index-head']", { opacity: 0, y: 10 });
      gsap.set("[data-gs='ch-card']", { opacity: 0, y: 18 });
      gsap.set("[data-gs='overall-bar-fill']", { scaleX: 0, transformOrigin: "0% 50%" });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to("[data-gs='cover']", { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.85 })
        .to("[data-gs='hero-eyebrow']", { opacity: 1, y: 0, duration: 0.4 }, "-=0.55")
        .to("[data-gs='hero-title']", { opacity: 1, y: 0, duration: 0.55 }, "-=0.35")
        .to(
          "[data-gs='hero-meta'] > div",
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.06 },
          "-=0.4",
        )
        .to("[data-gs='hero-desc']", { opacity: 1, y: 0, duration: 0.45 }, "-=0.35")
        .to(
          "[data-gs='hero-cta'] > *",
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.08 },
          "-=0.3",
        )
        .to("[data-gs='overall']", { opacity: 1, y: 0, duration: 0.4 }, "-=0.2")
        .to(
          "[data-gs='overall-bar-fill']",
          { scaleX: 1, duration: 0.9, ease: "power2.out" },
          "-=0.3",
        )
        .to("[data-gs='index-head']", { opacity: 1, y: 0, duration: 0.4 }, "-=0.4")
        .to(
          "[data-gs='ch-card']",
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.035 },
          "-=0.2",
        );

      return () => {
        tl.kill();
      };
    },
    { scope: rootRef, dependencies: [bucketKey] },
  );

  return (
    <div
      ref={rootRef}
      className="orv-shell min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]"
    >
      <OrvLibraryWordmark layout="scroll" />

      <header className="relative z-10 overflow-hidden border-b border-[var(--hairline)] bg-[var(--fill-mid)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left_top,rgba(214,170,92,0.18),transparent_55%)]" />

        <div className="relative mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="orv-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--reader-muted)] hover:text-[var(--foreground)]"
            >
              <span aria-hidden>←</span> Story library
            </Link>
            <div className="flex items-center gap-2">
              {isMainSeries ? (
                <Link
                  href={`/?mode=${mode === "novel" ? "manhwa" : "novel"}`}
                  className="rounded-full border border-[var(--hairline)] bg-[var(--overlay-mid)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--reader-muted)] transition-colors hover:border-[var(--accent)]/35 hover:text-[var(--foreground)]"
                >
                  Switch to {mode === "novel" ? "manhwa" : "novel"}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:items-start">
            <div data-gs="cover" className="mx-auto w-full max-w-[260px] lg:mx-0">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.75rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] shadow-[0_26px_70px_rgba(0,0,0,0.35)]">
                <Image
                  src={meta.cover}
                  alt={meta.coverAlt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 60vw, 260px"
                  priority
                  unoptimized
                />
                {/* Bottom-to-top gradient stays dark-on-both-themes — the
                    cover art itself is photographic, so we want the
                    chips to sit on a dark scrim regardless of page bg. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                  <span className={readingStatusPillClass(meta.status)}>
                    {meta.status}
                  </span>
                  {overallFraction > 0 ? (
                    <span className="rounded-full bg-black/60 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-white/85">
                      {Math.round(overallFraction * 100)}%
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <p
                data-gs="hero-eyebrow"
                className="font-mono text-[10px] uppercase tracking-[0.38em] text-[var(--accent)]/90"
              >
                {meta.eyebrow}
              </p>
              <h1
                data-gs="hero-title"
                className="mt-3 font-serif text-4xl font-medium leading-[1.08] tracking-tight md:text-5xl"
              >
                {meta.title}
              </h1>

              <dl
                data-gs="hero-meta"
                className="mt-5 grid gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--reader-muted)] sm:grid-cols-3"
              >
                <div className="flex flex-col gap-1">
                  <dt className="text-[var(--accent)]/80">Author</dt>
                  <dd className="text-[var(--foreground)] normal-case tracking-normal">
                    {meta.author}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-[var(--accent)]/80">Chapters</dt>
                  <dd className="text-[var(--foreground)] normal-case tracking-normal">
                    {meta.chapterLabel}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-[var(--accent)]/80">Status</dt>
                  <dd className="normal-case tracking-normal">
                    <span className={readingStatusPillClass(meta.status)}>
                      {meta.status}
                    </span>
                  </dd>
                </div>
              </dl>

              <p
                data-gs="hero-desc"
                className="mt-6 max-w-2xl text-sm leading-7 text-[var(--reader-body)] md:text-base"
              >
                {meta.description}
              </p>

              <div data-gs="hero-cta" className="mt-8 flex flex-wrap items-center gap-3">
                {continueHref && lastReadChapter ? (
                  <Link
                    href={continueHref}
                    className="group relative inline-flex items-center gap-3 rounded-full border border-[var(--accent)]/55 bg-[var(--glow)]/15 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent)] shadow-[0_0_32px_rgba(214,170,92,0.12)] transition-all hover:border-[var(--accent)] hover:bg-[var(--glow)]/25 hover:text-[var(--foreground)] hover:shadow-[0_0_48px_rgba(214,170,92,0.22)]"
                  >
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--accent)] group-hover:bg-[var(--foreground)]" />
                    <span className="flex flex-col items-start leading-tight normal-case tracking-normal">
                      <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]/80">
                        Continue where you left off
                      </span>
                      <span className="font-serif text-base text-[var(--foreground)]">
                        {manhwaMode
                          ? `Ch. ${lastReadChapter.order}`
                          : `Ch. ${lastReadChapter.order} · ${lastReadChapter.title}`}
                      </span>
                    </span>
                  </Link>
                ) : null}
                {startHref ? (
                  <Link
                    href={startHref}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline-strong)] bg-[var(--overlay-mid)] px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--reader-body)] transition-colors hover:border-[var(--accent)]/45 hover:bg-[var(--overlay-strong)] hover:text-[var(--foreground)]"
                  >
                    {lastReadChapter ? "Start from the beginning" : `${meta.verb} from Chapter 1`}
                  </Link>
                ) : null}
              </div>

              {totalCount > 0 ? (
                <div data-gs="overall" className="mt-7 max-w-xl">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--reader-muted)]">
                    <span>
                      {completedCount} finished · {startedCount} in progress ·{" "}
                      {totalCount - completedCount - startedCount} untouched
                    </span>
                    <span>{Math.round(overallFraction * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--overlay-mid)]">
                    <div
                      data-gs="overall-bar-fill"
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent)]/55 via-[var(--accent)] to-[var(--accent)]/80"
                      style={{ width: `${Math.max(2, overallFraction * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <section
          data-gs="index-head"
          className="orv-panel relative z-20 rounded-[1.5rem] px-4 py-4 md:px-5"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_15rem]">
            <label className="min-w-0 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--reader-muted)]">
              <span className="mb-2 block text-[var(--accent)]/80">Search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, slug, or chapter number"
                autoComplete="off"
                className="w-full rounded-full border border-[var(--hairline)] bg-[var(--overlay-mid)] px-4 py-3 font-sans text-sm text-[var(--reader-fg)] placeholder:text-[var(--reader-muted)] outline-none ring-[var(--accent)]/25 focus:border-[var(--accent)]/35 focus:ring-2"
              />
            </label>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--reader-muted)]">
              <span className="mb-2 block text-[var(--accent)]/80">Sort</span>
              <SortListbox
                value={effectiveSortKey}
                onChange={setSortKey}
                manhwaMode={manhwaMode}
              />
            </div>
          </div>

          <p className="mt-4 font-mono text-[11px] text-[var(--reader-muted)]">
            Showing {visible.length} of {totalCount}
            {query.trim() ? ` matching "${query.trim()}"` : ""}
          </p>
        </section>

        {visible.length === 0 ? (
          <div className="orv-panel relative z-0 mt-6 rounded-[1.75rem] px-6 py-10 text-center font-mono text-sm text-[var(--reader-muted)]">
            No chapters match your search. Try another title, slug, or number.
          </div>
        ) : (
          <ul className="relative z-0 mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((chapter) => (
              <li key={chapter.id}>
                <ChapterCard
                  chapter={chapter}
                  href={chapterHref(chapter.slug)}
                  manhwaMode={manhwaMode}
                  unitLabel={meta.unitLabel}
                  bucketKey={bucketKey}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.32em] text-[var(--reader-muted)]">
          Progress tracked locally on this device.
        </p>
      </main>
    </div>
  );
}

function ChapterCard({
  chapter,
  href,
  manhwaMode,
  unitLabel,
  bucketKey,
}: {
  chapter: ChapterWithProgress;
  href: string;
  manhwaMode: boolean;
  unitLabel: string;
  bucketKey: ProgressBucketKey;
}) {
  const pct = Math.round(chapter.fraction * 100);
  const started = chapter.fraction > 0;
  const showBar = manhwaMode || started;

  const statusChip =
    chapter.shelf === "read"
      ? {
          label: "Read",
          tone:
            "text-emerald-600 dark:text-emerald-300 border-emerald-500/50 bg-emerald-400/15",
        }
      : chapter.shelf === "reading"
        ? {
            label: pct > 0 ? `${pct}%` : "Reading",
            tone:
              "text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--glow)]/15",
          }
        : {
            label: "Unread",
            tone:
              "text-[var(--reader-muted)] border-[var(--hairline)] bg-[var(--overlay-mid)]",
          };

  const cardRef = useRef<HTMLAnchorElement>(null);
  const onEnter = () => {
    gsap.to(cardRef.current, {
      y: -3,
      scale: 1.01,
      duration: 0.28,
      ease: "power2.out",
      overwrite: "auto",
    });
  };
  const onLeave = () => {
    gsap.to(cardRef.current, {
      y: 0,
      scale: 1,
      duration: 0.35,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  return (
    <div
      data-gs="ch-card"
      className={`orv-panel group relative overflow-hidden rounded-[1.5rem] transition-[border-color,background-color,box-shadow] hover:border-[var(--accent)]/35 hover:bg-[var(--overlay-soft)] hover:shadow-[0_0_40px_rgba(214,170,92,0.1)] ${
        chapter.isLastRead
          ? "border-[var(--accent)]/45 shadow-[0_0_32px_rgba(214,170,92,0.14)]"
          : ""
      }`}
    >
      {chapter.isLastRead ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[var(--accent)]/80 via-[var(--accent)]/40 to-transparent"
        />
      ) : null}

      <Link
        ref={cardRef}
        href={href}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className="block p-5"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {manhwaMode ? (
            <h2 className="font-serif text-lg font-medium leading-snug tracking-tight text-[var(--reader-fg)] transition-colors group-hover:text-[var(--foreground)]">
              Ch. {chapter.order}
            </h2>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]/80">
                  Chapter {chapter.order}
                </span>
                {chapter.shelf === "read" ? (
                  <span
                    aria-hidden
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] text-emerald-300"
                    title="Read"
                  >
                    ✓
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1.5 line-clamp-2 font-serif text-lg font-medium leading-snug tracking-tight text-[var(--reader-fg)] transition-colors group-hover:text-[var(--foreground)]">
                {chapter.title}
              </h2>
            </>
          )}
          <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-[var(--reader-muted)]">
            {moodLabel[chapter.mood] ?? chapter.mood} · {chapter.intensity}% ·{" "}
            {chapter.segmentCount} {unitLabel}
          </p>
        </div>
        <span
          className={`orv-chip shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] ${statusChip.tone}`}
        >
          {statusChip.label}
        </span>
      </div>

      {showBar ? (
        <div className="mt-4">
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--overlay-mid)]">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                chapter.shelf === "read"
                  ? "bg-gradient-to-r from-emerald-400/70 via-emerald-300 to-emerald-400/70"
                  : "bg-gradient-to-r from-[var(--accent)]/40 via-[var(--accent)] to-[var(--accent)]/70"
              }`}
              style={{ width: `${Math.max(2, chapter.fraction * 100)}%` }}
            />
          </div>
          {manhwaMode && chapter.total > 0 && chapter.shelf !== "read" ? (
            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--reader-muted)]">
              Panel {chapter.position + 1} of {chapter.total}
            </p>
          ) : null}
        </div>
      ) : null}

      {chapter.isLastRead && chapter.shelf !== "read" ? (
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.26em] text-[var(--accent)]/85">
          ▸ Last read · tap to resume
        </p>
      ) : null}
      </Link>

      <div
        className="border-t border-[var(--hairline)] bg-[var(--overlay-mid)]/40 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ChapterShelfSelect
          bucket={bucketKey}
          slug={chapter.slug}
          title={chapter.title}
        />
      </div>
    </div>
  );
}
