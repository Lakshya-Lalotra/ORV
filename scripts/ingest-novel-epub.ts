/**
 * Text-only ingest of the ORV main story from `content/Final Ebup.epub`.
 *
 *   npm run ingest:novel-epub
 *   npm run ingest:novel-epub -- --force        # re-write every chapter
 *   npm run ingest:novel-epub -- --limit=5      # first 5 spine chapters
 *   npm run ingest:novel-epub -- --from=1 --to=10
 *
 * Unlike `ingest:epub` (generic), this script:
 *
 *   1. Reads the spine HTML with cheerio so we can preserve structural
 *      blocks (notably `<fieldset>` status windows like
 *      `[Three Ways to Survive in a Ruined World]`) as a single
 *      window-sentinel segment — then the reader renders them via
 *      `StoryWindowCard`.
 *   2. Drops every `<img>` in the source so novel mode ships clean
 *      prose only — no webtoon-style panel attached to the text.
 *   3. Never writes `ManhwaPanel` rows. Manhwa mode still works
 *      because `buildChapterPayload` synthesises its panel array
 *      directly from `content/manhwa-map.json` (see src/lib/chapter-payload.ts).
 */

import "dotenv/config";
import path from "node:path";
import { EPub } from "epub2";
import * as cheerio from "cheerio";
import { PrismaClient } from "@prisma/client";

import { chapterMood, inferKind, normalizeText } from "./ingest-shared";
import { encodeWindowBlock } from "../src/lib/rich-segments";

const prisma = new PrismaClient();
const EPUB_PATH = path.resolve("content/Final Ebup.epub");

type Parsed = { num: number; title: string; body: string };

type Args = {
  force: boolean;
  limit?: number;
  from?: number;
  to?: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { force: false };
  for (const a of argv.slice(2)) {
    if (a === "--force") out.force = true;
    else if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]);
    else if (a.startsWith("--from=")) out.from = Number(a.split("=")[1]);
    else if (a.startsWith("--to=")) out.to = Number(a.split("=")[1]);
  }
  return out;
}

function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Parse `"Chapter 12: Some subtitle"` → `{ num: 12, sub: "Some subtitle" }`. */
function parseChapterHeading(s: string): { num: number; sub: string } | null {
  const m = /^\s*(?:Chapter|Ch)\.?\s+(\d+)\s*[:\-–—]\s*(.*)$/i.exec(s);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return { num, sub: (m[2] ?? "").trim() };
}

/**
 * Heuristics for grouping bare `<p>[Title]</p>` + `<p>Author: …</p>`
 * + optional `<p>N,NNN chapters.</p>` into one window block. ORV's EPUB
 * wraps some windows in `<fieldset>` (Ch 1's `[Three Ways to Survive]`)
 * but leaves many others as a sequence of bare `<p>` tags — those
 * still need to render as a single orv-window-card in the reader
 * (e.g. Ch 2's `[The World after the Fall]` / `Author: Sing Shangshong.`).
 */
const WINDOW_TITLE_RE = /^\[[^\]]+\]\.?$/;
const WINDOW_META_RE =
  /^(?:author\s*[:\-–—]\s*.+|\s*\d{1,3}(?:[,\s]\d{3})*(?:\s+)?chapters?\.?|status\s*[:\-–—]\s*.+|genre\s*[:\-–—]\s*.+|publisher\s*[:\-–—]\s*.+)$/i;

/**
 * Walk a chapter's cheerio tree, emitting ordered paragraphs. Windows
 * (`<fieldset>` **and** bare `<p>[Title]</p>` + meta lines) collapse
 * into a single WINDOW_SENTINEL line so they survive the downstream
 * paragraph splitter as one segment.
 */
function bodyFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Strip chrome we don't want in the novel text.
  $("script, style, nav, header, figure, picture, source").remove();
  $('section[epub\\:type="endnotes"]').remove();
  $('aside[epub\\:type="footnote"]').remove();
  $("img").remove();
  $("hr").remove();
  $('a:contains("CLICK TO READ CHAPTER COMMENTS")').closest("p").remove();

  const bodyEl = $("body").first();
  const root = bodyEl.length ? bodyEl : $.root();

  const out: string[] = [];
  // Pending bare-window group. When non-null we've just seen a
  // `[Title]`-only paragraph and are optimistically collecting the
  // Author / N-chapters meta lines that typically follow.
  let pending: { title: string; meta: string[] } | null = null;

  const flushPending = () => {
    if (!pending) return;
    if (pending.meta.length === 0) {
      // Lone bracketed line — keep it as a normal paragraph so the
      // reader still shows it, just without wrapping it in a window.
      out.push(pending.title);
    } else {
      const encoded = encodeWindowBlock([pending.title, ...pending.meta]);
      if (encoded) out.push(encoded);
    }
    pending = null;
  };

  const emitParagraph = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return;

    if (pending) {
      if (WINDOW_META_RE.test(t)) {
        pending.meta.push(t);
        return;
      }
      // Non-meta line ends the window group.
      flushPending();
    }

    if (WINDOW_TITLE_RE.test(t)) {
      pending = { title: t, meta: [] };
      return;
    }

    out.push(t);
  };

  const visit = (nodes: cheerio.Cheerio<cheerio.AnyNode>) => {
    nodes.each((_, el) => {
      if (el.type !== "tag") return;
      const tag = el.tagName?.toLowerCase?.() ?? "";

      if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
        // Drop the `<h3>Chapter N: …</h3>` duplicate — caller stores
        // the title on the chapter record.
        flushPending();
        return;
      }

      if (tag === "fieldset") {
        flushPending();
        const inner = $(el);
        const lines: string[] = [];
        inner.find("p, li, div").each((__, child) => {
          const txt = normWs($(child).text());
          if (txt) lines.push(txt);
        });
        if (lines.length === 0) {
          const txt = normWs(inner.text());
          if (txt) lines.push(txt);
        }
        const encoded = encodeWindowBlock(lines);
        if (encoded) out.push(encoded);
        return;
      }

      if (tag === "p") {
        emitParagraph($(el).text());
        return;
      }

      if (tag === "br") return;

      if (
        tag === "section" ||
        tag === "article" ||
        tag === "div" ||
        tag === "main" ||
        tag === "body"
      ) {
        visit($(el).children());
      }
    });
  };

  visit(root.children());
  flushPending();
  return out.join("\n\n");
}

