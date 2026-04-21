/**
 * Scrape ORV manhwa chapters from Mangaread, download chapter images locally,
 * publish them under public/panels, and keep content/manhwa-map.json in sync.
 *
 * Default run:
 *   npm run scrape:manhwa
 *
 * Default behavior (numeric range):
 * - Starts at chapter 0
 * - Walks forward through chapter 307
 * - Fetches panel images (see selectors in extractReadingContentImageUrls)
 *
 * Follow-next mode (irregular URLs like chapter-101_1 then chapter-102):
 *   npm run scrape:manhwa -- --follow-next
 *   npm run scrape:manhwa -- --follow-next --url "https://www.mangaread.org/.../chapter-101_1/"
 * Uses the site "Next" link (.nav-next a.next_page) each step until no next or --max-chapters.
 *
 * Legal: only scrape hosts and content you have the right to use.
 */

import fs from "node:fs";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import axios from "axios";
import type { AxiosError } from "axios";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import "dotenv/config";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MAP_PATH = path.join(PROJECT_ROOT, "content", "manhwa-map.json");
const PANELS_CONTENT = path.join(PROJECT_ROOT, "content", "panels");
const PANELS_PUBLIC = path.join(PROJECT_ROOT, "public", "panels");

const DEFAULT_URL =
  "https://www.mangaread.org/manga/omniscient-readers-viewpoint/chapter-0/";
const DEFAULT_FOLLOW_START =
  "https://www.mangaread.org/manga/omniscient-readers-viewpoint/chapter-101_1/";
const DEFAULT_FROM = 0;
const DEFAULT_TO = 307;

const UA =
  process.env.ORV_SCRAPE_UA?.trim() ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Args = {
  url: string;
  slug: string;
  download: boolean;
  dryRun: boolean;
  mergeMap: boolean;
  publish: boolean;
  from: number | null;
  to: number | null;
  delayMs: number;
  maxConsecutiveMisses: number;
  followNext: boolean;
  maxChapters: number;
};

function parseArgs(argv: string[]): Args {
  let url = DEFAULT_URL;
  let urlFromArg = false;
  let slug = "";
  let download = true;
  let dryRun = false;
  let mergeMap = true;
  let publish = true;
  let from: number | null = DEFAULT_FROM;
  let to: number | null = DEFAULT_TO;
  let delayMs = 600;
  let maxConsecutiveMisses = 1;
  let followNext = false;
  let maxChapters = 500;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--url" && argv[i + 1]) {
      url = argv[++i]!;
      urlFromArg = true;
    } else if (a === "--slug" && argv[i + 1]) slug = argv[++i]!;
    else if (a === "--download") download = true;
    else if (a === "--no-download") download = false;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--no-merge") mergeMap = false;
    else if (a === "--publish") publish = true;
    else if (a === "--no-publish") publish = false;
    else if (a === "--from" && argv[i + 1]) from = Number.parseInt(argv[++i]!, 10);
    else if (a === "--to" && argv[i + 1]) to = Number.parseInt(argv[++i]!, 10);
    else if (a === "--delay-ms" && argv[i + 1]) delayMs = Number.parseInt(argv[++i]!, 10);
    else if ((a === "--max-misses" || a === "--max-consecutive-misses") && argv[i + 1]) {
      maxConsecutiveMisses = Number.parseInt(argv[++i]!, 10);
    } else if (a === "--follow-next") followNext = true;
    else if (a === "--max-chapters" && argv[i + 1]) maxChapters = Number.parseInt(argv[++i]!, 10);
  }

  if (!Number.isFinite(delayMs) || delayMs < 0) delayMs = 600;
  if (!Number.isFinite(maxConsecutiveMisses) || maxConsecutiveMisses < 1) {
    maxConsecutiveMisses = 1;
  }
  if (!Number.isFinite(maxChapters) || maxChapters < 1) maxChapters = 500;

  if (followNext) {
    from = null;
    to = null;
    if (!urlFromArg) url = DEFAULT_FOLLOW_START;
  }

  return {
    url,
    slug,
    download,
    dryRun,
    mergeMap,
    publish,
    from: from !== null && Number.isFinite(from) ? from : null,
    to: to !== null && Number.isFinite(to) ? to : null,
    delayMs,
    maxConsecutiveMisses,
    followNext,
    maxChapters,
  };
}

