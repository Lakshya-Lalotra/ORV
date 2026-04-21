/**
 * Ingest ORV one-shot / side-story EPUB at `content/orv_side.epub` into
 * `content/side/index.json` + `content/side/ch_N.json` (same schema as sequel).
 *
 * Chapters are numbered 1..N in spine order (no title-based chapter numbers).
 *
 *   npm run ingest:side
 *   npm run ingest:side -- --force
 *   npm run ingest:side -- --limit=5
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { EPub } from "epub2";
import * as cheerio from "cheerio";

type SegmentKind =
  | "line"
  | "notice"
  | "quote"
  | "window"
  | "divider"
  | "spacer";

type Segment = { kind: SegmentKind; text: string; title?: string };

type ChapterFile = {
  number: number;
  slug: string;
  title: string;
  order: number;
  segments: Segment[];
  authorNote: Segment[];
  sourceUrl: string;
  scrapedAt: string;
};

type IndexEntry = {
  number: number;
  slug: string;
  title: string;
  order: number;
};

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

/** Default: `content/orv_side.epub`. Override with `ORV_SIDE_EPUB` (relative to cwd or absolute). */
const EPUB_PATH = path.resolve(
  process.cwd(),
  process.env.ORV_SIDE_EPUB?.trim() || "content/orv_side.epub",
);
const OUT_DIR = path.resolve("content/side");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const EPUB_LABEL = path.basename(EPUB_PATH);

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function wipeSideDir() {
  if (!fs.existsSync(OUT_DIR)) return;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^ch_\d+\.json$/.test(f) || f === "index.json") {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
}

function slugFor(n: number): string {
  return `orv-side-ch-${n}`;
}

function fileFor(n: number): string {
  return path.join(OUT_DIR, `ch_${n}.json`);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function classifyParagraph(text: string): SegmentKind {
  const t = text.trim();
  if (t.startsWith("「") && t.endsWith("」")) return "quote";
  if (/^[\u2013\u2014]\s/.test(t)) return "notice";
  return "line";
}

function parseChapter(
  html: string,
  number: number,
): { title: string; segments: Segment[]; authorNote: Segment[] } {
  const $ = cheerio.load(html, { xmlMode: false });

  const h2 = $("h2").first();
  let title =
    (h2.text() || $("h1").first().text() || "").trim() || `Chapter ${number}`;
  title = normalizeWhitespace(title);

  $("script, style, header, nav").remove();
  $('section[epub\\:type="endnotes"]').remove();
  $('aside[epub\\:type="footnote"]').remove();
  $('a:contains("CLICK TO READ CHAPTER COMMENTS")').closest("p").remove();
  $("img").remove();
  $('a[epub\\:type="noteref"]').remove();

  const bodyEl = $("body").first();
  const root = bodyEl.length ? bodyEl : $.root();

  const segments: Segment[] = [];
  let inAuthorNote = false;
  const authorNote: Segment[] = [];

  const pushSeg = (seg: Segment) => {
    if (inAuthorNote) authorNote.push(seg);
    else segments.push(seg);
  };

  const visit = (nodes: cheerio.Cheerio<cheerio.AnyNode>) => {
    nodes.each((_, el) => {
      if (el.type !== "tag") return;
      const tag = el.tagName?.toLowerCase?.() ?? "";

      if (tag === "h2" || tag === "h1") return;

      if (tag === "hr") {
        pushSeg({ kind: "divider", text: "---" });
        return;
      }

      if (tag === "br") {
        pushSeg({ kind: "spacer", text: "" });
        return;
      }

      if (tag === "fieldset") {
        const inner = $(el);
        const lines: string[] = [];
        let fsTitle: string | null = null;
        inner.find("p, li, div").each((__, child) => {
          const txt = normalizeWhitespace($(child).text());
          if (!txt) return;
          if (!fsTitle && /^\[[^\]]+\]$/.test(txt)) fsTitle = txt;
          else lines.push(txt);
        });
        if (lines.length === 0 && !fsTitle) {
          const txt = normalizeWhitespace(inner.text());
          if (txt) {
            if (/^\[[^\]]+\]/.test(txt)) fsTitle = txt;
            else lines.push(txt);
          }
        }
        const windowText = [fsTitle, ...lines].filter(Boolean).join("\n");
        if (windowText) {
          pushSeg({
            kind: "window",
            text: windowText,
            ...(fsTitle ? { title: fsTitle } : {}),
          });
        }
        return;
      }

      if (tag === "p") {
        const text = normalizeWhitespace($(el).text());
        if (!text) return;
        if (!inAuthorNote && /^author['\u2019]?s?\s*note[:.\uFE55]?$/i.test(text)) {
          inAuthorNote = true;
          return;
        }
        pushSeg({ kind: classifyParagraph(text), text });
        return;
      }

      if (tag === "section" || tag === "article" || tag === "div" || tag === "main") {
        visit($(el).children());
        return;
      }
    });
  };

  visit(root.children());

  return {
    title,
    segments: tidySegments(segments),
    authorNote: tidySegments(authorNote),
  };
}

