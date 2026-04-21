/**
 * Build content/manhwa-map.json from a folder tree of panel images.
 *
 * Does NOT download from third-party sites — place files you are allowed to use under:
 *   content/panels/orv-ch-1/*.webp
 *   content/panels/orv-ch-2/*.jpg
 * or folder names `1`, `2`, … (mapped to orv-ch-1, …).
 *
 * Usage:
 *   npm run build:manhwa-map
 *   npm run build:manhwa-map -- --sync          # copy content/panels → public/panels
 *   npm run build:manhwa-map -- --source public/panels
 *
 * Optional: ORV_PUBLIC_ORIGIN=https://yoursite.com  → absolute URLs in JSON
 */

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const PROJECT_ROOT = path.resolve(__dirname, "..");

const IMAGE_EXT = /\.(webp|png|jpe?g|avif|gif)$/i;

function slugFromDirName(name: string): string | null {
  const m = /^orv-ch-(\d+)$/i.exec(name);
  if (m) return `orv-ch-${m[1]}`;
  if (/^\d+$/.test(name)) return `orv-ch-${name}`;
  return null;
}

function listImageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  return names
    .filter((n) => IMAGE_EXT.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let sync = false;
  let source = process.env.ORV_PANELS_SOURCE?.trim() || "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sync") sync = true;
    else if (argv[i] === "--source" && argv[i + 1]) {
      source = argv[++i]!;
    }
  }
  if (!source) {
    const contentPanels = path.join(PROJECT_ROOT, "content", "panels");
    const publicPanels = path.join(PROJECT_ROOT, "public", "panels");
    if (fs.existsSync(contentPanels)) source = contentPanels;
    else source = publicPanels;
  }
  return { sync, source: path.resolve(PROJECT_ROOT, source) };
}

function main() {
  const { sync, source } = parseArgs();
  const destPublic = path.join(PROJECT_ROOT, "public", "panels");
  const origin = process.env.ORV_PUBLIC_ORIGIN?.replace(/\/$/, "") || "";

  if (!fs.existsSync(source)) {
    console.error(`Source folder missing: ${source}`);
    console.error(
      "Create content/panels/orv-ch-1/ (or 1/) with .webp/.jpg panels, or pass --source.",
    );
    process.exit(1);
  }

  if (sync) {
    if (!fs.existsSync(destPublic)) fs.mkdirSync(destPublic, { recursive: true });
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const slugDir = e.name;
      if (!slugFromDirName(slugDir)) continue;
      const from = path.join(source, slugDir);
      const to = path.join(destPublic, slugDir);
      fs.mkdirSync(to, { recursive: true });
      fs.cpSync(from, to, { recursive: true });
    }
    console.log(`Synced panel folders → ${path.relative(PROJECT_ROOT, destPublic)}`);
  }

  const scanRoot = sync ? destPublic : source;
  const out: Record<string, string[]> = {};

  const dirs = fs
    .readdirSync(scanRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dirName of dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const slug = slugFromDirName(dirName);
    if (!slug) continue;
    const dir = path.join(scanRoot, dirName);
    const files = listImageFiles(dir);
    if (files.length === 0) continue;

    const urls = files.map((f) => {
      const webPath = `/panels/${dirName}/${f.split(path.sep).pop()}`;
      return origin ? `${origin}${webPath}` : webPath;
    });
    out[slug] = urls;
    console.log(`${slug}: ${urls.length} panels`);
  }

  if (Object.keys(out).length === 0) {
    console.error(
      "No panel folders found. Expected subfolders named orv-ch-1 or 1 under:",
      scanRoot,
    );
    process.exit(1);
  }

  const outPath = path.join(PROJECT_ROOT, "content", "manhwa-map.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(PROJECT_ROOT, outPath)}`);

  if (!sync && !origin && source.includes(`${path.sep}content${path.sep}panels`)) {
    console.warn(
      "\nTip: panels are under content/panels but URLs point to /panels/... — run with --sync to copy into public/panels, or copy manually.",
    );
  }
}

main();
