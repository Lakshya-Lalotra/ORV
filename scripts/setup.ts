/**
 * One-shot local setup: Prisma client + schema, then TXT ingest, PDF ingest, or demo seed.
 * Run from repo root: npm run setup
 *
 * Optional .env:
 *   ORV_TXT_URL=https://...     → download then ingest
 *   ORV_FETCH_ARCHIVE=1         → same as npm run ingest:txt:ia (Archive full DJVU txt)
 *   ORV_SIDE_EPUB=...           → alternate path for one-shots EPUB (default: content/orv_side.epub)
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveEpubPath } from "./epub-path";
import { resolvePdfPath } from "./pdf-path";
import { resolveTxtPath } from "./txt-path";

const root = process.cwd();

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

console.log("\n  orv-reader — setup\n");

try {
  run("npx prisma generate");
  run("npx prisma db push");
} catch {
  process.exit(1);
}

const pdf = resolvePdfPath(root);
const epubLocal = resolveEpubPath(root);
const txtLocal = resolveTxtPath(root);
const wantRemote =
  Boolean(process.env.ORV_TXT_URL?.trim()) ||
  process.env.ORV_FETCH_ARCHIVE === "1";

if (wantRemote) {
  console.log(
    `\n  Full-text ingest (ORV_TXT_URL or ORV_FETCH_ARCHIVE=1 → Internet Archive if no URL)…\n`,
  );
  const cmd = process.env.ORV_TXT_URL?.trim()
    ? "npx tsx scripts/ingest-orv-txt.ts"
    : "npx tsx scripts/ingest-orv-txt.ts --from-archive";
  try {
    run(cmd);
  } catch {
    console.error("\n  Text ingest failed — trying PDF or demos.\n");
    if (pdf) {
      process.env.ORV_PDF_PATH = pdf;
      try {
        run("npx tsx scripts/ingest-orv-pdf.ts");
      } catch {
        run("npx prisma db seed");
      }
    } else {
      run("npx prisma db seed");
    }
  }
} else if (txtLocal) {
  console.log(`\n  Using local .txt: ${txtLocal}\n`);
  process.env.ORV_TXT_PATH = txtLocal;
  try {
    run("npx tsx scripts/ingest-orv-txt.ts");
  } catch {
    console.error("\n  Text ingest failed — trying PDF or demos.\n");
    if (pdf) {
      process.env.ORV_PDF_PATH = pdf;
      try {
        run("npx tsx scripts/ingest-orv-pdf.ts");
      } catch {
        run("npx prisma db seed");
      }
    } else {
      run("npx prisma db seed");
    }
  }
} else if (epubLocal) {
  console.log(`\n  Using EPUB: ${epubLocal}\n`);
  process.env.ORV_EPUB_PATH = epubLocal;
  try {
    run("npx tsx scripts/ingest-orv-epub.ts");
  } catch {
    console.error("\n  EPUB ingest failed — seeding demos.\n");
    run("npx prisma db seed");
  }
} else if (pdf) {
  console.log(`\n  Using PDF: ${pdf}\n`);
  process.env.ORV_PDF_PATH = pdf;
  try {
    run("npx tsx scripts/ingest-orv-pdf.ts");
  } catch {
    console.error(
      "\n  Ingest failed (image-only PDF, encrypted file, or bad extract). Seeding demos instead.\n",
    );
    run("npx prisma db seed");
  }
} else {
  console.log(
    "\n  No .txt, .epub, or .pdf in content/ — seeding three demo chapters (original placeholder text).\n",
  );
  run("npx prisma db seed");
}

const sideEpubResolved = process.env.ORV_SIDE_EPUB?.trim()
  ? path.resolve(root, process.env.ORV_SIDE_EPUB.trim())
  : path.join(root, "content", "orv_side.epub");
if (fs.existsSync(sideEpubResolved)) {
  console.log("\n  One-shots: ingesting content/side from orv_side.epub …\n");
  try {
    process.env.ORV_SIDE_EPUB = sideEpubResolved;
    run("npx tsx scripts/ingest-side-epub.ts");
  } catch {
    console.error("\n  Optional ingest:side failed — one-shots route may be empty until you run npm run ingest:side\n");
  }
}

console.log("\n  Done. Run: npm run dev  →  http://localhost:3000/chapters\n");