async function ingestAll(args: Args): Promise<Parsed[]> {
  console.log(`Reading ${path.basename(EPUB_PATH)} …`);
  const epub = await EPub.createAsync(EPUB_PATH);
  const items = epub.flow.filter((f) => (f?.id ?? "").startsWith("chapter_"));
  console.log(`Numbered chapter items in spine: ${items.length}`);

  const chapters: Parsed[] = [];
  let kept = 0;

  for (let i = 0; i < items.length; i++) {
    if (args.limit && kept >= args.limit) break;
    const item = items[i]!;
    const html = await epub.getChapterAsync(item.id!).catch(() => "");
    if (!html) continue;

    const metaTitle =
      (item.title && String(item.title).trim()) ||
      normWs(cheerio.load(html)("h3").first().text());
    const parsed = parseChapterHeading(metaTitle);
    if (!parsed) {
      console.warn(
        `  ! no Chapter N: heading for ${item.id} (title=${JSON.stringify(metaTitle.slice(0, 80))}) — skipped`,
      );
      continue;
    }
    if (args.from && parsed.num < args.from) continue;
    if (args.to && parsed.num > args.to) continue;

    const body = normalizeText(bodyFromHtml(html));
    if (body.length < 40) {
      console.warn(`  ! body too short for chapter ${parsed.num} — skipped`);
      continue;
    }

    chapters.push({
      num: parsed.num,
      title: parsed.sub || `Chapter ${parsed.num}`,
      body,
    });
    kept++;
    if (kept === 1 || kept % 50 === 0) {
      console.log(`  ch ${parsed.num}: ${body.length} chars`);
    }
  }

  return chapters.sort((a, b) => a.num - b.num);
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function chapterDisplayTitle(num: number, subtitle: string): string {
  const t = subtitle.trim();
  const re = new RegExp(`^(?:Chapter|Ch)\\.?\\s*${num}\\s*:\\s*`, "i");
  const cleaned = t.replace(re, "").trim();
  return `Ch. ${num}: ${cleaned || t}`;
}

/**
 * Text-only DB writer — creates `Chapter` + `Segment` rows. No
 * `ManhwaPanel` rows (manhwa mode synthesises panels from
 * `manhwa-map.json` in `buildChapterPayload`).
 */
async function writeNovelTextOnly(chapters: Parsed[]): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.manhwaPanel.deleteMany();
      await tx.segment.deleteMany();
      await tx.chapter.deleteMany();

      for (const ch of chapters) {
        const slug = `orv-ch-${ch.num}`;
        const paragraphs = splitParagraphs(ch.body);
        if (paragraphs.length === 0) continue;

        const chapter = await tx.chapter.create({
          data: {
            slug,
            title: chapterDisplayTitle(ch.num, ch.title),
            order: ch.num,
            mood: chapterMood(ch.num),
            intensity: Math.min(95, 35 + (ch.num % 6) * 9),
          },
        });

        await tx.segment.createMany({
          data: paragraphs.map((text, i) => ({
            chapterId: chapter.id,
            orderIndex: i,
            kind: inferKind(text),
            text,
            keywordsJson: "[]",
          })),
        });

        if (ch.num === 1 || ch.num % 50 === 0) {
          console.log(`  wrote ${slug}: ${paragraphs.length} segments`);
        }
      }
    },
    { maxWait: 60_000, timeout: 600_000 },
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const chapters = await ingestAll(args);
  if (chapters.length === 0) {
    console.error("No chapters parsed from EPUB.");
    process.exit(1);
  }
  console.log(`Writing ${chapters.length} chapter(s) to DB (text-only) …`);
  await writeNovelTextOnly(chapters);
  console.log("Done. Open /chapters to verify novel mode.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
