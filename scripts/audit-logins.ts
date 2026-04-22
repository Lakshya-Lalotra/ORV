/**
 * Print a report of reader-gate login attempts recorded in ReaderAuthAudit.
 *
 *   npm run audit:logins                       # last 7 days, all events
 *   npm run audit:logins -- --days=30          # widen the window
 *   npm run audit:logins -- --since=2026-04-01 # explicit ISO start
 *   npm run audit:logins -- --only=success     # only successful logins
 *   npm run audit:logins -- --only=fail        # only failed attempts
 *   npm run audit:logins -- --daily            # extra per-day histogram
 *   npm run audit:logins -- --limit=200        # how many recent rows to dump
 *
 * What each column means:
 *   IP (hash)   SHA-256(ORV_AUTH_AUDIT_SALT + ip), first 12 chars — one hash
 *               = one distinct origin. Raw IPs are never stored.
 *   First/Last  Oldest / newest attempt from that hash inside the window.
 *   OK / Fail   Successful / rejected attempts in the window.
 *   Device      Best guess parsed from the User-Agent string.
 */

import { config as loadDotenv } from "dotenv";
// Override anything set in the current shell so `.env` (Neon URL) wins even
// when a stale `DATABASE_URL` is exported in PowerShell / CI.
loadDotenv({ override: true });
import { PrismaClient } from "@prisma/client";

type Cli = {
  sinceIso: string | null;
  days: number;
  only: "all" | "success" | "fail";
  daily: boolean;
  limit: number;
};

function parseCli(argv: string[]): Cli {
  const out: Cli = { sinceIso: null, days: 7, only: "all", daily: false, limit: 100 };
  for (const raw of argv) {
    const a = raw.trim();
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    const key = k?.toLowerCase();
    const val = v ?? "";
    if (key === "days") out.days = Math.max(1, parseInt(val, 10) || 7);
    else if (key === "since") out.sinceIso = val;
    else if (key === "only") {
      const lower = val.toLowerCase();
      if (lower === "success" || lower === "ok") out.only = "success";
      else if (lower === "fail" || lower === "failed" || lower === "no") out.only = "fail";
      else out.only = "all";
    } else if (key === "daily") out.daily = true;
    else if (key === "limit") out.limit = Math.max(1, parseInt(val, 10) || 100);
  }
  return out;
}

function inferDevice(ua: string | null): string {
  const s = (ua ?? "").trim();
  if (!s) return "(no UA)";
  const lower = s.toLowerCase();
  if (/bot|crawler|spider|curl|wget|http-client/.test(lower)) return "bot/tool";
  if (/android/.test(lower)) return "Android";
  if (/iphone|ipod/.test(lower)) return "iPhone";
  if (/ipad/.test(lower)) return "iPad";
  if (/macintosh|mac os x/.test(lower)) return "Mac";
  if (/windows nt/.test(lower)) return "Windows";
  if (/linux/.test(lower)) return "Linux";
  return "other";
}

