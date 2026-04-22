"use client";

import type { SegmentKind } from "@prisma/client";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useReader } from "@/context/ReaderContext";
import { updateChapterProgress, type ProgressBucketKey } from "@/lib/local-progress";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useScrollAmbient } from "@/hooks/useScrollAmbient";
import {
  playGlitchSystem,
  playImpact,
  resumeAudio,
  speakLine,
} from "@/lib/audio-engine";
import { moodVars } from "@/lib/mood";
import type {
  ChapterIndexEntry,
  ChapterPayload,
  ColorScheme,
  ViewMode,
} from "@/lib/types";
import { ChapterShelfSelect } from "./ChapterShelfSelect";
import { ConstellationWatcher } from "./ConstellationWatcher";
import { KeywordRichText } from "./KeywordRichText";
import { ParticleField } from "./ParticleField";
import { ScenarioMusic } from "./ScenarioMusic";
import { SettingsPanel } from "./SettingsPanel";
import { StoryWindowCard } from "./StoryWindowCard";
import { ThemeToggle } from "./ThemeToggle";
import {
  isWindowSegmentText,
  parseRichSegment,
  SPACER_SENTINEL,
} from "@/lib/rich-segments";

function progressBucketForChapterSlug(
  slug: string,
  viewMode: ViewMode,
): ProgressBucketKey {
  if (slug.startsWith("orv-seq-ch-")) return "sequel";
  if (slug.startsWith("orv-side-ch-")) return "side";
  return viewMode;
}

type ChapterReaderProps = {
  chapter: ChapterPayload;
  nav: {
    prevSlug: string | null;
    nextSlug: string | null;
    allChapters: ChapterIndexEntry[];
    /**
     * When set, manhwa mode uses only these slugs for prev/next and the chapter
     * jump list (chapters with no map/DB panels are skipped).
     */
    manhwaReadySlugs?: string[];
  };
};

type PanelFrame = {
  id: string;
  segmentIndex: number;
  imageUrl: string;
  alt: string;
};

function segmentHasVisibleText(text: string): boolean {
  if (text === SPACER_SENTINEL) return true;
  return text.replace(/\u00a0/g, " ").trim().length > 0;
}

