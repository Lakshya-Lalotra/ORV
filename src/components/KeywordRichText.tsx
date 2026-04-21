"use client";

import { useId, useState } from "react";
import type { KeywordDef } from "@/lib/types";
import { playGlitchSystem, resumeAudio } from "@/lib/audio-engine";
import { useReader } from "@/context/ReaderContext";
import { renderBracketedParts } from "./BracketedText";

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function KeywordRichText({
  text,
  keywords,
  segmentKey,
  onKeywordClick,
}: {
  text: string;
  keywords: KeywordDef[];
  segmentKey: string;
  onKeywordClick?: () => void;
}) {
  const { settings } = useReader();
  const baseId = useId();
  const [open, setOpen] = useState<string | null>(null);

  if (!keywords.length) {
    // No keywords → still run through the bracket highlighter so
    // `[...]` chips appear consistently everywhere in the novel.
    return (
      <span className="inline">
        {renderBracketedParts(text, `${segmentKey}-nokw`)}
      </span>
    );
  }

  const parts: React.ReactNode[] = [];
  let remainder = text;
  let partIdx = 0;

  const sorted = [...keywords].sort((a, b) => b.term.length - a.term.length);

  while (remainder.length) {
    let earliest: { idx: number; k: KeywordDef; match: string } | null = null;
    for (const k of sorted) {
      const re = new RegExp(escapeReg(k.term), "i");
      const m = remainder.match(re);
      if (!m || m.index === undefined) continue;
      if (!earliest || m.index < earliest.idx) {
        earliest = { idx: m.index, k, match: m[0] };
      }
    }
    if (!earliest) {
      parts.push(
        ...renderBracketedParts(remainder, `${segmentKey}-rest-${partIdx}`),
      );
      break;
    }
    if (earliest.idx > 0) {
      parts.push(
        ...renderBracketedParts(
          remainder.slice(0, earliest.idx),
          `${segmentKey}-pre-${partIdx}`,
        ),
      );
    }
    const k = earliest.k;
    const match = earliest.match;
    const popId = `${baseId}-${segmentKey}-${partIdx}`;
    const isOpen = open === popId;
    parts.push(
      <span key={`${segmentKey}-kw-${partIdx}`} className="relative inline">
        <button
          type="button"
          className="keyword-vn rounded px-0.5 text-[var(--accent)] underline decoration-[var(--glow)] decoration-1 underline-offset-4 transition-colors hover:bg-[var(--glow)]/15"
          onClick={() => {
            if (settings.soundEnabled) {
              void resumeAudio();
              playGlitchSystem(0.28);
            }
            setOpen(isOpen ? null : popId);
            onKeywordClick?.();
          }}
        >
          {match}
        </button>
        {isOpen ? (
          <span
            role="tooltip"
            className="absolute left-0 top-full z-40 mt-2 block w-[min(100vw-2rem,280px)] rounded-lg border border-[var(--reader-border)] bg-[var(--reader-elevated)] p-3 text-left text-sm font-normal normal-case tracking-normal text-[var(--reader-fg)] shadow-[0_0_20px_var(--glow)] backdrop-blur-md"
          >
            <span className="font-mono text-xs text-[var(--accent)]">{k.term}</span>
            <p className="mt-1 text-[var(--reader-muted)]">{k.definition}</p>
          </span>
        ) : null}
      </span>,
    );
    remainder = remainder.slice(earliest.idx + match.length);
    partIdx += 1;
  }

  return <span className="inline">{parts}</span>;
}
