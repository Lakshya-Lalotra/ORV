/**
 * Scrape only chapters after the latest entry in content/manhwa-map.json.
 *
 *   npm run scrape:manhwa:new
 *
 * Env:
 *   ORV_MANHWA_INCREMENTAL_MAX — how many new chapter numbers to try (default 5, max 50)
 *   ORV_MANHWA_SCRAPE_TO_CAP — optional upper bound for --to (e.g. match site latest)
 *   ORV_MANHWA_BASE_URL — template URL containing /chapter-0/ (default: Mangaread ORV ch.0)
 *
 * Legal: only scrape hosts and content you have the right to use.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  defaultManhwaChapter0Url,
  getNextManhwaIncrementalRange,
} from "../src/lib/manhwa-incremental-range";

const PROJECT_ROOT = process.cwd();

async function main() {
  const range = await getNextManhwaIncrementalRange();
  if (!range) {
    console.log(
      "[manhwa-incremental] No numeric chapters in manhwa-map.json yet. Run a full range first, e.g.\n" +
        '  npm run scrape:manhwa -- --from 0 --to 50 --url "https://www.mangaread.org/manga/omniscient-readers-viewpoint/chapter-0/"',
    );
    process.exit(0);
  }

  const url = defaultManhwaChapter0Url();
  console.log(
    `[manhwa-incremental] Chapters ${range.from}..${range.to} (template ${url})`,
  );

  const script = path.join(PROJECT_ROOT, "scripts", "scrape-manhwa-chapter.ts");
  const result = spawnSync(
    "npx",
    [
      "tsx",
      script,
      "--",
      "--from",
      String(range.from),
      "--to",
      String(range.to),
      "--url",
      url,
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );

  process.exit(result.status ?? 1);
}

void main();
