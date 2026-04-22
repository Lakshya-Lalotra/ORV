import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  getNextManhwaIncrementalRange,
  defaultManhwaChapter0Url,
  type ManhwaIncrementalRange,
} from "@/lib/manhwa-incremental-range";
import { spawnManhwaIncrementalScrape } from "@/lib/run-manhwa-incremental-scrape";

/** Allow long scrapes when running on a host with writable `content/` + `public/panels`. */
export const maxDuration = 300;

function verifyCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

function logCron(message: string, extra?: Record<string, unknown>) {
  const payload = { source: "cron/manhwa-scrape", message, ...extra };
  console.log(JSON.stringify(payload));
}

async function runScrapeInBackground(range: ManhwaIncrementalRange | null) {
  if (!range) return;
  logCron("manhwa incremental scrape start", { from: range.from, to: range.to });
  try {
    const { exitCode, stderr } = await spawnManhwaIncrementalScrape(range);
    logCron("manhwa incremental scrape finished", {
      from: range.from,
      to: range.to,
      exitCode,
      stderrTail: stderr.slice(-2000),
    });
  } catch (e) {
    logCron("manhwa incremental scrape error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Secured trigger for weekly manhwa ingest. Set CRON_SECRET in the environment.
 *
 * - Vercel Cron: add `vercel.json` crons and the same CRON_SECRET; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * - Self-hosted: call `GET /api/cron/manhwa-scrape` with that header, or `?secret=<CRON_SECRET>`.
 *
 * Note: the scraper writes under `content/` and `public/panels/`. Serverless hosts often have a read-only
 * filesystem except `/tmp`; use this route on a machine with a persistent project directory, or run
 * `npm run scrape:manhwa:new` from CI/Task Scheduler and deploy artifacts.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = await getNextManhwaIncrementalRange();
  if (!range) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_baseline_or_empty_map",
      hint: "Populate content/manhwa-map.json with a full scrape first.",
    });
  }

  after(() => {
    void runScrapeInBackground(range);
  });

  return NextResponse.json(
    {
      ok: true,
      queued: true,
      range,
      templateUrl: defaultManhwaChapter0Url(),
    },
    { status: 202 },
  );
}

export async function POST(req: Request) {
  return GET(req);
}