function segmentClass(kind: SegmentKind, scheme: ColorScheme): string {
  // Novel prose is intentionally quiet — the only interactive / visually
  // distinctive block is the rounded StoryWindowCard (windows). Dialogue
  // and action still get subtle kind-specific accents, but there is no
  // border / background / shadow "card" on bare `[...]`-style text.
  const prose = "text-[0.98em] leading-[1.62]";
  if (scheme === "light") {
    switch (kind) {
      case "dialogue":
        return `italic text-stone-800 ${prose}`;
      case "action":
        return `font-semibold tracking-wide text-stone-900 ${prose}`;
      case "system":
      default:
        return `text-stone-800 ${prose}`;
    }
  }
  switch (kind) {
    case "dialogue":
      return `italic text-zinc-100/95 ${prose}`;
    case "action":
      return `font-semibold tracking-wide text-zinc-100 ${prose}`;
    case "system":
    default:
      return `text-zinc-200/95 ${prose}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ChapterReader({ chapter, nav }: ChapterReaderProps) {
  const router = useRouter();
  const { settings, sessionId, track } = useReader();
  const [active, setActive] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pagedPanelIndex, setPagedPanelIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [restored, setRestored] = useState(false);
  const [chapterQuery, setChapterQuery] = useState("");
  // Raw scroll ratio (0‒1) through the whole page, updated on every
  // scroll. Used to drive the novel-mode progress bar/label so that
  // scrolling past the last segment always lands at exactly 100%
  // even when the IntersectionObserver "active segment" stalls a few
  // paragraphs short of the end.
  const [scrollRatio, setScrollRatio] = useState(0);
  const segsRef = useRef(chapter.segments);
  const rootRef = useRef<HTMLDivElement>(null);
  const novelMode = settings.viewMode === "novel";
  const manhwaMode = settings.viewMode === "manhwa";
  const manhwaPaged = manhwaMode && settings.manhwaPanelLayout === "paged";

  const manhwaReadySet = useMemo(() => {
    const raw = nav.manhwaReadySlugs;
    if (!raw?.length) return null;
    return new Set(raw);
  }, [nav.manhwaReadySlugs]);

  const chapterNavSource = useMemo(() => {
    if (!manhwaMode || !manhwaReadySet) return nav.allChapters;
    return nav.allChapters.filter((c) => manhwaReadySet.has(c.slug));
  }, [manhwaMode, manhwaReadySet, nav.allChapters]);

  const panelFrames = useMemo<PanelFrame[]>(
    () =>
      chapter.manhwaPanels.flatMap((panel, panelIndex) =>
        panel
          ? [
              {
                id: panel.id,
                segmentIndex: panelIndex,
                imageUrl: panel.imageUrl,
                alt: panel.alt,
              },
            ]
          : [],
      ),
    [chapter.manhwaPanels],
  );

  const maxPanelIdx = Math.max(0, panelFrames.length - 1);
  const safePagedIndex = clamp(pagedPanelIndex, 0, maxPanelIdx);
  const activeSegmentIndex = manhwaMode
    ? manhwaPaged
      ? safePagedIndex
      : active
    : active;
  const activePanel = chapter.segments[activeSegmentIndex]?.panel;
  const activePanelFrame = panelFrames[safePagedIndex] ?? null;

  useEffect(() => {
    segsRef.current = chapter.segments;
  }, [chapter.segments]);

  useEffect(() => {
    setActive(0);
    setPagedPanelIndex(0);
    setChromeVisible(true);
    setRestored(false);
    setChapterQuery("");
  }, [chapter.slug, settings.viewMode, settings.manhwaPanelLayout]);

  const filteredChapterNav = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    if (!q) return chapterNavSource;
    return chapterNavSource.filter(
      (entry) =>
        entry.slug.toLowerCase().includes(q) || entry.title.toLowerCase().includes(q),
    );
  }, [chapterNavSource, chapterQuery]);

  const chapterSelectOptions = useMemo(() => {
    const list = filteredChapterNav;
    if (list.some((entry) => entry.slug === chapter.slug)) return list;
    const current = chapterNavSource.find((entry) => entry.slug === chapter.slug);
    return current ? [current, ...list] : list;
  }, [filteredChapterNav, chapterNavSource, chapter.slug]);

  const progressBucket = useMemo(
    () => progressBucketForChapterSlug(chapter.slug, settings.viewMode),
    [chapter.slug, settings.viewMode],
  );

  const { prevSlug: linkPrevSlug, nextSlug: linkNextSlug } = useMemo(() => {
    if (!manhwaMode || !manhwaReadySet) {
      return { prevSlug: nav.prevSlug, nextSlug: nav.nextSlug };
    }
    const i = nav.allChapters.findIndex((c) => c.slug === chapter.slug);
    if (i < 0) {
      return { prevSlug: nav.prevSlug, nextSlug: nav.nextSlug };
    }
    let prev: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const s = nav.allChapters[j]!.slug;
      if (manhwaReadySet.has(s)) {
        prev = s;
        break;
      }
    }
    let next: string | null = null;
    for (let j = i + 1; j < nav.allChapters.length; j++) {
      const s = nav.allChapters[j]!.slug;
      if (manhwaReadySet.has(s)) {
        next = s;
        break;
      }
    }
    return { prevSlug: prev, nextSlug: next };
  }, [
    manhwaMode,
    manhwaReadySet,
    nav.allChapters,
    nav.prevSlug,
    nav.nextSlug,
    chapter.slug,
  ]);

  const vars = moodVars(chapter.mood, chapter.intensity);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
  }, [vars]);

  useScrollAmbient(settings.soundEnabled, chapter.intensity);
  useReadingProgress({
    sessionId,
    chapterSlug: chapter.slug,
    segmentIndex: activeSegmentIndex,
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    const total = manhwaMode
      ? Math.max(panelFrames.length, chapter.manhwaPanels.length)
      : chapter.segments.length;
    if (!chapter.slug || total <= 0) return;
    updateChapterProgress(progressBucket, chapter.slug, {
      title: chapter.title,
      position: activeSegmentIndex,
      total,
    });
  }, [
    progressBucket,
    settings.viewMode,
    manhwaMode,
    chapter.slug,
    chapter.title,
    chapter.segments.length,
    chapter.manhwaPanels.length,
    panelFrames.length,
    activeSegmentIndex,
  ]);

  useEffect(() => {
    if (!sessionId || restored) return;
    let cancelled = false;

    const restore = async () => {
      try {
        const res = await fetch(
          `/api/progress?sessionId=${encodeURIComponent(sessionId)}&chapterSlug=${encodeURIComponent(chapter.slug)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const row = (await res.json()) as
          | { segmentIndex?: number; scrollRatio?: number }
          | null;
        if (cancelled || !row) return;

        const restoredSegmentIndex =
          typeof row.segmentIndex === "number" && Number.isFinite(row.segmentIndex)
            ? row.segmentIndex
            : 0;

        if (manhwaPaged && panelFrames.length > 0) {
          const nextIndex = clamp(restoredSegmentIndex, 0, maxPanelIdx);
          setPagedPanelIndex(nextIndex);
        } else {
          window.setTimeout(() => {
            if (cancelled) return;
            const ratio =
              typeof row.scrollRatio === "number" && Number.isFinite(row.scrollRatio)
                ? clamp(row.scrollRatio, 0, 1)
                : 0;
            const height = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo({ top: Math.max(0, ratio * Math.max(1, height)), behavior: "auto" });
          }, 120);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setRestored(true);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [sessionId, restored, chapter.slug, manhwaPaged, panelFrames, maxPanelIdx]);

  // Raw window scroll ratio → state (novel + manhwa-scroll only;
  // manhwa-paged uses discrete pages and doesn't need it).
  useEffect(() => {
    if (manhwaPaged) return;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) {
        setScrollRatio(1);
        return;
      }
      const ratio = window.scrollY / max;
      setScrollRatio(Math.min(1, Math.max(0, ratio)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [manhwaPaged, chapter.slug, chapter.segments.length]);

  useEffect(() => {
    if (manhwaPaged) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const id = el.dataset.segId ?? el.dataset.panelSegId;
          if (!id) continue;
          if (novelMode) {
            const index = segsRef.current.findIndex((segment) => segment.id === id);
            if (index >= 0) setActive(index);
          } else {
            const index = panelFrames.findIndex((frame) => frame.id === id);
            if (index >= 0) setActive(index);
          }
        }
      },
      { root: null, rootMargin: "-42% 0px -42% 0px", threshold: 0 },
    );

    const selector = novelMode ? "[data-seg-id]" : "[data-panel-seg-id]";
    document.querySelectorAll(selector).forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [chapter.slug, novelMode, manhwaPaged, panelFrames]);

  useEffect(() => {
    if (!manhwaPaged) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") {
        setPagedPanelIndex((current) => Math.max(0, current - 1));
      } else {
        setPagedPanelIndex((current) => Math.min(maxPanelIdx, current + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manhwaPaged, maxPanelIdx]);

  useEffect(() => {
    const segment = chapter.segments[activeSegmentIndex];
    if (!segment || !settings.voiceEnabled) return;
    if (segment.kind === "dialogue" || segment.kind === "system") {
      const line = segment.text.replace(/\[[^\]]+\]/g, "").trim().slice(0, 280);
      if (line) speakLine(line);
    }
  }, [activeSegmentIndex, chapter.segments, settings.voiceEnabled]);

  const openSettings = () => {
    if (settings.soundEnabled) {
      void resumeAudio();
      playGlitchSystem(0.2);
    }
    void track("settings_open");
    setSettingsOpen(true);
    setChromeVisible(true);
  };

  const jumpToSlug = (slug: string) => {
    if (slug && slug !== chapter.slug) {
      void track("chapter_jump_select", { to: slug });
      router.push(withMode(`/chapter/${slug}`));
    }
  };

  const pageBack = () => setPagedPanelIndex((current) => Math.max(0, current - 1));
  const pageForward = () => setPagedPanelIndex((current) => Math.min(maxPanelIdx, current + 1));

  const manhwaHasPanels = panelFrames.length > 0;
  const manhwaTopBarVisible = !manhwaPaged || chromeVisible;
  const withMode = (href: string) =>
    `${href}${href.includes("?") ? "&" : "?"}mode=${settings.viewMode}`;

  const indexHref = useMemo(() => {
    if (chapter.slug.startsWith("orv-seq-ch-")) return "/stories/sequel";
    if (chapter.slug.startsWith("orv-side-ch-")) return "/stories/side";
    return "/chapters";
  }, [chapter.slug]);

  // Novel progress = scroll-based (always hits 100% at the bottom of
  // the page, regardless of how many paragraphs the IntersectionObserver
  // marked active).
  const novelProgress = clamp(scrollRatio, 0, 1);
  const novelPercentLabel = `${Math.round(novelProgress * 100)}%`;
  const manhwaScrollProgress =
    panelFrames.length > 0 ? clamp((active + 1) / panelFrames.length, 0, 1) : 0;
  const manhwaPagedProgress =
    panelFrames.length > 0 ? clamp((safePagedIndex + 1) / panelFrames.length, 0, 1) : 0;

  return (
    <div
      ref={rootRef}
      className={`relative min-h-[100dvh] overflow-x-hidden bg-[var(--reader-bg)] text-[var(--reader-fg)] ${
        manhwaMode ? "touch-manipulation" : ""
      }`}
      style={{
        fontSize: `${settings.textScale * 100}%`,
        ...(settings.screenBrightness < 1
          ? { filter: `brightness(${settings.screenBrightness})` }
          : {}),
      }}
    >
      <ScenarioMusic
        slug={chapter.slug}
        title={chapter.title}
        mood={chapter.mood}
        intensity={chapter.intensity}
        segments={chapter.segments}
        activeIndex={activeSegmentIndex}
      />
      <ConstellationWatcher
        enabled={settings.soundEnabled && novelMode}
        chapterIntensity={chapter.intensity}
      />
      {novelMode ? <ParticleField intensity={chapter.intensity} /> : null}

      {novelMode && activePanel?.imageUrl ? (
        <div
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.14] transition-opacity duration-700"
          style={{
            backgroundImage: `url(${activePanel.imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(28px) saturate(1.2)",
          }}
        />
      ) : null}
      <div
        className={`pointer-events-none fixed inset-0 z-0 ${
          manhwaMode
            ? "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_35%),linear-gradient(180deg,rgba(0,0,0,0.92),rgba(0,0,0,0.98))]"
            : "bg-gradient-to-b from-[var(--reader-bg)] via-[var(--reader-bg)]/90 to-[var(--reader-bg)]"
        }`}
      />

      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          manhwaTopBarVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none"
        } ${
          manhwaMode
            ? "border-b border-[var(--reader-border)] bg-[var(--reader-elevated)]/95 backdrop-blur-xl"
            : "border-b border-[var(--reader-border)] bg-[var(--reader-elevated)]/95 shadow-[0_8px_32px_rgba(0,0,0,0.18)] backdrop-blur-lg"
        }`}
      >
        <div className="mx-auto max-w-7xl px-3 pb-3 pt-[calc(0.75rem+var(--safe-area-top))] sm:px-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--accent)]/80">
                Omniscient Reader&apos;s Viewpoint
              </p>
              <h1 className="truncate text-base font-medium tracking-tight sm:text-lg md:text-xl">
                {chapter.title}
              </h1>
              {manhwaMode ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--reader-muted)]">
                  {settings.manhwaPanelLayout === "paged"
                    ? `Paged view${manhwaHasPanels ? ` · ${safePagedIndex + 1}/${panelFrames.length}` : ""}`
                    : `Scroll view${manhwaHasPanels ? ` · ${panelFrames.length} panels` : ""}`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
              <span className="hidden rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/50 px-3 py-1 font-mono text-[10px] text-[var(--reader-muted)] lg:inline">
                Mood · {chapter.mood} · {chapter.intensity}%
              </span>
              <ChapterShelfSelect
                bucket={progressBucket}
                slug={chapter.slug}
                title={chapter.title}
                variant="inline"
              />
              <ThemeToggle />
              <button
                type="button"
                onClick={openSettings}
                className="rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/40 px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] transition-colors hover:border-[var(--glow)] hover:text-[var(--accent)]"
              >
                Settings
              </button>
              <Link
                href={withMode(indexHref)}
                className="rounded-full border border-[var(--reader-border)] px-3 py-2 font-mono text-[11px] text-[var(--reader-muted)] transition-colors hover:text-[var(--reader-fg)]"
              >
                Index
              </Link>
              <Link
                href={withMode("/")}
                className="rounded-full border border-[var(--reader-border)] px-3 py-2 font-mono text-[11px] text-[var(--reader-muted)] transition-colors hover:text-[var(--reader-fg)]"
              >
                Exit
              </Link>
            </div>
          </div>

          <nav
            className="mt-3 flex flex-col gap-3 border-t border-[var(--reader-border)] pt-3 lg:flex-row lg:items-end lg:gap-4"
            aria-label="Chapter navigation"
          >
            {linkPrevSlug ? (
              <Link
                href={withMode(`/chapter/${linkPrevSlug}`)}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/35 bg-[var(--glow)]/10 px-3 py-2 font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--glow)]/20 lg:min-w-[10rem]"
              >
                Previous chapter
              </Link>
            ) : (
              <span className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/30 px-3 py-2 font-mono text-[11px] text-[var(--reader-muted)] lg:min-w-[10rem]">
                Previous chapter
              </span>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <label className="block">
                <span className="sr-only">Search chapters</span>
                <input
                  type="search"
                  value={chapterQuery}
                  onChange={(event) => setChapterQuery(event.target.value)}
                  placeholder="Find chapter…"
                  className="w-full rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/60 px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] placeholder:text-[var(--reader-muted)] outline-none ring-[var(--accent)]/30 focus:ring-2"
                />
              </label>
              <label className="block min-w-0">
                <span className="sr-only">Jump to chapter</span>
                <select
                  value={chapter.slug}
                  onChange={(event) => jumpToSlug(event.target.value)}
                  className="w-full min-w-0 rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/70 px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] outline-none ring-[var(--accent)]/40 focus:ring-2"
                >
                  {chapterSelectOptions.map((entry) => (
                    <option key={entry.slug} value={entry.slug}>
                      {entry.title.length > 96 ? `${entry.title.slice(0, 93)}...` : entry.title}
                    </option>
                  ))}
                </select>
              </label>
              {chapterQuery.trim() && chapterSelectOptions.length === 0 ? (
                <p className="px-1 font-mono text-[10px] text-[var(--reader-muted)]">No matches.</p>
              ) : null}
            </div>

            {linkNextSlug ? (
              <Link
                href={withMode(`/chapter/${linkNextSlug}`)}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/35 bg-[var(--glow)]/10 px-3 py-2 font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60 hover:bg-[var(--glow)]/20 lg:min-w-[10rem]"
              >
                Next chapter
              </Link>
            ) : (
              <span className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/30 px-3 py-2 font-mono text-[11px] text-[var(--reader-muted)] lg:min-w-[10rem]">
                Next chapter
              </span>
            )}
          </nav>
        </div>
      </header>

      <main
        className={`relative z-10 mx-auto w-full px-3 pt-6 sm:px-4 md:px-6 ${
          novelMode
            ? "max-w-3xl pb-[calc(6.5rem+var(--safe-area-bottom))] md:pt-10"
            : manhwaMode && !manhwaPaged && manhwaHasPanels
              ? "max-w-none px-0 pb-[calc(7.5rem+var(--safe-area-bottom))] pt-0"
              : manhwaMode && manhwaPaged && manhwaHasPanels
                ? "max-w-none px-0 pb-[calc(5.5rem+var(--safe-area-bottom))] pt-0"
                : "max-w-none px-0 pb-[calc(5.5rem+var(--safe-area-bottom))] pt-0"
        }`}
      >
        {novelMode ? (
          <div className="novel-prose space-y-7 md:space-y-9">
            {chapter.segments.map((segment, index) => {
              const showText = segmentHasVisibleText(segment.text);
              // Novel mode is strictly text. Manhwa-style panels that
              // hitchhike on a segment (e.g. illustration-only spacers
              // from older ingests) are skipped entirely — those panels
              // are only displayed in manhwa mode, driven by
              // `chapter.manhwaPanels` / `content/manhwa-map.json`.
              if (!showText) return null;
              const isWindow = isWindowSegmentText(segment.text);

              return (
                <Fragment key={segment.id}>
                  {segment.text === SPACER_SENTINEL ? (
                    <div
                      data-seg-id={segment.id}
                      className="h-2 shrink-0"
                      aria-hidden
                    />
                  ) : isWindow ? (
                    <motion.div
                      data-seg-id={segment.id}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-10%" }}
                      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2) }}
                    >
                      {(() => {
                        const parsed = parseRichSegment(segment.text);
                        if (parsed.kind !== "window") return null;
                        return (
                          <StoryWindowCard
                            title={parsed.title}
                            lines={parsed.body}
                          />
                        );
                      })()}
                    </motion.div>
                  ) : (
                    // Plain prose: no click handler, no hover shadow, no
                    // cursor-pointer — same path for DB and EPUB JSON chapters.
                    <motion.article
                      data-seg-id={segment.id}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-10%" }}
                      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2) }}
                      className={`vn-block px-1 ${segmentClass(segment.kind, settings.colorScheme)}`}
                    >
                      <KeywordRichText
                        text={segment.text}
                        keywords={segment.keywords}
                        segmentKey={segment.id}
                        onKeywordClick={() => void track("keyword_open", { segment: segment.id })}
                      />
                    </motion.article>
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : null}

        {manhwaMode && !manhwaHasPanels ? (
          <div className="mx-auto mt-10 max-w-xl px-4">
            <p className="rounded-2xl border border-[var(--accent)]/35 bg-[var(--glow)]/10 p-4 font-mono text-xs leading-relaxed text-[var(--accent)]">
              No local panels are mapped for this chapter yet. Add this slug to{" "}
              <code className="text-[var(--reader-fg)]">content/manhwa-map.json</code> or scrape and publish
              the chapter panels first.
            </p>
          </div>
        ) : null}

        {manhwaMode && !manhwaPaged && manhwaHasPanels ? (
          <section className="mx-auto flex w-full max-w-[min(100vw,46rem)] flex-col items-center pb-6">
            <div className="mb-4 mt-4 px-4 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--reader-muted)]">
              Scroll strip · tuned for phones, tablets, laptops, and e-readers
            </div>
            <div className="w-full space-y-0 bg-black/30 pb-6">
              {panelFrames.map((frame, index) => (
                <figure
                  key={frame.id}
                  data-panel-seg-id={frame.id}
                  className={`scroll-mt-28 overflow-hidden bg-black ${
                    index === 0 ? "rounded-t-[1.5rem]" : ""
                  } ${index === panelFrames.length - 1 ? "rounded-b-[1.5rem]" : ""} ${
                    index === active
                      ? "shadow-[0_0_32px_var(--glow)] ring-1 ring-[var(--accent)]/30"
                      : ""
                  }`}
                >
                  <Image
                    src={frame.imageUrl}
                    alt={frame.alt}
                    width={1600}
                    height={2400}
                    className="h-auto w-full object-contain"
                    sizes="(min-width: 1200px) 46rem, 100vw"
                    priority={index < 2}
                    unoptimized
                  />
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {manhwaMode && manhwaPaged && manhwaHasPanels ? (
          <section className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-2 pb-[calc(4.75rem+var(--safe-area-bottom))] pt-2 sm:px-4">
            <div
              className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 h-32 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${
                chromeVisible ? "opacity-100" : "opacity-0"
              }`}
            />

            <div className="relative mx-auto flex w-full max-w-[min(100vw,68rem)] flex-1 items-center justify-center">
              <button
                type="button"
                aria-label="Previous panel"
                onClick={pageBack}
                disabled={safePagedIndex <= 0}
                className="absolute inset-y-0 left-0 z-20 hidden w-[22%] cursor-pointer bg-transparent md:block disabled:cursor-default"
              />
              <button
                type="button"
                aria-label="Toggle controls"
                onClick={() => setChromeVisible((visible) => !visible)}
                className="absolute inset-y-0 left-[22%] right-[22%] z-20 hidden bg-transparent md:block"
              />
              <button
                type="button"
                aria-label="Next panel"
                onClick={pageForward}
                disabled={safePagedIndex >= maxPanelIdx}
                className="absolute inset-y-0 right-0 z-20 hidden w-[22%] cursor-pointer bg-transparent md:block disabled:cursor-default"
              />

              {activePanelFrame ? (
                <motion.div
                  key={activePanelFrame.id}
                  initial={{ opacity: 0.2, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  data-panel-seg-id={activePanelFrame.id}
                  onClick={() => setChromeVisible((visible) => !visible)}
                  className="relative flex min-h-[calc(100svh-5rem-var(--safe-area-top)-var(--safe-area-bottom))] w-full items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/55 shadow-[0_0_40px_rgba(0,0,0,0.45)] ring-1 ring-[var(--accent)]/25"
                >
                  <Image
                    src={activePanelFrame.imageUrl}
                    alt={activePanelFrame.alt}
                    width={1600}
                    height={2400}
                    className="max-h-[calc(100svh-5rem-var(--safe-area-top)-var(--safe-area-bottom))] h-auto w-auto max-w-full object-contain"
                    sizes="100vw"
                    priority
                    unoptimized
                  />
                </motion.div>
              ) : null}
            </div>

            <div
              className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+var(--safe-area-bottom))] transition-all duration-300 sm:px-4 ${
                chromeVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
              }`}
            >
              <div className="mx-auto max-w-5xl space-y-2 rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-elevated)]/95 px-3 py-2 backdrop-blur-xl">
                <div className="h-0.5 overflow-hidden rounded-full bg-[var(--reader-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                    style={{ width: `${manhwaPagedProgress * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                  {linkPrevSlug ? (
                    <Link
                      href={withMode(`/chapter/${linkPrevSlug}`)}
                      className="rounded-full border border-[var(--reader-border)] px-2 py-1.5 font-mono text-[10px] text-[var(--accent)] hover:border-[var(--accent)]/40"
                    >
                      Ch ←
                    </Link>
                  ) : (
                    <span className="rounded-full border border-[var(--reader-border)] px-2 py-1.5 font-mono text-[10px] text-[var(--reader-muted)]">
                      Ch ←
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={safePagedIndex <= 0}
                    onClick={pageBack}
                    className="rounded-full border border-[var(--reader-border)] px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] transition-colors hover:border-[var(--accent)]/50 disabled:opacity-35"
                  >
                    Panel ←
                  </button>
                  <div className="min-w-0 text-center font-mono text-[11px] text-[var(--reader-muted)]">
                    <div className="truncate">
                      {safePagedIndex + 1} / {panelFrames.length}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--reader-muted)]/80">
                      Tap image · hide
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={safePagedIndex >= maxPanelIdx}
                    onClick={pageForward}
                    className="rounded-full border border-[var(--reader-border)] px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] transition-colors hover:border-[var(--accent)]/50 disabled:opacity-35"
                  >
                    → Panel
                  </button>
                  {linkNextSlug ? (
                    <Link
                      href={withMode(`/chapter/${linkNextSlug}`)}
                      className="rounded-full border border-[var(--reader-border)] px-2 py-1.5 font-mono text-[10px] text-[var(--accent)] hover:border-[var(--accent)]/40"
                    >
                      Ch →
                    </Link>
                  ) : (
                    <span className="rounded-full border border-[var(--reader-border)] px-2 py-1.5 font-mono text-[10px] text-[var(--reader-muted)]">
                      Ch →
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <footer className="mx-auto mt-10 max-w-5xl px-4 font-mono text-[11px] text-[var(--reader-muted)]">
          Content source depends on your ingest and local panel library. Support official releases.
        </footer>
      </main>

      {novelMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--reader-border)] bg-[var(--reader-elevated)]/96 px-3 pb-[calc(0.65rem+var(--safe-area-bottom))] pt-2 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            <div
              className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--reader-border)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(novelProgress * 100)}
              aria-label="Progress through this chapter"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
                style={{ width: `${novelProgress * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {linkPrevSlug ? (
                <Link
                  href={withMode(`/chapter/${linkPrevSlug}`)}
                  className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/50"
                >
                  ← Prev chapter
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--reader-muted)]">
                  Start
                </span>
              )}
              <span
                className="shrink-0 rounded-full border border-[var(--reader-border)] px-2 py-2 font-mono text-[10px] text-[var(--reader-muted)]"
                aria-label={`Read ${novelPercentLabel} of this chapter`}
              >
                {novelPercentLabel}
              </span>
              {linkNextSlug ? (
                <Link
                  href={withMode(`/chapter/${linkNextSlug}`)}
                  className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/50"
                >
                  Next chapter →
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--reader-muted)]">
                  End
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {manhwaMode && !manhwaPaged && manhwaHasPanels ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--reader-border)] bg-[var(--reader-elevated)]/96 px-3 pb-[calc(0.65rem+var(--safe-area-bottom))] pt-2 backdrop-blur-xl">
          <div className="mx-auto max-w-[min(100vw,46rem)]">
            <div
              className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--reader-border)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(manhwaScrollProgress * 100)}
              aria-label="Progress through panels in this chapter"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${manhwaScrollProgress * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {linkPrevSlug ? (
                <Link
                  href={withMode(`/chapter/${linkPrevSlug}`)}
                  className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/50"
                >
                  ← Prev chapter
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--reader-muted)]">
                  Start
                </span>
              )}
              <span className="shrink-0 rounded-full border border-[var(--reader-border)] px-2 py-2 font-mono text-[10px] text-[var(--reader-muted)]">
                {active + 1}/{panelFrames.length}
              </span>
              {linkNextSlug ? (
                <Link
                  href={withMode(`/chapter/${linkNextSlug}`)}
                  className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--accent)] transition-colors hover:border-[var(--accent)]/50"
                >
                  Next chapter →
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate rounded-full border border-[var(--reader-border)] px-3 py-2 text-center font-mono text-[11px] text-[var(--reader-muted)]">
                  End
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Remounts when view mode changes so observers and panel index stay aligned. */
export function ChapterReaderRoot(props: ChapterReaderProps) {
  const { settings } = useReader();
  return (
    <ChapterReader
      key={`${props.chapter.slug}-${settings.viewMode}-${settings.manhwaPanelLayout}-${settings.colorScheme}`}
      {...props}
    />
  );
}
