/**
 * Upload all .epub files under content/ to Cloudflare R2 (Wrangler).
 *
 * Prereqs:
 *   - export CLOUDFLARE_API_TOKEN="..."  OR  npx wrangler login
 *   - export R2_BUCKET="your-bucket-name"
 *
 * Optional:
 *   - R2_EPREFIX=epub   (object key prefix, default: epub)
 *
 * Usage (repo root):
 *   npm run upload:r2-epub
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const contentDir = path.join(root, "content");

const bucket = (process.env.R2_BUCKET || "").trim();
if (!bucket) {
  console.error("Set R2_BUCKET to your R2 bucket name.");
  process.exit(1);
}

const prefix = (process.env.R2_EPREFIX || "epub").replace(/^\/+|\/+$/g, "") || "epub";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

/**
 * @param {string} dir
 * @returns {Generator<string>}
 */
function* walkEpubs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkEpubs(p);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".epub")) {
      yield p;
    }
  }
}

const files = [...walkEpubs(contentDir)];
if (files.length === 0) {
  console.log(`No .epub files under ${contentDir}`);
  console.log("Add files (e.g. orv_side.epub) then run again.");
  process.exit(0);
}

let n = 0;
for (const file of files) {
  n++;
  const rel = path.relative(contentDir, file).split(path.sep).join("/");
  const key = `${prefix}/${rel}`;
  const dest = `${bucket}/${key}`;
  if (n === 1 || n % 5 === 0 || n === files.length) {
    console.log(`[${n}/${files.length}] ${key}`);
  }
  execFileSync(
    npx,
    [
      "--yes",
      "wrangler@4",
      "r2",
      "object",
      "put",
      dest,
      "--file",
      file,
      "--remote",
      "-y",
      "--content-type=application/epub+zip",
    ],
    { stdio: "inherit", env: process.env, cwd: root },
  );
}

console.log(`\nDone: ${files.length} EPUB(s) at ${prefix}/... in bucket ${bucket}.`);
console.log("Note: ingest scripts use local files; copy from R2 to content/ before npm run ingest:* (or set paths manually).");
