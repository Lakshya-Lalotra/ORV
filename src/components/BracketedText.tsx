"use client";

import type { ReactNode } from "react";

/**
 * Render a plain string with every `[...]` run wrapped in a small
 * gold-accent chip — ORV's in-world system messages, book titles,
 * notifications etc. all use that bracket convention and we want
 * them to read as a distinct visual beat whether they appear on
 * their own line (`[The constellation 'Demon-like Judge of Fire'
 * is screaming!]`) or inline inside a prose paragraph.
 *
 * Kept deliberately minimal — no click handler, no sound, just
 * typography. Used by both the main-novel `KeywordRichText` (for
 * non-keyword spans) and the sequel `Segment` renderer so both
 * readers look consistent.
 */

/*
 * ORV uses several bracket families and all of them carry in-world
 * meaning that should read as a distinct typographic beat:
 *
 *   [ ... ]      ASCII square brackets  — system messages, notifications,
 *                                         status-bar lines (`[Three Ways…]`,
 *                                         `[Your understanding increased.]`).
 *   「 ... 」    Japanese corner quotes  — narration voice-overs / scene
 *                                         descriptions from the dokkaebi bag
 *                                         (`「The dokkaebi stretched out its
 *                                           antenna.」`).
 *   『 ... 』    Japanese double corner — book / scenario titles (the
 *                                         `『Three Ways to Survive…』` style).
 *   〈 ... 〉    Angle quotes            — chat / system tabs in later arcs.
 *   《 ... 》    Double angle quotes     — channel broadcasts (`《Nebula notice…》`).
 *
 * All of them render as the same gold chip. Each alternative is
 * non-greedy and refuses to cross a line-break or another opener so
 * adjacent runs stay split and a malformed dangling opener doesn't
 * swallow the rest of the paragraph.
 */
const BRACKET_RE =
  /\[[^\[\]\n\r]{1,400}?\]|「[^「」\n\r]{1,400}?」|『[^『』\n\r]{1,400}?』|〈[^〈〉\n\r]{1,400}?〉|《[^《》\n\r]{1,400}?》/g;

// Uses themed `--accent` + `--glow` so the chip stays readable on both
// the dark (cream letters on black) and light (dark-gold letters on
// parchment) palettes. Border is slightly stronger in light mode via
// the /45 alpha since dark-on-light has less inherent contrast than
// bright-on-dark.
const CHIP_CLASS =
  "orv-bracket-chip mx-[1px] inline-block align-baseline rounded-md border border-[var(--accent)]/45 bg-[var(--glow)]/15 px-1 py-[1px] font-mono text-[0.94em] leading-tight text-[var(--accent)] shadow-[inset_0_0_12px_rgba(214,170,92,0.08)]";

export function renderBracketedParts(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  BRACKET_RE.lastIndex = 0;
  for (const m of text.matchAll(BRACKET_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (start > cursor) {
      parts.push(
        <span
          key={`${keyPrefix}-plain-${idx++}`}
          className="whitespace-pre-wrap"
        >
          {text.slice(cursor, start)}
        </span>,
      );
    }
    parts.push(
      <span key={`${keyPrefix}-br-${idx++}`} className={CHIP_CLASS}>
        {m[0]}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(
      <span
        key={`${keyPrefix}-plain-${idx++}`}
        className="whitespace-pre-wrap"
      >
        {text.slice(cursor)}
      </span>,
    );
  }
  return parts;
}

export function BracketedText({
  text,
  keyPrefix = "bt",
}: {
  text: string;
  keyPrefix?: string;
}) {
  return <>{renderBracketedParts(text, keyPrefix)}</>;
}