function normalizeSlug(raw: string): string {
  const s = raw.trim();
  const numberOnly = /^(\d+)$/.exec(s);
  if (numberOnly) return `orv-ch-${numberOnly[1]}`;
  const orvSlug = /^orv-ch-(\d+)$/i.exec(s);
  if (orvSlug) return `orv-ch-${orvSlug[1]}`;
  return s;
}

/** Replace the first /chapter-<digits>/ path segment with /chapter-{n}/. */
export function chapterUrlForNumber(templateUrl: string, chapterNum: number): string | null {
  if (!/\/chapter-\d+(?=\/|\?|#|$)/.test(templateUrl)) return null;
  return templateUrl.replace(/\/chapter-\d+(?=\/|\?|#|$)/, `/chapter-${chapterNum}`);
}

function withListStyle(rawUrl: string): string {
  return rawUrl.includes("style=")
    ? rawUrl
    : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}style=list`;
}

function imageUrlFromImg($: cheerio.CheerioAPI, el: Element, pageUrl: string): string | null {
  const $el = $(el);
  const raw =
    $el.attr("data-src")?.trim() ||
    $el.attr("data-lazy-src")?.trim() ||
    $el.attr("data-original")?.trim() ||
    $el.attr("src")?.trim();
  if (!raw || raw.startsWith("data:")) return null;
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;
  try {
    return new URL(cleaned, pageUrl).href;
  } catch {
    return null;
  }
}

function collectReadingImages(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  imgSelector: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  $(imgSelector).each((_, el) => {
    const href = imageUrlFromImg($, el as Element, pageUrl);
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push(href);
  });
  return out;
}

export function extractReadingContentImageUrls(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  let imgs = collectReadingImages(
    $,
    pageUrl,
    ".reading-content .page-break.no-gaps img[id^='image-']",
  );
  if (imgs.length === 0) {
    imgs = collectReadingImages($, pageUrl, ".reading-content img");
  }
  return imgs;
}

/** Stable id for "same chapter page" (ignores ?style= / trailing slash). */
export function chapterVisitKey(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl);
    const path = u.pathname.replace(/\/$/, "") || "/";
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Next chapter URL from Madara reading nav (e.g. a.next_page inside .nav-next).
 */
export function extractNextChapterUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const currentKey = chapterVisitKey(withListStyle(pageUrl));
  const selectors = [
    ".select-pagination .nav-links .nav-next a.next_page[href]",
    ".nav-links .nav-next a.next_page[href]",
    "a.btn.next_page[href]",
    ".nav-next a[href]",
    'link[rel="next"][href]',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    const raw = el.attr("href")?.trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) continue;
    let abs: string;
    try {
      abs = new URL(raw, pageUrl).href;
    } catch {
      continue;
    }
    if (!/\/chapter-[^/]+\/?/i.test(abs)) continue;
    if (chapterVisitKey(withListStyle(abs)) === currentKey) continue;
    return abs;
  }
  return null;
}

/**
 * Map scraped chapter page to manhwa-map key (orv-ch-N). Splits like chapter-101_1 -> orv-ch-101.
 */
export function slugFromChapterPage(pageUrl: string, html: string): string {
  const $ = cheerio.load(html);
  const heading = $("#chapter-heading").first().text();
  const fromTitle = /chapter\s*[:\s.-]*(\d+)/i.exec(heading);
  if (fromTitle?.[1]) return `orv-ch-${fromTitle[1]}`;

  try {
    const u = new URL(pageUrl);
    const pathM = /\/chapter-([^/]+)\/?$/i.exec(u.pathname);
    if (pathM) {
      const raw = pathM[1]!;
      const splitPart = /^(\d+)_\d+$/.exec(raw);
      if (splitPart) return `orv-ch-${splitPart[1]}`;
      if (/^\d+$/.test(raw)) return `orv-ch-${raw}`;
      return `orv-ch-${raw.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    }
  } catch {
    /* ignore */
  }
  return "orv-ch-unknown";
}

function loadExistingMap(): Record<string, string[]> {
  if (!fs.existsSync(MAP_PATH)) return {};
  try {
    const raw = fs.readFileSync(MAP_PATH, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, string[]>;
    }
  } catch {
    // ignore parse issues and rebuild from scratch for touched chapters
  }
  return {};
}

function writeMap(map: Record<string, string[]>) {
  fs.mkdirSync(path.dirname(MAP_PATH), { recursive: true });
  fs.writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

function ensureCleanDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadToDir(
  urls: string[],
  dir: string,
  referer: string,
): Promise<string[]> {
  ensureCleanDir(dir);
  const saved: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname.split("/").pop() || "") || ".jpg";
    const filename = `${String(i + 1).padStart(3, "0")}${ext}`;
    const filePath = path.join(dir, filename);

    const res = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent": UA,
        Referer: referer,
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    await pipeline(res.data, createWriteStream(filePath));
    saved.push(filename);
    console.log(`    saved ${filename}`);
  }

  return saved;
}

function publishDownloadedPanels(slug: string, names: string[]) {
  const sourceDir = path.join(PANELS_CONTENT, slug);
  const publicDir = path.join(PANELS_PUBLIC, slug);
  ensureCleanDir(publicDir);
  for (const name of names) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(publicDir, name));
  }
}

