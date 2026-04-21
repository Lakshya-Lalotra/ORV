"use client";

import type { ReactNode } from "react";

/**
 * Rounded "info window" card — our equivalent of orv.pages.dev's
 * `<div class="orv_window">` block.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [Three Ways to Survive in a Ruined World]    │ ← title
 *   ├──────────────────────────────────────────────┤
 *   │ Author: tls123                               │ ← body lines
 *   │ 3,149 chapters.                              │
 *   └──────────────────────────────────────────────┘
 *
 * Used by both `ChapterReader` (main novel, via the WINDOW_SENTINEL
 * encoding) and EPUB JSON chapters (sequel/side, via `kind: "window"`).
 * Kept as a single component so styling stays consistent everywhere.
 */
export function StoryWindowCard({
  title,
  lines,
  children,
}: {
  /**
   * Bracketed title; brackets are preserved so readers see the same
   * `[…]` form as the source.
   */
  title: string | null;
  /** One paragraph per line. Mutually exclusive with `children`. */
  lines?: string[];
  /** Escape hatch for callers that need to interleave rich content. */
  children?: ReactNode;
}) {
  return (
    <div className="orv-window-card my-5 overflow-hidden rounded-2xl border border-[var(--accent)]/45 bg-[var(--card-bg)] shadow-[0_0_32px_rgba(214,170,92,0.12),inset_0_0_40px_rgba(214,170,92,0.05)]">
      {title ? (
        <div className="border-b border-[var(--accent)]/30 bg-[var(--card-bg-strong)] px-5 py-3 text-center">
          <p className="font-serif text-[clamp(1rem,2.3vw,1.2rem)] font-semibold leading-snug tracking-tight text-[var(--accent)]">
            {title}
          </p>
        </div>
      ) : null}
      {lines && lines.length > 0 ? (
        <ul className="flex flex-col gap-1 px-5 py-4 font-mono text-[0.9rem] leading-relaxed text-[var(--reader-fg)]">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="px-5 py-4">{children}</div> : null}
    </div>
  );
}
