"use client";

import { useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { FINALE_HERO_ART } from "@/lib/reveal-shared";
import {
  ORV_OFFICIAL_MARK_PNG,
  ORV_READER_WORDMARK_TRANSPARENT_PNG,
} from "@/lib/orv-library-assets";

/**
 * Finale scene.
 *
 * Plays after the gilded-lily video has ended. A dark, warmly-lit
 * stage fades in; the hero illustration (`FINALE_HERO_ART`) rises
 * from slightly below with a soft Ken-Burns drift, surrounded by a
 * warm halo, a slow sweeping light ray and drifting dust motes.
 * Two bookend lines appear: a serif tag above ("THE PROLOGUE ENDS.")
 * and, once `tapReady` is true, a tap prompt below.
 *
 * Mounted by the parent when `finaleActive` flips true; GSAP
 * handles the entrance choreography and `useGSAP` cleans up on
 * unmount.
 */

type Props = {
  /** When true, reveals the tap-to-continue prompt under the hero. */
  tapReady: boolean;
  /** Optional tap prompt text override. */
  tapLabel?: string;
  /** Optional top bookend override. */
  topLabel?: string;
  /** Hero illustration URL (defaults to `FINALE_HERO_ART` under `public/` or blob). */
  heroArtSrc?: string;
};

/** Tiny deterministic PRNG so mote positions are stable per mount. */
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function FinaleScene({
  tapReady,
  tapLabel = "[ Tap to begin the story. ]",
  topLabel = "[ The prologue ends. ]",
  heroArtSrc = FINALE_HERO_ART,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Pre-compute ~24 drifting motes with random x/size/speed/delay.
  const motes = useMemo(() => {
    const rng = makeRng(0xda7a);
    return Array.from({ length: 24 }, (_, i) => ({
      key: i,
      left: rng() * 100,
      delay: rng() * 8,
      duration: 14 + rng() * 12,
      size: 2 + rng() * 3,
      alpha: 0.35 + rng() * 0.4,
    }));
  }, []);

  useGSAP(
    () => {
      const stage = stageRef.current;
      if (!stage) return;

      const hero = stage.querySelector<HTMLElement>("[data-finale-hero]");
      const halo = stage.querySelector<HTMLElement>("[data-finale-halo]");
      const top = stage.querySelector<HTMLElement>("[data-finale-top]");
      const wordmark = stage.querySelector<HTMLElement>(
        "[data-finale-wordmark]",
      );
      const crest = stage.querySelector<HTMLElement>("[data-finale-crest]");

      gsap.set(stage, { opacity: 0 });
      if (hero) {
        gsap.set(hero, {
          scale: 0.94,
          x: 24,
          opacity: 0,
          filter: "blur(18px) brightness(0.8)",
        });
      }
      if (halo) gsap.set(halo, { opacity: 0, scale: 0.85 });
      if (top) gsap.set(top, { opacity: 0, y: -10, letterSpacing: "0.32em" });
      if (wordmark) gsap.set(wordmark, { opacity: 0, x: -24 });
      if (crest) gsap.set(crest, { opacity: 0, y: -16, scale: 0.9 });

      const tl = gsap.timeline();

      tl.to(stage, { opacity: 1, duration: 0.9, ease: "power2.out" }, 0);

      if (halo) {
        tl.to(
          halo,
          { opacity: 1, scale: 1, duration: 2.2, ease: "sine.out" },
          0.1,
        );
      }

      if (hero) {
        tl.to(
          hero,
          {
            opacity: 1,
            x: 0,
            scale: 1,
            filter: "blur(0px) brightness(1)",
            duration: 2.4,
            ease: "power3.out",
          },
          0.15,
        );

        // Very slow Ken-Burns drift on the photo side.
        tl.to(
          hero,
          { scale: 1.04, duration: 14, ease: "sine.inOut" },
          2.5,
        );
      }

      if (top) {
        tl.to(
          top,
          {
            opacity: 1,
            y: 0,
            letterSpacing: "0.22em",
            duration: 1.6,
            ease: "power2.out",
          },
          1.8,
        );
      }

      if (wordmark) {
        tl.to(
          wordmark,
          {
            opacity: 0.95,
            x: 0,
            duration: 1.6,
            ease: "power3.out",
          },
          0.35,
        );
      }

      if (crest) {
        tl.to(
          crest,
          {
            opacity: 0.92,
            y: 0,
            scale: 1,
            duration: 1.3,
            ease: "power2.out",
          },
          0.6,
        );
      }
    },
    { scope: stageRef },
  );

  return (
    <div ref={stageRef} className="orv-finale-stage" aria-hidden>
      <div data-finale-halo className="orv-finale-halo" />
      <div className="orv-finale-sweep" />

      <div className="orv-finale-motes">
        {motes.map((m) => (
          <span
            key={m.key}
            className="orv-finale-mote"
            style={{
              left: `${m.left}%`,
              width: `${m.size}px`,
              height: `${m.size}px`,
              opacity: m.alpha,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
            }}
          />
        ))}
      </div>

      {/*
        Layout (desktop):
        ┌──────────────────┬─────────────────────────────────────┐
        │                  │             [ crest ]               │ top
        │   OMNISCIENT     │                                     │
        │       ×          │        [ hero illustration ]        │ center
        │     READER       │                                     │
        │  (wordmark)      │                                     │
        │                  │        [ tap to continue ]          │ bottom
        └──────────────────┴─────────────────────────────────────┘
            ~34% width               ~66% width

        On narrow screens the wordmark collapses to a soft background
        band on the left so the hero still fits without overlap.
      */}

      {/* Left column — vertical OMNISCIENT × READER wordmark. */}
      <div data-finale-wordmark className="orv-finale-wordmark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ORV_READER_WORDMARK_TRANSPARENT_PNG}
          alt="Omniscient Reader"
          draggable={false}
        />
      </div>

      {/* Top-center — ornate wiki / crest mark. */}
      <div data-finale-crest className="orv-finale-crest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ORV_OFFICIAL_MARK_PNG} alt="" draggable={false} />
      </div>

      <div data-finale-top className="orv-finale-top-line">
        {topLabel}
      </div>

      {/* Right 66% — the two-figure key art. */}
      <div data-finale-hero className="orv-finale-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroArtSrc} alt="" draggable={false} />
      </div>

      {tapReady ? (
        // Solid dark pill ensures the tap prompt is always readable
        // against the hero art. The parent <div> in AuthGate owns the
        // onClick handler, so anywhere on the viewport advances — this
        // is purely a visual affordance (pointer-events stay off on
        // the whole stage so clicks still reach the parent).
        <div className="orv-finale-tap-wrap">
          <div className="orv-finale-tap-pill">{tapLabel}</div>
        </div>
      ) : null}
    </div>
  );
}
