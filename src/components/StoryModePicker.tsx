"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ORV_COVER_WEBP,
  ONESHOT_COVER_WEBP,
  SEQUEL_COVER_WEBP,
  STARFIELD_JPG,
  ORV_OFFICIAL_MARK_PNG,
  ORV_WEBTOON_KEY_VISUAL_JPG,
} from "@/lib/orv-library-assets";
import { OrvLibraryWordmark } from "@/components/OrvLibraryWordmark";
import { useReader } from "@/context/ReaderContext";
import { readingStatusPillClass, type StoryStatus } from "@/lib/story-meta";
import type { ViewMode } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Story library (`/`) — fits in a single viewport (`h-[100dvh]`,
 * `overflow-hidden`). Sizes are clamped/breakpoint-scaled so nothing
 * scrolls on mobile, tablet, or desktop — the four covers stay the
 * focal element.
 *
 * Motion is driven by GSAP via `useGSAP`:
 *   - header + hero copy fade up, staggered
 *   - wiki mark scales + lifts on a slight blur
 *   - cover cards rise into place with a 0.08s stagger
 *   - starfield + wordmark drift subtly in response to pointer
 *   - each cover hover runs a micro-tilt timeline
 */

type CardKind = "internal" | "external";

type CardDef = {
  title: string;
  src: string;
  alt: string;
  kind: CardKind;
  onSelect?: () => void;
  href?: string;
  /** Publication status for reading routes (novel / manhwa / sequel / one-shots). */
  status?: StoryStatus;
  /** Shown under the title on the card footer (e.g. “Coming soon”). */
  subtitle?: string;
};

/** Must match `frame-src` in `next.config.ts` (youtube-nocookie only). */
const ANIME_TRAILER_EMBED = "https://www.youtube-nocookie.com/embed/jzIGTLlqeRE";

const CREDIT_PROLOGUE_SONG =
  "https://www.youtube.com/watch?v=X8NOGvc84xc";
const CREDIT_FAN_ANIMATION =
  "https://www.youtube.com/watch?v=nmenQISacHE";
/** Official English WEBTOON — support the licensed manhwa. */
const OFFICIAL_WEBTOON_ORV =
  "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154";