async function fetchChapterHtml(rawUrl: string): Promise<{ html: string; pageUrl: string }> {
  const pageUrl = withListStyle(rawUrl);
  const { data: html } = await axios.get<string>(pageUrl, {
    headers: { "User-Agent": UA },
    maxRedirects: 5,
    responseType: "text",
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return { html, pageUrl };
}

async function fetchChapterImageUrls(rawUrl: string): Promise<string[]> {
  const { html, pageUrl } = await fetchChapterHtml(rawUrl);
  return extractReadingContentImageUrls(html, pageUrl);
}

function isNotFound(err: unknown): boolean {
  const ax = err as AxiosError | undefined;
  const status = ax?.response?.status;
  return status === 404 || status === 410;
}

async function runSingleChapter(args: Args) {
  if (!args.url) {
    console.error("Missing --url.");
    process.exit(1);
  }
  if (!args.slug) {
    console.error("Missing --slug (for example: --slug 0 or --slug orv-ch-0).");
    process.exit(1);
  }

  const slug = normalizeSlug(args.slug);
  const map = args.mergeMap ? loadExistingMap() : {};

  console.log(`GET ${args.url}`);
  let urls: string[];
  try {
    urls = await fetchChapterImageUrls(args.url);
  } catch (error) {
    console.error(isNotFound(error) ? "Chapter not found." : error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(`Found ${urls.length} panel image(s).`);
  if (urls.length === 0) {
    console.error("No matching images found inside .reading-content.");
    process.exit(1);
  }

  if (args.dryRun) {
    for (const url of urls) console.log(url);
    return;
  }

  let downloadedNames: string[] | null = null;
  if (args.download) {
    const contentDir = path.join(PANELS_CONTENT, slug);
    console.log(`Downloading -> ${path.relative(PROJECT_ROOT, contentDir)}`);
    downloadedNames = await downloadToDir(urls, contentDir, args.url);
    if (args.publish) {
      publishDownloadedPanels(slug, downloadedNames);
      console.log(`Published -> ${path.relative(PROJECT_ROOT, path.join(PANELS_PUBLIC, slug))}`);
    }
  }

  if (args.mergeMap) {
    if (downloadedNames?.length) {
      map[slug] = downloadedNames.map((name) => `/panels/${slug}/${name}`);
    } else {
      map[slug] = urls;
    }
    writeMap(map);
    console.log(`Map updated -> ${slug}: ${map[slug]!.length} panel(s)`);
  }
}

async function runFollowNext(args: Args) {
  if (args.slug) {
    console.warn("Ignoring --slug in --follow-next mode (slug derived per chapter from page URL / heading).");
  }

  const map = args.mergeMap ? loadExistingMap() : {};
  const visited = new Set<string>();
  let rawChapterUrl = args.url;
  let ok = 0;
  let misses = 0;

  for (let step = 0; step < args.maxChapters; step++) {
    const listUrl = withListStyle(rawChapterUrl);
    const visitKey = chapterVisitKey(listUrl);
    if (visited.has(visitKey)) {
      console.error(`Already visited ${listUrl} — cycle detected, stopping.`);
      break;
    }
    visited.add(visitKey);

    if (args.dryRun) {
      console.log(`[dry-run] ${step + 1} GET ${listUrl}`);
    }

    let html: string;
    let pageUrl: string;
    try {
      const fetched = await fetchChapterHtml(rawChapterUrl);
      html = fetched.html;
      pageUrl = fetched.pageUrl;
    } catch (error) {
      console.error(
        isNotFound(error)
          ? `Not found: ${listUrl}`
          : error instanceof Error
            ? error.message
            : error,
      );
      break;
    }

    const slug = slugFromChapterPage(pageUrl, html);
    const urls = extractReadingContentImageUrls(html, pageUrl);
    const nextAbs = extractNextChapterUrl(html, pageUrl);

    if (args.dryRun) {
      console.log(`  slug=${slug} images=${urls.length} next=${nextAbs ?? "(none)"}`);
      if (!nextAbs) break;
      rawChapterUrl = nextAbs;
      if (args.delayMs > 0) await sleep(args.delayMs);
      continue;
    }

    process.stdout.write(`[${step + 1}] ${slug} GET ${pageUrl} … `);

    if (urls.length === 0) {
      console.log("no images.");
      misses++;
      if (misses >= args.maxConsecutiveMisses) {
        console.error(`Stopping after ${args.maxConsecutiveMisses} consecutive empty chapter(s).`);
        break;
      }
    } else {
      console.log(`${urls.length} panel(s).`);
      misses = 0;
      ok++;

      let downloadedNames: string[] | null = null;
      if (args.download) {
        const contentDir = path.join(PANELS_CONTENT, slug);
        console.log(`  Download -> ${path.relative(PROJECT_ROOT, contentDir)}`);
        downloadedNames = await downloadToDir(urls, contentDir, pageUrl);
        if (args.publish) {
          publishDownloadedPanels(slug, downloadedNames);
          console.log(`  Publish -> ${path.relative(PROJECT_ROOT, path.join(PANELS_PUBLIC, slug))}`);
        }
      }

      if (args.mergeMap) {
        if (downloadedNames?.length) {
          map[slug] = downloadedNames.map((name) => `/panels/${slug}/${name}`);
        } else {
          map[slug] = urls;
        }
        writeMap(map);
        console.log(`  Map updated -> ${slug}`);
      }
    }

    if (!nextAbs) {
      console.log("No next chapter link — done.");
      break;
    }

    rawChapterUrl = nextAbs;
    if (step + 1 < args.maxChapters && args.delayMs > 0) await sleep(args.delayMs);
  }

  if (args.dryRun) {
    console.log(`Dry run finished (${visited.size} chapter URL(s) queued).`);
    return;
  }

  console.log(`\nDone. Scraped ${ok} chapter(s) with panels (follow-next).`);
  if (args.mergeMap) {
    console.log(`Map file -> ${path.relative(PROJECT_ROOT, MAP_PATH)}`);
  }
}

async function runChapterRange(args: Args) {
  if (!args.url) {
    console.error("Missing --url.");
    process.exit(1);
  }
  if (args.from === null || args.to === null) {
    console.error("Range mode requires --from and --to.");
    process.exit(1);
  }
  if (args.from > args.to) {
    console.error("--from must be <= --to.");
    process.exit(1);
  }
  if (chapterUrlForNumber(args.url, args.from) === null) {
    console.error('URL must contain a path segment like "/chapter-0/".');
    process.exit(1);
  }
  if (args.slug) {
    console.warn("Ignoring --slug in range mode.");
  }

  const map = args.mergeMap ? loadExistingMap() : {};
  let ok = 0;
  let misses = 0;

  for (let chapterNum = args.from; chapterNum <= args.to; chapterNum++) {
    const chapterUrl = chapterUrlForNumber(args.url, chapterNum);
    if (!chapterUrl) continue;

    const slug = `orv-ch-${chapterNum}`;

    if (args.dryRun) {
      console.log(`[dry-run] ${slug} -> ${chapterUrl}`);
      misses = 0;
      continue;
    }

    process.stdout.write(`[${chapterNum}/${args.to}] GET ${chapterUrl} ... `);

    let urls: string[];
    try {
      urls = await fetchChapterImageUrls(chapterUrl);
    } catch (error) {
      if (isNotFound(error)) {
        console.log("404.");
      } else {
        console.log(`error: ${error instanceof Error ? error.message : error}`);
      }
      misses++;
      if (misses >= args.maxConsecutiveMisses) {
        console.error(
          `Stopping after ${args.maxConsecutiveMisses} consecutive missing/empty chapter(s).`,
        );
        break;
      }
      if (chapterNum < args.to && args.delayMs > 0) await sleep(args.delayMs);
      continue;
    }

    if (urls.length === 0) {
      console.log("no images.");
      misses++;
      if (misses >= args.maxConsecutiveMisses) {
        console.error(
          `Stopping after ${args.maxConsecutiveMisses} consecutive missing/empty chapter(s).`,
        );
        break;
      }
      if (chapterNum < args.to && args.delayMs > 0) await sleep(args.delayMs);
      continue;
    }

    console.log(`${urls.length} panel(s).`);
    misses = 0;
    ok++;

    let downloadedNames: string[] | null = null;
    if (args.download) {
      const contentDir = path.join(PANELS_CONTENT, slug);
      console.log(`  Download -> ${path.relative(PROJECT_ROOT, contentDir)}`);
      downloadedNames = await downloadToDir(urls, contentDir, chapterUrl);
      if (args.publish) {
        publishDownloadedPanels(slug, downloadedNames);
        console.log(`  Publish -> ${path.relative(PROJECT_ROOT, path.join(PANELS_PUBLIC, slug))}`);
      }
    }

    if (args.mergeMap) {
      if (downloadedNames?.length) {
        map[slug] = downloadedNames.map((name) => `/panels/${slug}/${name}`);
      } else {
        map[slug] = urls;
      }
      writeMap(map);
      console.log(`  Map updated -> ${slug}`);
    }

    if (chapterNum < args.to && args.delayMs > 0) await sleep(args.delayMs);
  }

  if (args.dryRun) {
    console.log(`Would scrape chapters ${args.from} through ${args.to}.`);
    return;
  }

  console.log(`\nDone. Scraped ${ok} chapter(s) with panels.`);
  if (args.mergeMap) {
    console.log(`Map file -> ${path.relative(PROJECT_ROOT, MAP_PATH)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rangeMode = !args.followNext && args.from !== null && args.to !== null;
  if (args.followNext) {
    await runFollowNext(args);
  } else if (rangeMode) {
    await runChapterRange(args);
  } else {
    await runSingleChapter(args);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