function shortHash(h: string | null): string {
  return (h ?? "(none)").slice(0, 12);
}

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const since = cli.sinceIso
    ? new Date(cli.sinceIso)
    : new Date(Date.now() - cli.days * 24 * 60 * 60 * 1000);
  if (isNaN(since.getTime())) {
    console.error(`Invalid --since value: ${cli.sinceIso}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const where: { createdAt: { gte: Date }; success?: boolean } = {
      createdAt: { gte: since },
    };
    if (cli.only === "success") where.success = true;
    if (cli.only === "fail") where.success = false;

    const rows = await prisma.readerAuthAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const totals = {
      total: rows.length,
      ok: rows.filter((r) => r.success).length,
      fail: rows.filter((r) => !r.success).length,
    };

    const uniqueIps = new Set(rows.map((r) => r.ipHash ?? "(null)"));
    const uniqueDevices = new Set(rows.map((r) => r.deviceHint ?? "(none)"));

    console.log("");
    console.log(`  orv-reader — auth audit report`);
    console.log(`  Window:   ${fmtDate(since)} → now`);
    console.log(`  Filter:   only=${cli.only}`);
    console.log("");
    console.log(`  Total attempts : ${totals.total}`);
    console.log(`     successful  : ${totals.ok}`);
    console.log(`         failed  : ${totals.fail}`);
    console.log(`  Unique IPs     : ${uniqueIps.size}`);
    console.log(`  Unique devices : ${uniqueDevices.size}`);

    if (totals.total === 0) {
      console.log("\n  No audit rows in range. (ORV_AUTH_AUDIT=0 disables writes.)\n");
      return;
    }

    type Agg = {
      first: Date;
      last: Date;
      ok: number;
      fail: number;
      uaSamples: Map<string, number>;
      devices: Set<string>;
    };
    const byIp = new Map<string, Agg>();
    for (const r of rows) {
      const key = r.ipHash ?? "(null)";
      const a =
        byIp.get(key) ??
        ({
          first: r.createdAt,
          last: r.createdAt,
          ok: 0,
          fail: 0,
          uaSamples: new Map(),
          devices: new Set<string>(),
        } as Agg);
      if (r.createdAt < a.first) a.first = r.createdAt;
      if (r.createdAt > a.last) a.last = r.createdAt;
      if (r.success) a.ok++;
      else a.fail++;
      if (r.userAgent) {
        const ua = r.userAgent.slice(0, 80);
        a.uaSamples.set(ua, (a.uaSamples.get(ua) ?? 0) + 1);
      }
      a.devices.add(inferDevice(r.userAgent));
      byIp.set(key, a);
    }

    const perIp = [...byIp.entries()]
      .map(([ipHash, a]) => ({
        ipHash,
        first: a.first,
        last: a.last,
        ok: a.ok,
        fail: a.fail,
        devices: [...a.devices].join(","),
        topUa:
          [...a.uaSamples.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ??
          "",
      }))
      .sort((x, y) => y.last.getTime() - x.last.getTime());

    console.log("\n  Per-IP summary (newest-last first):\n");
    console.log(
      "    IP (hash)    First                 Last                  OK   Fail  Device(s)   UA".padEnd(120),
    );
    for (const p of perIp) {
      const line =
        "    " +
        shortHash(p.ipHash).padEnd(13) +
        fmtDate(p.first) +
        "  " +
        fmtDate(p.last) +
        "  " +
        String(p.ok).padStart(3) +
        "  " +
        String(p.fail).padStart(4) +
        "  " +
        p.devices.padEnd(10) +
        "  " +
        p.topUa;
      console.log(line);
    }

    const suspicious = perIp.filter((p) => p.fail >= 3 && p.ok === 0);
    if (suspicious.length > 0) {
      console.log("\n  ⚠  Suspicious: failures-only with >= 3 attempts:");
      for (const p of suspicious) {
        console.log(
          `    ${shortHash(p.ipHash)}  fail=${p.fail}  devices=${p.devices}  last=${fmtDate(p.last)}`,
        );
      }
    }

    if (cli.daily) {
      const bucket = new Map<string, { ok: number; fail: number }>();
      for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const b = bucket.get(day) ?? { ok: 0, fail: 0 };
        if (r.success) b.ok++;
        else b.fail++;
        bucket.set(day, b);
      }
      console.log("\n  Daily histogram (UTC):\n");
      const days = [...bucket.keys()].sort();
      for (const d of days) {
        const b = bucket.get(d)!;
        const bar = "█".repeat(Math.min(60, b.ok + b.fail));
        console.log(
          `    ${d}  OK=${String(b.ok).padStart(3)}  Fail=${String(b.fail).padStart(3)}  ${bar}`,
        );
      }
    }

    const shown = Math.min(cli.limit, rows.length);
    console.log(`\n  Recent ${shown} row(s) (--limit to change):\n`);
    for (const r of rows.slice(0, shown)) {
      const flag = r.success ? "OK  " : "FAIL";
      console.log(
        `    ${fmtDate(r.createdAt)}  ${flag}  ip=${shortHash(r.ipHash)}  ` +
          `dev=${(r.deviceHint ?? "-").slice(0, 16).padEnd(16)}  ` +
          `ua=${(r.userAgent ?? "-").slice(0, 80)}`,
      );
    }

    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