export function StoryModePicker() {
  const router = useRouter();
  const { setViewMode, track } = useReader();
  const [animeOpen, setAnimeOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void track("stories_view");
  }, [track]);

  const choose = (mode: ViewMode) => {
    void track("stories_pick_mode", { mode });
    setViewMode(mode);
    router.push(`/chapters?mode=${mode}`);
  };

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      gsap.set("[data-gs='header'] > *", { opacity: 0, y: -8 });
      gsap.set("[data-gs='mark']", { opacity: 0, scale: 0.85, filter: "blur(10px)" });
      gsap.set("[data-gs='tagline']", { opacity: 0, y: 10 });
      gsap.set("[data-gs='title']", { opacity: 0, y: 18 });
      gsap.set("[data-gs='subtitle']", { opacity: 0, y: 10 });
      gsap.set("[data-gs='rail-label']", { opacity: 0, y: 8 });
      gsap.set("[data-gs='card']", { opacity: 0, y: 36, scale: 0.96 });
      gsap.set("[data-gs='credits']", { opacity: 0, y: 6 });
      gsap.set("[data-gs='footnote']", { opacity: 0, y: 8 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to("[data-gs='header'] > *", { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 })
        .to(
          "[data-gs='mark']",
          { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.7 },
          "-=0.25",
        )
        .to("[data-gs='tagline']", { opacity: 1, y: 0, duration: 0.45 }, "-=0.35")
        .to("[data-gs='title']", { opacity: 1, y: 0, duration: 0.55 }, "-=0.25")
        .to("[data-gs='subtitle']", { opacity: 1, y: 0, duration: 0.45 }, "-=0.35")
        .to("[data-gs='rail-label']", { opacity: 1, y: 0, duration: 0.35 }, "-=0.2")
        .to(
          "[data-gs='card']",
          { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08 },
          "-=0.25",
        )
        .to("[data-gs='credits']", { opacity: 1, y: 0, duration: 0.35 }, "-=0.25")
        .to("[data-gs='footnote']", { opacity: 1, y: 0, duration: 0.4 }, "-=0.28");

      const markHalo = gsap.to("[data-gs='mark-halo']", {
        opacity: 0.55,
        scale: 1.06,
        duration: 2.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      const onMove = (event: PointerEvent) => {
        const rect = root.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        gsap.to(starRef.current, {
          x: nx * 14,
          y: ny * 10,
          duration: 0.9,
          ease: "power2.out",
          overwrite: "auto",
        });
        gsap.to(wordmarkRef.current, {
          x: nx * -22,
          y: ny * -14,
          duration: 1.1,
          ease: "power2.out",
          overwrite: "auto",
        });
      };
      root.addEventListener("pointermove", onMove);

      return () => {
        root.removeEventListener("pointermove", onMove);
        markHalo.kill();
      };
    },
    { scope: rootRef },
  );

  const cards: CardDef[] = [
    {
      title: "Novel",
      src: ORV_COVER_WEBP,
      alt: "Novel",
      kind: "internal",
      status: "Completed",
      onSelect: () => choose("novel"),
    },
    {
      title: "Manhwa",
      src: ORV_WEBTOON_KEY_VISUAL_JPG,
      alt: "Omniscient Reader's Viewpoint webtoon key visual",
      kind: "internal",
      status: "Ongoing",
      onSelect: () => choose("manhwa"),
    },
    {
      title: "ORV Sequel",
      src: SEQUEL_COVER_WEBP,
      alt: "ORV Sequel",
      kind: "internal",
      status: "Ongoing",
      onSelect: () => {
        void track("stories_pick_mode", { mode: "sequel" });
        router.push("/stories/sequel");
      },
    },
    {
      title: "One-shots",
      src: ONESHOT_COVER_WEBP,
      alt: "ORV one-shot side stories",
      kind: "internal",
      status: "Completed",
      onSelect: () => {
        void track("stories_pick_mode", { mode: "side" });
        router.push("/stories/side");
      },
    },
    {
      title: "Anime",
      src: ORV_WEBTOON_KEY_VISUAL_JPG,
      alt: "ORV anime — coming soon",
      kind: "internal",
      subtitle: "Coming soon",
      onSelect: () => {
        void track("stories_anime_trailer_open");
        setAnimeOpen(true);
      },
    },
  ];

  return (
    <div
      ref={rootRef}
      // Phones (portrait + landscape) and short windows can't fit the
      // 5-card rail + header in a locked 100dvh, so we always allow
      // scroll. When the viewport is tall enough the content naturally
      // fills one screen and there is nothing to scroll.
      className="orv-shell relative flex min-h-[100dvh] w-full flex-col bg-[var(--background)] text-[var(--foreground)]"
    >
      <div ref={starRef} className="pointer-events-none absolute inset-[-4%] z-0">
        <Image
          src={STARFIELD_JPG}
          alt=""
          fill
          className="object-cover opacity-20"
          sizes="100vw"
          priority
          unoptimized
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,170,92,0.14),transparent_26%),linear-gradient(180deg,rgba(10,8,7,0.55),rgba(5,5,5,0.9))] backdrop-blur-[1.5px]" />
      </div>
      <OrvLibraryWordmark ref={wordmarkRef} layout="viewport" />

      <main className="relative z-10 flex flex-1 flex-col px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-[max(env(safe-area-inset-top),0.6rem)] sm:px-5 md:px-8">
        <header
          data-gs="header"
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 pb-2 md:pb-3"
        >
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-[var(--accent)]/90 md:text-[10px]">
              ORV Reader
            </p>
            <p className="mt-0.5 font-serif text-[0.95rem] md:text-lg">Story library</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <div className="relative" data-gs="mark">
            <div
              data-gs="mark-halo"
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 translate-y-1 scale-90 rounded-full bg-[radial-gradient(circle,rgba(214,170,92,0.45),transparent_70%)] opacity-0 blur-xl"
            />
            <Image
              src={ORV_OFFICIAL_MARK_PNG}
              alt="Omniscient Reader's Viewpoint"
              width={160}
              height={160}
              className="h-[clamp(3.5rem,8vh,5rem)] w-auto object-contain drop-shadow-[0_6px_22px_rgba(0,0,0,0.55)]"
              priority
            />
          </div>
          <p
            data-gs="tagline"
            className="mt-2 font-serif text-[clamp(0.85rem,1.8vh,1.05rem)] font-normal leading-snug tracking-wide text-[var(--foreground)]"
            style={{
              textShadow:
                "0 0 1.1rem color-mix(in srgb, var(--foreground) 22%, transparent)",
            }}
          >
            [This story is for just one reader]
          </p>
          <h1
            data-gs="title"
            className="mt-3 font-serif font-medium tracking-tight text-[clamp(1.6rem,4.2vh,2.6rem)] leading-[1.06]"
          >
            Pick how you want to read
          </h1>
          <p
            data-gs="subtitle"
            className="mx-auto mt-2 max-w-2xl text-[clamp(0.75rem,1.6vh,0.95rem)] leading-snug text-[var(--reader-body)]"
          >
            Open the novel here, switch to the manhwa in-app, or branch out to sequel and one-shot collections.
          </p>
        </section>

        <section className="mx-auto mt-3 flex w-full max-w-6xl flex-1 flex-col md:mt-4">
          <p
            data-gs="rail-label"
            className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--accent)]/85 md:text-[10px]"
          >
            Reading materials
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => (
              <CoverCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        {animeOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="anime-modal-title"
            onClick={() => setAnimeOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAnimeOpen(false);
            }}
          >
            <div
              className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-[var(--reader-elevated)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[var(--hairline)] px-4 py-3 md:px-5">
                <h2
                  id="anime-modal-title"
                  className="font-serif text-lg text-[var(--foreground)] md:text-xl"
                >
                  Anime adaptation
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
                  Coming soon · trailer
                </p>
              </div>
              <div className="aspect-video w-full bg-black">
                <iframe
                  title="ORV anime trailer"
                  src={`${ANIME_TRAILER_EMBED}?rel=0`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 md:px-5">
                <button
                  type="button"
                  onClick={() => setAnimeOpen(false)}
                  className="rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/50 px-4 py-2 font-mono text-[11px] text-[var(--reader-fg)] transition-colors hover:border-[var(--accent)]/40"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <aside
          data-gs="credits"
          className="mx-auto mt-3 w-full max-w-xl px-2 text-center md:mt-4"
        >
          <p className="font-mono text-[7px] uppercase tracking-[0.28em] text-[var(--accent)]/70 md:text-[8px]">
            Credits
          </p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-[7px] leading-snug text-[var(--reader-muted)] md:text-[8px]">
            <li>
              Prologue song —{" "}
              <a
                href={CREDIT_PROLOGUE_SONG}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)]/90 underline decoration-[var(--accent)]/30 underline-offset-2 transition-colors hover:text-[var(--foreground)]"
              >
                YouTube
              </a>
            </li>
            <li>
              Original fan animation (in-app video) —{" "}
              <a
                href={CREDIT_FAN_ANIMATION}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)]/90 underline decoration-[var(--accent)]/30 underline-offset-2 transition-colors hover:text-[var(--foreground)]"
              >
                YouTube
              </a>
            </li>
            <li>
              Official manhwa —{" "}
              <a
                href={OFFICIAL_WEBTOON_ORV}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)]/90 underline decoration-[var(--accent)]/30 underline-offset-2 transition-colors hover:text-[var(--foreground)]"
              >
                WEBTOON
              </a>
            </li>
          </ul>
        </aside>

        <p
          data-gs="footnote"
          className="mx-auto mt-2 w-full max-w-3xl rounded-full border border-[var(--hairline)] bg-[var(--overlay-mid)] px-4 py-1.5 text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-[var(--reader-muted)] md:mt-3 md:text-[10px]"
        >
          <a
            href={OFFICIAL_WEBTOON_ORV}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)]/95 underline decoration-[var(--accent)]/35 underline-offset-2 transition-colors hover:text-[var(--foreground)]"
          >
            Support the official manhwa on WEBTOON
          </a>
          <span className="mx-1.5 text-[var(--reader-muted)]/50" aria-hidden>
            ·
          </span>
          Host only content you have rights to use.
        </p>
      </main>
    </div>
  );
}

