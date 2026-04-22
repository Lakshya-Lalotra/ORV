import "server-only";
import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EPub } from "epub2";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchContentBuffer } from "@/lib/content-fetch";
import type {
  SequelChapter,
  SequelIndexEntry,
  SequelSegment,
  SequelSegmentKind,
} from "@/lib/sequel-content-types";

/**
 * Runtime EPUB reader for the sequel / side corpora.
 *
 * Philosophy:
 *   - The EPUB (e.g. `content/orv_sequel.epub`) lives on R2 and is the
 *     single source of truth; we do NOT maintain a parallel tree of
 *     `content/sequel/ch_N.json` on R2.
 *   - On first access inside a server process, we download the EPUB once
 *     to `os.tmpdir()`, keep the `epub2` handle in memory, and lazily parse
 *     each chapter on demand (landing pages don't trigger a full parse).
 *   - Subsequent requests are served from in-memory caches (index + parsed
 *     chapters) so reader navigation is instant after the first cold hit.
 *   - Falls back to the local `content/*.epub` when
 *     `NEXT_PUBLIC_ORV_BLOB_BASE` isn't set (dev).
 *
 * Parse rules match `scripts/ingest-*-epub.ts` exactly so the reader UI
 * sees identical segments whether it loads via the old JSON cache or this
 * runtime path. If you tweak one, tweak the other.
 */

export type CorpusKind = "sequel" | "side" | "orv";

type CorpusConfig = {
  kind: CorpusKind;
  /** R2 / local `content/...` path to the EPUB file. */
  contentRel: string;
  /** `orv-ch-N` / `orv-seq-ch-N` / `orv-side-ch-N`. */
  slugFor: (n: number) => string;
  /** Slug → chapter number, or null if invalid. */
  parseSlug: (slug: string) => number | null;
  /**
   * Chapter numbering strategy:
   *   - "title": pull from the chapter <h2> / item.title (sequel).
   *   - "spine": spine position, 1-indexed (side).
   *   - "orv-id": parse `chapter_N` spine id (ORV main novel).
   */
  numbering: "title" | "spine" | "orv-id";
  /** Human label used in `sourceUrl`. */
  epubLabel: string;
  /**
   * Optional filter on the raw spine id. Default keeps everything except
   * intro/toc/cover/copyright. ORV main novel restricts to `chapter_*`.
   */
  flowFilter?: (id: string) => boolean;
  /**
   * ORV main novel: group `<p>[Title]</p>` + `<p>Author: …</p>` runs into
   * a single window segment (no `<fieldset>` wrapper).
   */
  bareWindowGrouping?: boolean;
  /** Drop `<h3>Chapter N: …</h3>` duplicates — the title lives on the item. */
  stripH3?: boolean;
};

const SEQUEL_CONFIG: CorpusConfig = {
  kind: "sequel",
  contentRel: "content/orv_sequel.epub",
  slugFor: (n) => `orv-seq-ch-${n}`,
  parseSlug: (slug) => {
    const m = /^orv-seq-ch-(\d+)$/.exec(slug);
    return m ? Number(m[1]) : null;
  },
  numbering: "title",
  epubLabel: "orv_sequel.epub",
};

const SIDE_CONFIG: CorpusConfig = {
  kind: "side",
  contentRel: "content/orv_side.epub",
  slugFor: (n) => `orv-side-ch-${n}`,
  parseSlug: (slug) => {
    const m = /^orv-side-ch-(\d+)$/.exec(slug);
    return m ? Number(m[1]) : null;
  },
  numbering: "spine",
  epubLabel: "orv_side.epub",
};

const ORV_CONFIG: CorpusConfig = {
  kind: "orv",
  contentRel: "content/Final Ebup.epub",
  slugFor: (n) => `orv-ch-${n}`,
  parseSlug: (slug) => {
    const m = /^orv-ch-(\d+)$/.exec(slug);
    return m ? Number(m[1]) : null;
  },
  numbering: "orv-id",
  epubLabel: "Final Ebup.epub",
  flowFilter: (id) => /^chapter_\d+$/i.test(id),
  bareWindowGrouping: true,
  stripH3: true,
};

