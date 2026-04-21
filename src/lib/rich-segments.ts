/**
 * Rich-segment encoding.
 *
 * orv.pages.dev's chapter HTML groups several kinds of in-story blocks:
 *
 *   `<div class="orv_window">`   — bordered info card
 *                                  (e.g. `[Three Ways to Survive in a Ruined World]` + `Author: tls123` + `3,149 chapters.`)
 *   `<div class="orv_notice">`   — footnote aside
 *   `<div class="orv_quote">`    — pulled / attributed quote
 *
 * The source `chap_NNNNN.txt` files delimit window blocks with bare `+`
 * lines on either side. We want to preserve that structure into a
 * single `Segment` row (keeps the DB schema unchanged — we still only
 * have `narration | dialogue | system | action`).
 *
 * The convention we use on write:
 *
 *   • A window block is collapsed to ONE line by joining its internal
 *     lines with `\u2028` (Unicode LINE SEPARATOR, which is not a `\n`
 *     and therefore survives the `split(/\n/)` paragraph splitter).
 *   • The line is prefixed with the sentinel `⟦WINDOW⟧`.
 *   • The segment ends up with kind `system` so the reader's existing
 *     `system` pipeline picks it up.
 *
 * On read, `parseRichSegment(text)` returns the structured payload.
 */

export const WINDOW_SENTINEL = "\u27E6WINDOW\u27E7"; // ⟦WINDOW⟧
export const WINDOW_LINE_SEP = "\u2028"; // LINE SEPARATOR

/** Vertical gap between blocks (EPUB JSON `spacer` rows). Rendered in ChapterReader only. */
export const SPACER_SENTINEL = "\u27E6SP\u27E7"; // ⟦SP⟧

export type RichSegmentPayload =
  | { kind: "plain"; text: string }
  | {
      kind: "window";
      /** First bracketed line, e.g. `[Three Ways to Survive in a Ruined World]` (brackets kept). */
      title: string | null;
      /** Remaining lines inside the window, already split. */
      body: string[];
    };

export function encodeWindowBlock(lines: string[]): string | null {
  const cleaned = lines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  if (cleaned.length === 0) return null;
  return WINDOW_SENTINEL + cleaned.join(WINDOW_LINE_SEP);
}

export function isWindowSegmentText(text: string): boolean {
  return text.startsWith(WINDOW_SENTINEL);
}

export function parseRichSegment(text: string): RichSegmentPayload {
  if (!isWindowSegmentText(text)) return { kind: "plain", text };
  const inner = text.slice(WINDOW_SENTINEL.length);
  const lines = inner.split(WINDOW_LINE_SEP).filter((l) => l.length > 0);
  if (lines.length === 0) return { kind: "plain", text: "" };
  const [first, ...rest] = lines;
  const titleLooksBracketed = /^\[[^\]]+\]$/.test(first!.trim());
  return {
    kind: "window",
    title: titleLooksBracketed ? first! : null,
    body: titleLooksBracketed ? rest : lines,
  };
}