function tidySegments(segs: Segment[]): Segment[] {
  const isFiller = (s: Segment) => s.kind === "spacer" || s.kind === "divider";
  let i = 0;
  while (i < segs.length && isFiller(segs[i]!)) i++;
  let j = segs.length;
  while (j > i && isFiller(segs[j - 1]!)) j--;
  const trimmed = segs.slice(i, j);

  const out: Segment[] = [];
  let prev: Segment | null = null;
  for (const s of trimmed) {
    if (prev && isFiller(prev) && isFiller(s)) {
      if (s.kind === "divider" && prev.kind === "spacer") {
        out[out.length - 1] = s;
        prev = s;
      }
      continue;
    }
    out.push(s);
    prev = s;
  }
  return out;
}

function isIntroOrToc(id: string | undefined): boolean {
  if (!id) return false;
  const k = id.toLowerCase();
  return k === "intro" || k === "toc" || k === "cover" || k === "copyright";
}

async function run(args: Args): Promise<void> {
  if (!fs.existsSync(EPUB_PATH)) {
    console.error(`EPUB not found at ${EPUB_PATH}`);
    process.exit(1);
  }

  ensureOutDir();
  if (args.force) {
    console.log("--force → wiping content/side/ before rebuild.");
    wipeSideDir();
  }

  console.log(
    `Reading ${EPUB_LABEL} (${path.relative(process.cwd(), EPUB_PATH) || "."}) …`,
  );
  const epub = await EPub.createAsync(EPUB_PATH);
  const flow = epub.flow.filter((f) => f?.id && !isIntroOrToc(f.id));
  console.log(`Spine chapter items: ${flow.length}`);

  const generated: IndexEntry[] = [];
  const scrapedAt = new Date().toISOString();
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < flow.length; i++) {
    const item = flow[i]!;
    if (args.limit && i >= args.limit) break;

    const number = i + 1;
    if (args.from && number < args.from) continue;
    if (args.to && number > args.to) continue;

    let html: string;
    try {
      html = await epub.getChapterAsync(item.id!);
    } catch (e) {
      console.warn(`  ! could not read ${item.id}: ${(e as Error).message}`);
      failed++;
      continue;
    }
    if (!html || html.length < 20) continue;

    const metaTitle =
      (item.title && String(item.title).trim()) ||
      normalizeWhitespace(cheerio.load(html)("h2").first().text());

    const out = fileFor(number);
    if (!args.force && fs.existsSync(out)) {
      generated.push({
        number,
        slug: slugFor(number),
        title: metaTitle || `Part ${number}`,
        order: number,
      });
      skipped++;
      continue;
    }

    const { title, segments, authorNote } = parseChapter(html, number);
    const chapter: ChapterFile = {
      number,
      slug: slugFor(number),
      title: title || metaTitle || `Part ${number}`,
      order: number,
      segments,
      authorNote,
      sourceUrl: `epub:${EPUB_LABEL}#${item.id}`,
      scrapedAt,
    };
    fs.writeFileSync(out, JSON.stringify(chapter, null, 2) + "\n", "utf8");
    generated.push({
      number,
      slug: chapter.slug,
      title: chapter.title,
      order: chapter.order,
    });
    written++;

    if (written === 1 || written % 20 === 0) {
      console.log(
        `  ch ${number} → ${chapter.segments.length} segs, ${chapter.authorNote.length} note(s)`,
      );
    }
  }

  generated.sort((a, b) => a.number - b.number);
  let merged: IndexEntry[] = generated;
  if (!args.force && fs.existsSync(INDEX_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as IndexEntry[];
      const byNum = new Map<number, IndexEntry>();
      for (const e of prev) byNum.set(e.number, e);
      for (const e of generated) byNum.set(e.number, e);
      merged = [...byNum.values()].sort((a, b) => a.number - b.number);
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");

  console.log(
    `\nDone. written=${written}  skipped=${skipped}  failed=${failed}  index=${merged.length}`,
  );
  console.log(`Output: ${path.relative(process.cwd(), OUT_DIR)}`);
}

run(parseArgs(process.argv)).catch((e) => {
  console.error(e);
  process.exit(1);
});
