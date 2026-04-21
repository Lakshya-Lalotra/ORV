/**
 * Ingest the ORV Sequel side-story from the local EPUB at
 * `content/orv_sequel.epub` (singNshong's community compile of the
 * orv.pages.dev fan translation, Ch 553–1000) and persist it as the
 * same structured JSON our `corpusChapterToPayload` / `ChapterReader` consume —
 * i.e. `content/sequel/index.json` + `content/sequel/ch_NNN.json`.
 *
 * Usage:
 *   npm run ingest:sequel                 # full ingest, skips chapters
 *                                          already on disk
 *   npm run ingest:sequel -- --force      # rewrite every file
 *   npm run ingest:sequel -- --limit=5    # first N spine chapters
 *   npm run ingest:sequel -- --from=553 --to=560
 *
 * Schema (stays identical to scripts/scrape-sequel.ts output so
 * src/lib/sequel-content.ts doesn't need changes):
 *
 *   {
 *     number, slug, title, order,
 *     segments:   [{ kind: "line" | "notice" | "quote" | "window" | "divider" | "spacer",
 *                    text: string, title?: string }],
 *     authorNote: [{ kind, text }, ...],
 *     sourceUrl:  "epub:orv_sequel.epub#N",
 *     scrapedAt:  ISO timestamp
 *   }
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

const EPUB_PATH = path.resolve("content/orv_sequel.epub");
const OUT_DIR = path.resolve("content/sequel");
const INDEX_PATH = path.join(OUT_DIR, "index.json");

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function wipeSequelDir() {
  if (!fs.existsSync(OUT_DIR)) return;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^ch_\d+\.json$/.test(f) || f === "index.json") {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
}

function slugFor(n: number): string {
  return `orv-seq-ch-${n}`;
}

function fileFor(n: number): string {
  return path.join(OUT_DIR, `ch_${n}.json`);
}

/** Whitespace cleanup — collapse runs of whitespace, trim ends. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Extract numeric chapter number from a title like "554 Episode 1. …" */
function numberFromTitle(title: string): number | null {
  const m = /^\s*(\d{3,4})\b/.exec(title);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Classify a bare `<p>` by its leading character.
 *
 *   - 「 … 」 (Japanese corner brackets) → quote (kind: "quote")
 *   - leading em-dash `— …` or en-dash `– …`   → notice
 *   - everything else                      → line
 */
function classifyParagraph(text: string): SegmentKind {
  const t = text.trim();
  if (t.startsWith("「") && t.endsWith("」")) return "quote";
  if (/^[\u2013\u2014]\s/.test(t)) return "notice";
  return "line";
}

/**
 * Walk a chapter element tree in document order, emitting segments.
 *
 * Elements we care about:
 *   <h2>      chapter title — skipped (stored on the chapter record)
 *   <p>       paragraph → "line" / "quote" / "notice" (see classifier)
 *   <fieldset> window/status-box → "window" segment
 *   <br>      spacer
 *   <hr>      divider
 *   <aside>   footnote → captured separately, not a segment
 *   <section epub:type="endnotes"> → collection of notes, skipped
 *   <header>  book-front header, skipped
 *   <a epub:type="noteref"> → inline footnote ref, stripped
 */
function parseChapter(
  html: string,
  number: number,
): { title: string; segments: Segment[]; authorNote: Segment[] } {
  const $ = cheerio.load(html, { xmlMode: false });

  // Pull title early so we can subtract it from the walk.
  const h2 = $("h2").first();
  let title =
    (h2.text() || $("h1").first().text() || "").trim() || `Chapter ${number}`;
  title = normalizeWhitespace(title);

  // Drop known chrome so the walker doesn't trip on it.
  $("script, style, header, nav").remove();
  $('section[epub\\:type="endnotes"]').remove();
  $('aside[epub\\:type="footnote"]').remove();
  // Community "click to read comments" bounce-out link.
  $('a:contains("CLICK TO READ CHAPTER COMMENTS")').closest("p").remove();
  // Cover / stigma icons at the top of each chapter.
  $("img").remove();
  // Inline footnote refs — not useful without the note body.
  $('a[epub\\:type="noteref"]').remove();

  // The root we walk: prefer <body> if present, else the doc itself.
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
        // Fallback: if no child paragraphs matched, use the whole text.
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
        // "Author's Note" marker — tolerates straight / curly
        // apostrophe, optional "s", and a trailing colon/period
        // ("Author's Note", "Authors Note:", "Author’s Note.", etc.).
        // Everything after it is routed into the authorNote bucket
        // rather than the main segment list.
        if (!inAuthorNote && /^author['\u2019]?s?\s*note[:.\uFE55]?$/i.test(text)) {
          inAuthorNote = true;
          return;
        }
        pushSeg({ kind: classifyParagraph(text), text });
        return;
      }

      // Any other container — recurse into its children so we don't
      // lose nested <p>/<fieldset>.
      if (
        tag === "section" ||
        tag === "article" ||
        tag === "div" ||
        tag === "main"
      ) {
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

/**
 * Drop leading/trailing filler (spacer / divider) and collapse any
 * run of consecutive filler to at most one divider + one spacer —
 * matches how the immersive reader spaces chapters.
 */
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
      // Prefer a divider over a spacer when a run collapses.
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

/** Parse a spine item id as a numeric index (ids in this epub are "1".."448"). */
function spineIndexFromId(id: string | undefined): number | null {
  if (!id) return null;
  if (!/^\d+$/.test(id)) return null;
  const n = parseInt(id, 10);
  return Number.isFinite(n) ? n : null;
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
    console.log("--force → wiping content/sequel/ before rebuild.");
    wipeSequelDir();
  }

  console.log(`Reading ${path.basename(EPUB_PATH)} …`);
  const epub = await EPub.createAsync(EPUB_PATH);
  const flow = epub.flow.filter((f) => f?.id && !isIntroOrToc(f.id));
  console.log(`Spine chapter items: ${flow.length}`);

  const plan = flow
    .map((item) => {
      const spineIdx = spineIndexFromId(item.id);
      return { item, spineIdx };
    })
    .filter((row) => row.spineIdx !== null);

  const generated: IndexEntry[] = [];
  const scrapedAt = new Date().toISOString();
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < plan.length; i++) {
    const { item } = plan[i]!;
    if (args.limit && i >= args.limit) break;

    let html: string;
    try {
      html = await epub.getChapterAsync(item.id!);
    } catch (e) {
      console.warn(`  ! could not read ${item.id}: ${(e as Error).message}`);
      failed++;
      continue;
    }
    if (!html || html.length < 20) continue;

    // Prefer the chapter number embedded in the title over spine order.
    const metaTitle =
      (item.title && String(item.title).trim()) ||
      normalizeWhitespace(cheerio.load(html)("h2").first().text());
    const number = numberFromTitle(metaTitle);
    if (number === null) {
      console.warn(
        `  ! no chapter number in title "${metaTitle.slice(0, 60)}" — skipping ${item.id}`,
      );
      failed++;
      continue;
    }

    if (args.from && number < args.from) continue;
    if (args.to && number > args.to) continue;

    const out = fileFor(number);
    if (!args.force && fs.existsSync(out)) {
      const entry: IndexEntry = {
        number,
        slug: slugFor(number),
        title: metaTitle,
        order: number,
      };
      generated.push(entry);
      skipped++;
      continue;
    }

    const { title, segments, authorNote } = parseChapter(html, number);
    const chapter: ChapterFile = {
      number,
      slug: slugFor(number),
      title: title || metaTitle,
      order: number,
      segments,
      authorNote,
      sourceUrl: `epub:orv_sequel.epub#${item.id}`,
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

    if (written === 1 || written % 50 === 0) {
      console.log(
        `  ch ${number} → ${chapter.segments.length} segs, ${chapter.authorNote.length} note(s)`,
      );
    }
  }

  generated.sort((a, b) => a.number - b.number);
  // Keep any pre-existing index entries for chapters we didn't touch this run
  // (e.g. `--limit`), so partial runs don't wipe the index.
  let merged: IndexEntry[] = generated;
  if (!args.force && fs.existsSync(INDEX_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as IndexEntry[];
      const byNum = new Map<number, IndexEntry>();
      for (const e of prev) byNum.set(e.number, e);
      for (const e of generated) byNum.set(e.number, e);
      merged = [...byNum.values()].sort((a, b) => a.number - b.number);
    } catch {
      /* ignore malformed previous index */
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
