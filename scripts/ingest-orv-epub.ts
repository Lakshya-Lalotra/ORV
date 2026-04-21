/**
 * Ingest from EPUB → reader chapters aligned with novel numbering (same idea as
 * [Bittu5134/ORV-Reader](https://github.com/Bittu5134/ORV-Reader) / orv.pages.dev `ch_1`, `ch_2`, …).
 *
 *   npm run ingest:epub
 *
 * **Spine** mode: each spine HTML file is scanned for a **`Ch N:`** or **`Chapter N:`** heading
 * (title or first text line). Slug **`orv-ch-N`** uses that **N**, not spine order — so
 * **orv-ch-1** matches Prologue like https://orv.pages.dev/stories/orv/read/ch_1
 *
 * Put **`Final Ebup.epub`** (or `Final Epub.epub`) in content/, or `File.epub`, or set ORV_EPUB_PATH.
 *
 * ORV_EPUB_MODE:
 *   spine (default) — heading-based numbering above
 *   merge — glue all HTML, then split on "Chapter N:" / "Ch N:" (novel-parse)
 *
 * ORV_SKIP_FIRST_CHAPTERS — drop the first N **spine files** (spine mode) or first N **parsed**
 * chapters (merge) before import. Default **0**.
 *
 * ORV_ATTACH_BITTU_ILLUSTRATIONS=0 — skip fetching Bittu chap_*.txt to attach repo image URLs
 * to segments (default: on). Uses ORV_BITTU_DELAY_MS between requests.
 */

import "dotenv/config";
import { EPub } from "epub2";
import { PrismaClient } from "@prisma/client";
import { normalizeText, resolvedSkipFirstChapters } from "./ingest-shared";
import {
  expandChapterLineBreaks,
  htmlToPlainText,
  parseAllChapters,
  parseNovelChapterHeading,
} from "./novel-parse";
import {
  enrichParsedChaptersWithBittuPanelFilenames,
  shouldAttachBittuPanelsForIngest,
} from "./attach-bittu-panels-for-ingest";
import { resolveEpubPath } from "./epub-path";
import type { ParsedChapter } from "./write-novel-db";
import { writeNovelChaptersToDb } from "./write-novel-db";

const prisma = new PrismaClient();
const PROJECT_ROOT = process.cwd();

function extractTitleFromHtml(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = htmlToPlainText(h1[1]).trim();
    if (t.length > 0 && t.length < 600) return t;
  }
  const tit = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tit) {
    const t = htmlToPlainText(tit[1]).trim();
    if (t.length > 0 && t.length < 600) return t;
  }
  return null;
}

/** Drop first line/paragraph if it repeats the title. */
function bodyWithoutDuplicateTitle(body: string, title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return body;
  let b = body.trim();
  const firstPara = b.split(/\n\n+/)[0]?.replace(/\s+/g, " ").trim();
  if (firstPara && firstPara === t) {
    b = b.slice(b.indexOf(firstPara) + firstPara.length).trim();
    b = b.replace(/^\n+/, "");
  }
  const firstLine = b.split(/\n/)[0]?.replace(/\s+/g, " ").trim();
  if (firstLine && firstLine === t) {
    b = b.split(/\n/).slice(1).join("\n").trim();
  }
  return b;
}

type Parsed = { num: number; title: string; body: string };

function firstNonEmptyLine(s: string): string {
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "";
}

function isLikelyTocBody(body: string): boolean {
  const lines = body
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 10) return false;
  const sample = lines.slice(0, Math.min(35, lines.length));
  let hits = 0;
  for (const line of sample) {
    if (/^(?:ch|chapter)\s+\d+/i.test(line)) hits++;
  }
  return hits >= 4 && hits >= sample.length * 0.35;
}

function looksLikePrologueTitle(title: string, body: string): boolean {
  const blob = `${title}\n${firstNonEmptyLine(body)}`.toLowerCase();
  return /\bprologue\b/.test(blob);
}

/** Spine files → chapters keyed by novel number (Bittu / orv.pages.dev style). */
function spineChunksToNumberedChapters(items: { title: string; body: string }[]): Parsed[] {
  const numbered: Parsed[] = [];
  for (const { title, body } of items) {
    if (isLikelyTocBody(body)) continue;

    const fromTitle = parseNovelChapterHeading(title);
    const fromBody = parseNovelChapterHeading(firstNonEmptyLine(body));
    let parsed = fromTitle ?? fromBody;

    if (!parsed && looksLikePrologueTitle(title, body)) {
      const t = title.trim() || firstNonEmptyLine(body);
      const sub = t.replace(/^\s*prologue\s*[–—\-:]\s*/i, "").trim() || t;
      parsed = { num: 1, title: sub };
    }

    if (!parsed) {
      console.warn(
        `  EPUB skip (no Ch/Chapter N: heading): "${title.slice(0, 70)}${title.length > 70 ? "…" : ""}"`,
      );
      continue;
    }

    const { num, title: parsedTitle } = parsed;
    const sub =
      parsedTitle && parsedTitle.length >= 2
        ? parsedTitle
        : title.trim() || `Chapter ${num}`;
    numbered.push({ num, title: sub, body });
  }

  const byNum = new Map<number, Parsed>();
  for (const ch of numbered) {
    const prev = byNum.get(ch.num);
    if (!prev) {
      byNum.set(ch.num, { ...ch });
    } else {
      byNum.set(ch.num, {
        num: ch.num,
        title: ch.title.length >= prev.title.length ? ch.title : prev.title,
        body: `${prev.body}\n\n${ch.body}`.trim(),
      });
    }
  }

  return [...byNum.values()].sort((a, b) => a.num - b.num);
}

