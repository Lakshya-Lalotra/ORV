"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import {
  BITTU_COVER_ORV_WEBP,
  ORV_READER_WORDMARK_PNG,
  ORV_WEBTOON_KEY_VISUAL_JPG,
} from "@/lib/bittu-orv-assets";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReader } from "@/context/ReaderContext";

export function HomeIntro() {
  const { settings, track } = useReader();

  useEffect(() => {
    void track("landing_view");
  }, [track]);

  const modeLabel = settings.viewMode === "manhwa" ? "Manhwa" : "Novel";
  const chaptersHref = `/chapters?mode=${settings.viewMode}`;
  const heroCoverSrc =
    settings.viewMode === "manhwa" ? ORV_WEBTOON_KEY_VISUAL_JPG : BITTU_COVER_ORV_WEBP;
  const heroCoverAlt =
    settings.viewMode === "manhwa"
      ? "Omniscient Reader's Viewpoint webtoon key visual"
      : "Omniscient Reader's Viewpoint cover illustration";

  return (
    <div className="orv-shell relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,170,92,0.14),transparent_22%),radial-gradient(circle_at_80%_15%,rgba(255,255,255,0.05),transparent_20%)]" />
      <div
        aria-hidden
        className="orv-wordmark-bg pointer-events-none absolute inset-y-0 left-[3%] hidden md:flex items-center justify-center"
      >
        <Image
          src={ORV_READER_WORDMARK_PNG}
          alt=""
          width={360}
          height={960}
          className="h-[86vh] w-auto object-contain"
          priority
        />
      </div>
      <div
        aria-hidden
        className="orv-wordmark-bg pointer-events-none absolute inset-y-0 right-[-4%] flex items-center justify-center md:hidden"
      >
        <Image
          src={ORV_READER_WORDMARK_PNG}
          alt=""
          width={200}
          height={540}
          className="h-[72vh] w-auto object-contain"
          priority
        />
      </div>
      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="orv-panel relative z-10 w-full max-w-6xl overflow-hidden rounded-[2rem] px-6 py-8 text-left shadow-[0_32px_120px_rgba(0,0,0,0.35)] md:px-12 md:py-12"
      >
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.95fr] items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.38em] text-[var(--accent)]/90">
              STAR STREAM · {modeLabel.toUpperCase()}
            </p>
            <h1 className="mt-5 font-serif text-4xl font-medium leading-tight tracking-tight text-[var(--foreground)] md:text-6xl">
              Omniscient Reader&apos;s Viewpoint
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--reader-muted)] md:text-base">
              Enter the reading shell rebuilt for chapter continuity, atmosphere, and long sessions.
              Keep the novel pacing for uninterrupted prose, or switch to the visual route for a
              cinematic manhwa experience.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href={chaptersHref}
                onClick={() => void track("enter_reader")}
                className="orv-chip group relative inline-flex overflow-hidden rounded-full px-10 py-4 font-mono text-sm shadow-[0_0_40px_rgba(214,170,92,0.12)] transition-all hover:shadow-[0_0_56px_rgba(214,170,92,0.18)]"
              >
                <span className="relative z-10">Browse chapters</span>
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.6 }}
                />
              </Link>
              <Link
                href={`/?mode=${settings.viewMode}`}
                className="inline-flex rounded-full border border-[var(--reader-border)] px-6 py-4 font-mono text-sm text-[var(--reader-muted)] transition-colors hover:border-[var(--accent)]/30 hover:text-[var(--foreground)]"
              >
                Change reading mode
              </Link>
            </div>

            <div className="mt-6 rounded-2xl border border-[var(--hairline)] bg-[var(--overlay-mid)] px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]/85">
                Reading materials
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--reader-muted)]">
                Choose novel for immersive prose rhythm, or manhwa for image-led pacing and visual
                flow.
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
            <Image
              src={heroCoverSrc}
              alt={heroCoverAlt}
              width={900}
              height={1200}
              className="h-full w-full object-cover"
              sizes="(max-width: 768px) 100vw, 35vw"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
            <div className="absolute left-6 bottom-6 right-6">
              <span className="orv-chip inline-flex rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em]">
                {settings.viewMode === "manhwa" ? "Webtoon key visual" : "Novel cover"}
              </span>
              <p className="mt-4 max-w-[18rem] font-serif text-2xl font-medium tracking-tight text-white">
                {settings.viewMode === "manhwa"
                  ? "Illustrated route with your panel map."
                  : "Typography-first long-form reading."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 text-left md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]/85">
              Current route
            </p>
            <p className="mt-3 font-serif text-2xl text-[var(--foreground)]">{modeLabel}</p>
          </div>
          <div className="rounded-[1.5rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]/85">
              Content source
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--reader-muted)]">
              EPUB chapters for prose and local panel mapping for visual story playback.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent)]/85">
              Session
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--reader-muted)]">
              Your selected route is preserved while moving between index and chapter pages.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