const CONFIGS: Record<CorpusKind, CorpusConfig> = {
  sequel: SEQUEL_CONFIG,
  side: SIDE_CONFIG,
  orv: ORV_CONFIG,
};

function orvIdNumber(id: string): number | null {
  const m = /^chapter_(\d+)$/i.exec(id);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** ORV main novel heading: `"Chapter 12: Subtitle"` → `{ num, sub }`. */
function parseOrvChapterHeading(
  s: string,
): { num: number; sub: string } | null {
  const m = /^\s*(?:Chapter|Ch)\.?\s+(\d+)\s*[:\-\u2013\u2014]\s*(.*)$/i.exec(s);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return { num, sub: (m[2] ?? "").trim() };
}

// ---------- Parse helpers (mirror of scripts/ingest-*-epub.ts) ----------

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function numberFromTitle(title: string): number | null {
  const m = /^\s*(\d{3,4})\b/.exec(title);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

function classifyParagraph(text: string): SequelSegmentKind {
  const t = text.trim();
  if (t.startsWith("「") && t.endsWith("」")) return "quote";
  if (/^[\u2013\u2014]\s/.test(t)) return "notice";
  return "line";
}

function tidySegments(segs: SequelSegment[]): SequelSegment[] {
  const isFiller = (s: SequelSegment) =>
    s.kind === "spacer" || s.kind === "divider";
  let i = 0;
  while (i < segs.length && isFiller(segs[i]!)) i++;
  let j = segs.length;
  while (j > i && isFiller(segs[j - 1]!)) j--;
  const trimmed = segs.slice(i, j);

  const out: SequelSegment[] = [];
  let prev: SequelSegment | null = null;
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

const WINDOW_TITLE_RE = /^\[[^\]]+\]\.?$/;
const WINDOW_META_RE =
  /^(?:author\s*[:\-\u2013\u2014]\s*.+|\s*\d{1,3}(?:[,\s]\d{3})*(?:\s+)?chapters?\.?|status\s*[:\-\u2013\u2014]\s*.+|genre\s*[:\-\u2013\u2014]\s*.+|publisher\s*[:\-\u2013\u2014]\s*.+)$/i;

function parseChapterHtml(
  html: string,
  number: number,
  opts: { bareWindowGrouping?: boolean; stripH3?: boolean } = {},
): { title: string; segments: SequelSegment[]; authorNote: SequelSegment[] } {
  const $ = cheerio.load(html, { xmlMode: false });

  const h2 = $("h2").first();
  const h3 = $("h3").first();
  let title =
    (h2.text() || $("h1").first().text() || h3.text() || "").trim() ||
    `Chapter ${number}`;
  title = normalizeWhitespace(title);

  $("script, style, header, nav, figure, picture, source").remove();
  $('section[epub\\:type="endnotes"]').remove();
  $('aside[epub\\:type="footnote"]').remove();
  $('a:contains("CLICK TO READ CHAPTER COMMENTS")').closest("p").remove();
  $("img").remove();
  $('a[epub\\:type="noteref"]').remove();

  // Cheerio always materializes a body; fall back to a synthetic wrapper if
  // the loader receives a bare fragment, so the walker always sees Elements.
  const bodyEl = $("body").first();
  const root = bodyEl.length ? bodyEl : $("<body></body>").append($.root().contents());

  const segments: SequelSegment[] = [];
  let inAuthorNote = false;
  const authorNote: SequelSegment[] = [];
  // ORV main novel: pending bare-window group. `[Title]` paragraph
  // optimistically collects the Author/N-chapters meta lines that follow.
  let pending: { title: string; meta: string[] } | null = null;

  const pushSeg = (seg: SequelSegment) => {
    if (inAuthorNote) authorNote.push(seg);
    else segments.push(seg);
  };

  const flushPending = () => {
    if (!pending) return;
    if (pending.meta.length === 0) {
      pushSeg({ kind: classifyParagraph(pending.title), text: pending.title });
    } else {
      pushSeg({
        kind: "window",
        text: [pending.title, ...pending.meta].join("\n"),
        title: pending.title,
      });
    }
    pending = null;
  };

  const visit = (nodes: cheerio.Cheerio<AnyNode>) => {
    nodes.each((_, el) => {
      if (el.type !== "tag") return;
      const tag = el.tagName?.toLowerCase?.() ?? "";

      if (tag === "h1" || tag === "h2") {
        flushPending();
        return;
      }
      if (tag === "h3" || tag === "h4") {
        if (opts.stripH3) {
          flushPending();
          return;
        }
      }

      if (tag === "hr") {
        flushPending();
        pushSeg({ kind: "divider", text: "---" });
        return;
      }

      if (tag === "br") {
        flushPending();
        pushSeg({ kind: "spacer", text: "" });
        return;
      }

      if (tag === "fieldset") {
        flushPending();
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
        if (
          !inAuthorNote &&
          /^author['\u2019]?s?\s*note[:.\uFE55]?$/i.test(text)
        ) {
          flushPending();
          inAuthorNote = true;
          return;
        }

        if (opts.bareWindowGrouping) {
          if (pending) {
            if (WINDOW_META_RE.test(text)) {
              pending.meta.push(text);
              return;
            }
            flushPending();
          }
          if (WINDOW_TITLE_RE.test(text)) {
            pending = { title: text, meta: [] };
            return;
          }
        }

        pushSeg({ kind: classifyParagraph(text), text });
        return;
      }

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
  flushPending();

  return {
    title,
    segments: tidySegments(segments),
    authorNote: tidySegments(authorNote),
  };
}

function isIntroOrToc(id: string | undefined): boolean {
  if (!id) return false;
  const k = id.toLowerCase();
  return k === "intro" || k === "toc" || k === "cover" || k === "copyright";
}

function spineIndexFromId(id: string | undefined): number | null {
  if (!id) return null;
  if (!/^\d+$/.test(id)) return null;
  const n = parseInt(id, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- EPUB handle + caches (module-scoped per process) ----------

type FlowItem = {
  id: string;
  title?: string;
  number: number;
  order: number;
  slug: string;
};

type CorpusHandle = {
  epub: EPub;
  flow: FlowItem[];
  byNumber: Map<number, FlowItem>;
};

const handleCache = new Map<CorpusKind, Promise<CorpusHandle>>();
const chapterCache = new Map<CorpusKind, Map<number, SequelChapter>>();

/**
 * Materialize the EPUB to a stable tmp path. We keep the file on disk for
 * the lifetime of the process so `epub2` can stream chapter entries on
 * demand (it doesn't expose an in-memory constructor).
 */
async function ensureEpubOnDisk(cfg: CorpusConfig): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), "orv-epub");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, path.basename(cfg.contentRel));

  // In dev, the local copy at `content/*.epub` is fine — skip the copy.
  // Statically scope the path to `content/` so Next.js NFT tracing doesn't
  // walk the whole project (matches the fix in src/lib/content-fetch.ts).
  const sub = cfg.contentRel
    .replace(/^\/+/, "")
    .replace(/^content\//, "")
    .split("/")
    .filter(Boolean);
  if (sub.length > 0) {
    const localDev = path.join(process.cwd(), "content", ...sub);
    try {
      await fs.access(localDev);
      return localDev;
    } catch {
      /* fall through to R2 fetch */
    }
  }

  try {
    const st = await fs.stat(tmpPath);
    if (st.isFile() && st.size > 0) return tmpPath;
  } catch {
    /* need to download */
  }

  const buf = await fetchContentBuffer(cfg.contentRel);
  if (!buf) {
    throw new Error(
      `[epub-corpus] ${cfg.kind}: could not fetch ${cfg.contentRel} from R2 or local fs`,
    );
  }
  await fs.writeFile(tmpPath, buf);
  return tmpPath;
}

async function loadHandle(cfg: CorpusConfig): Promise<CorpusHandle> {
  const filePath = await ensureEpubOnDisk(cfg);
  const epub = await EPub.createAsync(filePath);
  type FlowEntry = { id?: string; title?: string };
  const rawFlow = (epub.flow as FlowEntry[]).filter((f) => {
    if (!f?.id) return false;
    if (cfg.flowFilter) return cfg.flowFilter(f.id);
    return !isIntroOrToc(f.id);
  });

  const items: FlowItem[] = [];
  for (let i = 0; i < rawFlow.length; i++) {
    const it = rawFlow[i]!;
    const id = it.id!;
    const metaTitle =
      (it.title && String(it.title).trim()) || `Part ${i + 1}`;
    let number: number | null;
    let displayTitle = metaTitle;

    if (cfg.numbering === "title") {
      number = numberFromTitle(metaTitle);
      if (number === null) {
        // Sequel layout: the numeric id is the spine index; skip unless valid.
        const spine = spineIndexFromId(id);
        if (spine === null) continue;
        number = null;
      }
      if (number === null) continue;
    } else if (cfg.numbering === "orv-id") {
      number = orvIdNumber(id);
      if (number === null) continue;
      // Prefer the `Chapter N: Subtitle` heading from the item metadata
      // (falls back to a bare `Chapter N` if missing).
      const parsed = parseOrvChapterHeading(metaTitle);
      if (parsed) {
        displayTitle = `Ch. ${parsed.num}: ${parsed.sub || metaTitle}`;
      } else {
        displayTitle = `Ch. ${number}`;
      }
    } else {
      number = i + 1;
    }
    items.push({
      id,
      title: displayTitle,
      number,
      order: number,
      slug: cfg.slugFor(number),
    });
  }
  items.sort((a, b) => a.number - b.number);

  const byNumber = new Map<number, FlowItem>();
  for (const it of items) byNumber.set(it.number, it);

  return { epub, flow: items, byNumber };
}

function getHandle(kind: CorpusKind): Promise<CorpusHandle> {
  let p = handleCache.get(kind);
  if (!p) {
    p = loadHandle(CONFIGS[kind]).catch((err) => {
      // Clear on failure so the next request can retry (e.g. transient R2 404).
      handleCache.delete(kind);
      throw err;
    });
    handleCache.set(kind, p);
  }
  return p;
}

function parsedChapterCache(kind: CorpusKind): Map<number, SequelChapter> {
  let m = chapterCache.get(kind);
  if (!m) {
    m = new Map();
    chapterCache.set(kind, m);
  }
  return m;
}

// ---------- Public API (used by sequel-content.ts / side-content.ts) ----------

export async function loadCorpusIndex(
  kind: CorpusKind,
): Promise<SequelIndexEntry[]> {
  try {
    const h = await getHandle(kind);
    return h.flow.map((f) => ({
      number: f.number,
      slug: f.slug,
      title: f.title ?? `Chapter ${f.number}`,
      order: f.order,
    }));
  } catch (err) {
    console.error(`[epub-corpus] loadCorpusIndex(${kind}) failed`, err);
    return [];
  }
}

export async function loadCorpusChapter(
  kind: CorpusKind,
  number: number,
): Promise<SequelChapter | null> {
  const cache = parsedChapterCache(kind);
  const hit = cache.get(number);
  if (hit) return hit;

  try {
    const h = await getHandle(kind);
    const item = h.byNumber.get(number);
    if (!item) return null;

    const html = await h.epub.getChapterAsync(item.id);
    if (!html || html.length < 20) return null;

    const cfg = CONFIGS[kind];
    const { title, segments, authorNote } = parseChapterHtml(html, number, {
      bareWindowGrouping: cfg.bareWindowGrouping,
      stripH3: cfg.stripH3,
    });
    // For ORV main novel the item.title already holds the cleaned
    // `Ch. N: Subtitle`; prefer it so the reader header matches `/chapters`.
    const displayTitle =
      cfg.numbering === "orv-id"
        ? item.title ?? `Ch. ${number}`
        : title || item.title || `Chapter ${number}`;
    const chapter: SequelChapter = {
      number,
      slug: item.slug,
      title: displayTitle,
      order: item.order,
      segments,
      authorNote,
      sourceUrl: `epub:${cfg.epubLabel}#${item.id}`,
      scrapedAt: new Date(0).toISOString(),
    };
    cache.set(number, chapter);
    return chapter;
  } catch (err) {
    console.error(
      `[epub-corpus] loadCorpusChapter(${kind}, ${number}) failed`,
      err,
    );
    return null;
  }
}

export async function loadCorpusChapterBySlug(
  kind: CorpusKind,
  slug: string,
): Promise<SequelChapter | null> {
  const n = CONFIGS[kind].parseSlug(slug);
  if (n === null) return null;
  return loadCorpusChapter(kind, n);
}