async function ingestSpineChapters(epubPath: string, skipSpineFiles: number): Promise<Parsed[]> {
  const epub = await EPub.createAsync(epubPath);
  const flow = epub.flow;
  if (!flow?.length) throw new Error("EPUB has no spine / flow.");

  const raw: { title: string; body: string }[] = [];

  for (const item of flow) {
    if (!item?.id) continue;
    let html: string;
    try {
      html = await epub.getChapterAsync(item.id);
    } catch {
      continue;
    }
    if (!html || html.length < 20) continue;

    const titleFromMeta =
      (item.title && String(item.title).trim()) || extractTitleFromHtml(html);
    const title = titleFromMeta || "Untitled section";

    let body = normalizeText(htmlToPlainText(html));
    body = bodyWithoutDuplicateTitle(body, title);
    if (body.length < 40) continue;

    raw.push({ title, body });
  }

  if (raw.length === 0) {
    throw new Error("No readable text in EPUB spine (images-only or encrypted?).");
  }

  let sliceFrom = raw;
  if (skipSpineFiles > 0) {
    sliceFrom = raw.slice(skipSpineFiles);
    console.log(
      `ORV_SKIP_FIRST_CHAPTERS=${skipSpineFiles} spine file(s): ${raw.length} → ${sliceFrom.length} before heading parse.`,
    );
  }

  const out = spineChunksToNumberedChapters(sliceFrom);
  if (out.length === 0) {
    throw new Error(
      'No "Ch N:" / "Chapter N:" headings in spine — try ORV_EPUB_MODE=merge or npm run ingest:bittu.',
    );
  }

  console.log(
    `Spine → ${out.length} novel chapter(s) by heading (slug orv-ch-N = chapter N, like ORV-Reader ch_N).`,
  );
  return out;
}

async function ingestMergedChapters(epubPath: string): Promise<Parsed[]> {
  const epub = await EPub.createAsync(epubPath);
  const flow = epub.flow;
  if (!flow?.length) throw new Error("EPUB has no spine / flow.");

  const parts: string[] = [];
  for (const item of flow) {
    if (!item?.id) continue;
    try {
      const html = await epub.getChapterAsync(item.id);
      const plain = htmlToPlainText(html);
      if (plain.length > 20) parts.push(plain);
    } catch {
      /* skip */
    }
  }

  const raw = parts.join("\n\n");
  if (raw.length < 2000) {
    throw new Error("Merged EPUB text too short.");
  }
  const expanded = expandChapterLineBreaks(raw);
  const text = normalizeText(expanded);
  return parseAllChapters(text);
}

async function main() {
  const epubPath = resolveEpubPath(PROJECT_ROOT);
  if (!epubPath) {
    console.error(
      "No .epub found. Add Final Ebup.epub / File.epub under content/, or set ORV_EPUB_PATH.",
    );
    process.exit(1);
  }

  const mode = (process.env.ORV_EPUB_MODE ?? "spine").toLowerCase().trim();
  const skip = resolvedSkipFirstChapters();
  console.log("Reading EPUB:", epubPath);
  console.log(`Mode: ${mode} (set ORV_EPUB_MODE=merge if the book uses "Chapter N:" in one file)`);

  let chapters: Parsed[];
  try {
    if (mode === "merge") {
      chapters = await ingestMergedChapters(epubPath);
      if (skip > 0) {
        const before = chapters.length;
        chapters = chapters.slice(skip);
        console.log(`ORV_SKIP_FIRST_CHAPTERS=${skip}: ${before} → ${chapters.length} parsed chapter(s).`);
      }
    } else {
      chapters = await ingestSpineChapters(epubPath, skip);
    }
  } catch (e) {
    console.error((e as Error).message);
    if (mode === "merge") {
      console.error('merge failed — try default spine mode (remove ORV_EPUB_MODE or set ORV_EPUB_MODE=spine).');
    } else {
      console.error(
        'spine failed — if this EPUB is one huge HTML file with "Chapter 1:" lines, set ORV_EPUB_MODE=merge (PowerShell: $env:ORV_EPUB_MODE="merge"; npm run ingest:epub)',
      );
    }
    process.exit(1);
  }

  if (chapters.length === 0) {
    console.error("No chapters to import.");
    process.exit(1);
  }

  const maxRaw = process.env.ORV_MAX_CHAPTERS?.trim();
  const maxChapters = maxRaw ? parseInt(maxRaw, 10) : undefined;
  if (maxChapters && maxChapters > 0) {
    chapters = chapters.slice(0, maxChapters);
    console.log(`ORV_MAX_CHAPTERS=${maxChapters} — importing first ${chapters.length} chapter(s) in list order.`);
  }

  console.log(`Importing ${chapters.length} chapter page(s).`);

  const asParsed = chapters as ParsedChapter[];
  if (shouldAttachBittuPanelsForIngest()) {
    console.log(
      "Fetching Bittu repo illustration lists per chapter (ORV_ATTACH_BITTU_ILLUSTRATIONS=0 to skip)…",
    );
    await enrichParsedChaptersWithBittuPanelFilenames(asParsed);
  }

  await writeNovelChaptersToDb(prisma, PROJECT_ROOT, asParsed);
  console.log("Done. Open /chapters → each item opens a full chapter page.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