function CoverCard({ card }: { card: CardDef }) {
  const ref = useRef<HTMLElement | null>(null);

  const onEnter = () => {
    gsap.to(ref.current, {
      y: -4,
      scale: 1.015,
      duration: 0.32,
      ease: "power2.out",
      overwrite: "auto",
    });
    gsap.to(ref.current?.querySelector("[data-gs='cover-img']") ?? null, {
      scale: 1.05,
      duration: 0.5,
      ease: "power2.out",
      overwrite: "auto",
    });
    gsap.to(ref.current?.querySelector("[data-gs='cover-glow']") ?? null, {
      opacity: 1,
      duration: 0.35,
      ease: "power2.out",
      overwrite: "auto",
    });
  };
  const onLeave = () => {
    gsap.to(ref.current, {
      y: 0,
      scale: 1,
      duration: 0.4,
      ease: "power3.out",
      overwrite: "auto",
    });
    gsap.to(ref.current?.querySelector("[data-gs='cover-img']") ?? null, {
      scale: 1,
      duration: 0.55,
      ease: "power3.out",
      overwrite: "auto",
    });
    gsap.to(ref.current?.querySelector("[data-gs='cover-glow']") ?? null, {
      opacity: 0,
      duration: 0.4,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  const className =
    "group relative flex min-h-0 w-full flex-col overflow-hidden rounded-[1.1rem] border border-[var(--hairline)] bg-[var(--overlay-mid)] text-left shadow-[0_12px_34px_rgba(0,0,0,0.3)] transition-[border-color] duration-200 hover:border-[var(--accent)]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/55";

  const body = (
    <>
      <div
        data-gs="cover-glow"
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[1.1rem] bg-[radial-gradient(circle_at_50%_0%,rgba(214,170,92,0.35),transparent_60%)] opacity-0"
      />
      <div className="relative aspect-[3/4] w-full flex-1 overflow-hidden">
        <Image
          data-gs="cover-img"
          src={card.src}
          alt={card.alt}
          fill
          className="object-cover"
          sizes="(max-width:768px) 45vw, 18vw"
          unoptimized
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
      </div>
      <div className="border-t border-white/10 bg-black/70 px-3 py-1.5 text-center backdrop-blur-sm md:py-2">
        <p className="font-sans text-[0.8rem] font-medium tracking-tight text-white md:text-sm">
          {card.title}
        </p>
        {card.status ? (
          <span
            className={`mt-1.5 inline-flex justify-center ${readingStatusPillClass(card.status)}`}
          >
            {card.status}
          </span>
        ) : null}
        {card.subtitle ? (
          <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--accent)]">
            {card.subtitle}
          </p>
        ) : null}
      </div>
    </>
  );

  if (card.kind === "internal") {
    return (
      <button
        ref={(el) => {
          ref.current = el;
        }}
        data-gs="card"
        type="button"
        onClick={card.onSelect}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        className={className}
      >
        {body}
      </button>
    );
  }
  return (
    <a
      ref={(el) => {
        ref.current = el;
      }}
      data-gs="card"
      href={card.href}
      target="_blank"
      rel="noreferrer"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={className}
    >
      {body}
    </a>
  );
}
