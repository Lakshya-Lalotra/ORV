/**
 * Ingest Omniscient Reader (or similar) plain-text / DJVU OCR exports into Prisma.
 * Expects body to start at "Chapter 1: Prologue..." after the table of contents.
 *
 *   npm run ingest:txt
 *   npm run ingest:txt:ia     # download full ~7.6MB from Internet Archive, then ingest
 *
 * Source (first match wins after optional download):
 *   --from-archive / ingest:txt:ia → fetch Archive DJVU text
 *   ORV_TXT_URL → fetch that URL first
 *   ORV_TXT_PATH → local file
 *   any .txt in content/ (see scripts/txt-path.ts)
 *
 * Optional: ORV_MAX_CHAPTERS=20 to cap import during testing.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "./ingest-shared";
import {
  expandChapterLineBreaks,
  parseAllChapters,
} from "./novel-parse";
import { resolveTxtPath } from "./txt-path";
import type { ParsedChapter } from "./write-novel-db";
import { writeNovelChaptersToDb } from "./write-novel-db";

const prisma = new PrismaClient();
const PROJECT_ROOT = process.cwd();

/** Full novel text on Internet Archive (same item you linked). ~7.6MB — not the 500KB partial. */
const IA_ORV_DJVU_TXT =
  "https://ia800403.us.archive.org/4/items/omniscient-readers-viewpoint-sing-shong-singsyong/Omniscient%20Reader%27s%20Viewpoint%20-%20Sing-shong%20%28singsyong%29_djvu.txt";

const FETCHED_LOCAL = path.join(PROJECT_ROOT, "content", "orv-archive-full.txt");

async function downloadText(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "orv-reader/1.0 (local ingest; full-text from user-provided Archive URL)",
    },
  });
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`Downloaded ${buf.length.toLocaleString()} bytes → ${dest}`);
}

function resolveFetchUrl(): string | null {
  const env = process.env.ORV_TXT_URL?.trim();
  if (env) return env;
  if (process.argv.includes("--from-archive")) return IA_ORV_DJVU_TXT;
  return null;
}

async function main() {
  const fetchUrl = resolveFetchUrl();
  if (fetchUrl) {
    console.log("Fetching:", fetchUrl);
    await downloadText(fetchUrl, FETCHED_LOCAL);
    process.env.ORV_TXT_PATH = FETCHED_LOCAL;
  }

  const fromEnv =
    process.env.ORV_TXT_PATH?.trim() && fs.existsSync(process.env.ORV_TXT_PATH)
      ? path.resolve(process.env.ORV_TXT_PATH)
      : null;
  const txtPath = fromEnv ?? resolveTxtPath(PROJECT_ROOT);
  if (!txtPath) {
    console.error(
      "No .txt found. Run npm run ingest:txt:ia, set ORV_TXT_URL, ORV_TXT_PATH, or add a .txt under content/.",
    );
    process.exit(1);
  }

  const maxRaw = process.env.ORV_MAX_CHAPTERS?.trim();
  const maxChapters = maxRaw ? parseInt(maxRaw, 10) : undefined;

  console.log("Reading text:", txtPath);
  const raw = fs.readFileSync(txtPath, "utf8");
  if (!raw.trim()) {
    console.error("File is empty. Save File.txt on disk, then run again.");
    process.exit(1);
  }
  const expanded = expandChapterLineBreaks(raw);
  const text = normalizeText(expanded);
  if (text.length < 2000) {
    console.error("Text file is too short.");
    process.exit(1);
  }

  let chapters: ReturnType<typeof parseAllChapters>;
  try {
    chapters = parseAllChapters(text);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  if (maxChapters && maxChapters > 0) {
    chapters = chapters.slice(0, maxChapters);
    console.log(`ORV_MAX_CHAPTERS=${maxChapters} — importing first ${chapters.length} chapter(s).`);
  }

  console.log(`Parsed ${chapters.length} chapter(s) from body.`);

  const asParsed = chapters as ParsedChapter[];
  await writeNovelChaptersToDb(prisma, PROJECT_ROOT, asParsed);
  console.log("Done. Open /chapters to browse.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
