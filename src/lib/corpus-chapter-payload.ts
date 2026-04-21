/**
 * Maps EPUB-ingested JSON chapters (`content/sequel/`, `content/side/`) into
 * {@link ChapterPayload} so they render in {@link ChapterReader} with the same
 * typography, theme, and settings as the main novel.
 */

import type { ChapterMood, SegmentKind } from "@prisma/client";
import type { ChapterPayload, KeywordDef } from "@/lib/types";
import {
  encodeWindowBlock,
  SPACER_SENTINEL,
  WINDOW_SENTINEL,
  WINDOW_LINE_SEP,
} from "@/lib/rich-segments";
import type { SequelChapter, SequelSegment } from "@/lib/sequel-content";

const EMPTY_KW: KeywordDef[] = [];

function sequelWindowToEncoded(seg: SequelSegment & { kind: "window" }): string {
  const lines: string[] = [];
  const title = seg.title?.trim();
  if (title) {
    lines.push(/^\[[^\]]+\]$/.test(title) ? title : `[${title}]`);
  }
  const raw = seg.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (const l of raw) {
    if (title && l === title) continue;
    lines.push(l);
  }
  const encoded = encodeWindowBlock(lines);
  if (encoded) return encoded;
  return lines.length > 0
    ? WINDOW_SENTINEL + lines.join(WINDOW_LINE_SEP)
    : WINDOW_SENTINEL;
}

function mapSegment(
  seg: SequelSegment,
  slug: string,
  orderIndex: number,
): ChapterPayload["segments"][number] {
  const id = `${slug}-seg-${orderIndex}`;
  const base = {
    id,
    orderIndex,
    keywords: EMPTY_KW,
    panel: null as null,
  };

  switch (seg.kind) {
    case "quote":
      return { ...base, kind: "dialogue" as SegmentKind, text: seg.text };
    case "notice":
      return { ...base, kind: "system" as SegmentKind, text: seg.text };
    case "window":
      return {
        ...base,
        kind: "system" as SegmentKind,
        text: sequelWindowToEncoded(
          seg as SequelSegment & { kind: "window" },
        ),
      };
    case "divider":
      return { ...base, kind: "narration" as SegmentKind, text: "---" };
    case "spacer":
      return {
        ...base,
        kind: "narration" as SegmentKind,
        text: SPACER_SENTINEL,
      };
    case "line":
    default:
      return { ...base, kind: "narration" as SegmentKind, text: seg.text };
  }
}

/**
 * Convert a sequel/side JSON chapter into the Prisma-shaped payload the
 * immersive reader expects (novel mode; no manhwa panels).
 */
export function corpusChapterToPayload(chapter: SequelChapter): ChapterPayload {
  const segments: ChapterPayload["segments"] = [];
  let order = 0;

  for (const seg of chapter.segments) {
    segments.push(mapSegment(seg, chapter.slug, order));
    order += 1;
  }

  if (chapter.authorNote.length > 0) {
    segments.push({
      id: `${chapter.slug}-author-hdr`,
      orderIndex: order,
      kind: "system",
      text: "— Author's note —",
      keywords: EMPTY_KW,
      panel: null,
    });
    order += 1;
    for (const seg of chapter.authorNote) {
      segments.push(mapSegment(seg, chapter.slug, order));
      order += 1;
    }
  }

  return {
    slug: chapter.slug,
    title: chapter.title,
    mood: "calm" as ChapterMood,
    intensity: 50,
    manhwaPanels: [],
    segments,
  };
}
