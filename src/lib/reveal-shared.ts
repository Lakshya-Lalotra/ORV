/**
 * Shared constants, types and helpers for the post-auth reveal scene (`AuthGate`).
 */

import { publicAssetUrl } from "@/lib/orv-blob-url";

/** Default paths under `public/` or under blob base — use `getRevealMediaUrls()` at runtime for deployed URLs. */
export const REVEAL_VIDEO_SRC = publicAssetUrl("/Video/gilded-lily-animation.mp4");
export const REVEAL_AUDIO_SRC = publicAssetUrl("/audio/gilded-lily.mp3");

export const SONG_START_TIME_S = 10;
export const SONG_INITIAL_DELAY_MS = 2800;
export const SONG_INITIAL_VOLUME = 0.04;
export const SONG_TARGET_VOLUME = 0.5;
export const SONG_RAMP_MS = 9000;
export const REVEAL_OUTRO_BUFFER_S = 5;

/**
 * Finale phase — runs after the video ends. The gilded-lily video
 * fades out, the soundtrack trails off, and a single hero piece of
 * art takes centre stage with a Ken-Burns drift, drifting particles
 * and a soft light sweep before the tap-to-continue prompt appears.
 */
/** How many ms BEFORE video end the finale begins fading in. */
export const FINALE_LEAD_IN_MS = 900;
/** How many ms AFTER video end the tap prompt becomes available. */
export const FINALE_TAP_DELAY_MS = 3200;
/** The single hero illustration shown at the finale. */
export const FINALE_HERO_ART = publicAssetUrl("/art/finale-hero.jpg");

export type RevealEmphasis = "soft" | "wobble" | "breathe" | "command";

export type RevealStep = {
  text: string;
  emphasis?: RevealEmphasis;
  /**
   * Relative display weight. Larger = line stays on screen proportionally
   * longer. Weights are normalized at runtime so the full script spans the
   * playable portion of the song.
   */
  weight?: number;
};

export function hydrateRevealScriptPlaceholders(
  steps: RevealStep[],
  readerName: string,
): RevealStep[] {
  const safe = readerName.trim() || "Reader";
  return steps.map((s) => ({
    ...s,
    text: s.text.replace(/\{\{readerName\}\}/g, safe),
  }));
}

export function buildRevealScript(readerName: string): RevealStep[] {
  return [
    { text: `[ Welcome, ${readerName} ]`, emphasis: "soft", weight: 2 },
    { text: "[ This story is for just one reader. ]", emphasis: "wobble", weight: 3 },
    { text: "[ Once upon a page… ]", emphasis: "soft", weight: 2 },
    { text: "[ There was a single reader. ]", emphasis: "soft", weight: 2 },
    { text: "[ Who followed a story no one else believed in. ]", weight: 3 },
    {
      text: "[ Three years. One thousand, one hundred and nineteen chapters. ]",
      weight: 3,
    },
    { text: "[ And only you finished it. ]", emphasis: "wobble", weight: 3 },
    { text: "[ Then, one morning, the world changed. ]", weight: 3 },
    { text: "[ The author sent the last chapter as a gift. ]", weight: 3 },
    { text: "[ And the story turned its head… ]", emphasis: "soft", weight: 2 },
    { text: "[ …and began looking back. ]", emphasis: "wobble", weight: 3 },
    {
      text: "[ ☆ Scenario #0 — A reader is chosen ☆ ]",
      emphasis: "command",
      weight: 4,
    },
    { text: "[ You remember, don't you. ]", emphasis: "soft", weight: 3 },
    { text: "[ The subway. The flicker. The blue system window. ]", weight: 3 },
    {
      text: "[ Main Scenario #1 — ‹Flight Response› ]",
      emphasis: "command",
      weight: 4,
    },
    { text: "[ …but you are not afraid. ]", weight: 3 },
    {
      text: "[ Because you have already read the ending. ]",
      emphasis: "wobble",
      weight: 3,
    },
    { text: "[ Haven't you? ]", emphasis: "breathe", weight: 3 },
    { text: "[ Welcome back, Reader. ]", emphasis: "wobble", weight: 4 },
  ];
}

export function emphasisClass(e: RevealEmphasis | undefined): string {
  if (e === "soft") return "orv-matrix-text orv-matrix-text-soft";
  if (e === "wobble") return "orv-matrix-text orv-wobble-strong";
  if (e === "breathe") return "orv-matrix-text orv-breathe";
  if (e === "command") return "orv-matrix-text orv-matrix-text-command";
  return "orv-matrix-text";
}

