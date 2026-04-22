/**
 * Map raw IP addresses to the `ipHash` values stored in ReaderAuthAudit.
 *
 * SHA-256 isn't reversible — but since the salt lives in your `.env`, we can
 * forward-hash candidate IPs with the exact algorithm `/api/auth/verify`
 * uses and see which audit rows they correspond to. That's enough to turn
 * opaque hashes into "this was my Pixel 7, this was person X" when you
 * already know the suspects' IPs.
 *
 *   npm run audit:dehash -- 203.0.113.42
 *   npm run audit:dehash -- 203.0.113.42 198.51.100.17 2001:db8::1
 *   npm run audit:dehash -- --file=known-ips.txt
 *   npm run audit:dehash -- --file=known-ips.txt --days=60
 *   npm run audit:dehash -- --list 203.0.113.42       # dump every match row
 *   npm run audit:dehash -- --all                      # list every known
 *                                                      # hash + match counts
 *                                                      # (no IPs needed)
 *
 * known-ips.txt format — one IP per line, `#` comments and blank lines OK.
 * Optional trailing label after a space/tab becomes the printed name:
 *
 *     203.0.113.42    Kim Dokja
 *     198.51.100.17   Lakshya pixel
 *     # old office link
 *     2001:db8::1     Sia MacBook
 */

import { config as loadDotenv } from "dotenv";
loadDotenv({ override: true });

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type Cli = {
  ips: { ip: string; label: string | null }[];
  filePath: string | null;
  days: number;
  sinceIso: string | null;
  list: boolean;
  all: boolean;
};

function parseCli(argv: string[]): Cli {
  const out: Cli = {
    ips: [],
    filePath: null,
    days: 30,
    sinceIso: null,
    list: false,
    all: false,
  };
  for (const raw of argv) {
    const a = raw.trim();
    if (!a) continue;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      const key = k?.toLowerCase();
      const val = v ?? "";
      if (key === "file") out.filePath = val;
      else if (key === "days") out.days = Math.max(1, parseInt(val, 10) || 30);
      else if (key === "since") out.sinceIso = val;
      else if (key === "list") out.list = true;
      else if (key === "all") out.all = true;
      continue;
    }
    out.ips.push({ ip: a, label: null });
  }
  return out;
}

function loadIpFile(fp: string): { ip: string; label: string | null }[] {
  const abs = path.resolve(fp);
  if (!fs.existsSync(abs)) throw new Error(`--file not found: ${abs}`);
  const text = fs.readFileSync(abs, "utf8");
  const out: { ip: string; label: string | null }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [ip, ...rest] = trimmed.split(/\s+/);
    if (!ip) continue;
    const label = rest.join(" ").trim() || null;
    out.push({ ip, label });
  }
  return out;
}

function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`, "utf8").digest("hex").slice(0, 40);
}

function fmt(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  if (cli.filePath) {
    cli.ips.push(...loadIpFile(cli.filePath));
  }

  const salt = process.env.ORV_AUTH_AUDIT_SALT?.trim();
  if (!salt) {
    console.error(
      "ORV_AUTH_AUDIT_SALT is not set in .env — cannot reproduce hashes. Copy the salt from Render env vars and retry.",
    );
    process.exit(1);
  }

  if (!cli.all && cli.ips.length === 0) {
    console.error(
      "Pass at least one IP, or --file=<path>, or --all to list every known hash.\n" +
        "  npm run audit:dehash -- 203.0.113.42\n" +
        "  npm run audit:dehash -- --file=known-ips.txt\n" +
        "  npm run audit:dehash -- --all",
    );
    process.exit(1);
  }

  const since = cli.sinceIso
    ? new Date(cli.sinceIso)
    : new Date(Date.now() - cli.days * 24 * 60 * 60 * 1000);
  if (isNaN(since.getTime())) {
    console.error(`Invalid --since: ${cli.sinceIso}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.readerAuthAudit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });

    // --- --all: dump every distinct hash seen in range with counts ---
    if (cli.all && cli.ips.length === 0) {
      const agg = new Map<
        string,
        { ok: number; fail: number; first: Date; last: Date; ua: string }
      >();
      for (const r of rows) {
        const key = r.ipHash ?? "(null)";
        const a =
          agg.get(key) ??
          { ok: 0, fail: 0, first: r.createdAt, last: r.createdAt, ua: "" };
        if (r.success) a.ok++;
        else a.fail++;
        if (r.createdAt < a.first) a.first = r.createdAt;
        if (r.createdAt > a.last) a.last = r.createdAt;
        if (!a.ua && r.userAgent) a.ua = r.userAgent;
        agg.set(key, a);
      }
      console.log(
        `\n  All hashes seen since ${fmt(since)} (${agg.size} unique, ${rows.length} rows):\n`,
      );
      for (const [h, a] of [...agg.entries()].sort(
        (x, y) => y[1].last.getTime() - x[1].last.getTime(),
      )) {
        console.log(
          `    ${h.slice(0, 12)}  OK=${String(a.ok).padStart(3)}  Fail=${String(a.fail).padStart(3)}  last=${fmt(a.last)}  ua=${a.ua.slice(0, 70)}`,
        );
      }
      console.log(
        `\n  To put a name on any of these, add the candidate IP to a known-ips.txt file and re-run with --file.\n`,
      );
      return;
    }

    // --- targeted: for each supplied IP, compute hash + count matches ---
    console.log(
      `\n  Dehash — salted sha256(ORV_AUTH_AUDIT_SALT + ":" + ip), first 40 chars`,
    );
    console.log(`  Window: ${fmt(since)} → now  (${rows.length} rows in range)\n`);
    console.log(
      "    IP                                 Hash (12)     OK   Fail  Last seen             Label",
    );
    console.log(
      "    " + "-".repeat(108),
    );

    const byHash = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.ipHash ?? "(null)";
      const list = byHash.get(k) ?? [];
      list.push(r);
      byHash.set(k, list);
    }

    const matchedRows: { ip: string; label: string | null; rows: typeof rows }[] = [];
    for (const { ip, label } of cli.ips) {
      const h = hashIp(ip, salt);
      const hits = byHash.get(h) ?? [];
      const ok = hits.filter((r) => r.success).length;
      const fail = hits.filter((r) => !r.success).length;
      const last = hits[0]?.createdAt; // rows are desc by createdAt
      console.log(
        "    " +
          ip.padEnd(34) +
          " " +
          h.slice(0, 12) +
          "  " +
          String(ok).padStart(3) +
          "  " +
          String(fail).padStart(4) +
          "  " +
          (last ? fmt(last) : "no match in window ").padEnd(20) +
          "  " +
          (label ?? ""),
      );
      if (cli.list && hits.length > 0) {
        matchedRows.push({ ip, label, rows: hits });
      }
    }

    if (cli.list) {
      for (const m of matchedRows) {
        console.log(
          `\n  --- ${m.ip}${m.label ? ` (${m.label})` : ""}  ${m.rows.length} row(s) ---`,
        );
        for (const r of m.rows) {
          const flag = r.success ? "OK  " : "FAIL";
          console.log(
            `    ${fmt(r.createdAt)}  ${flag}  dev=${(r.deviceHint ?? "-").slice(0, 16).padEnd(16)}  ua=${(r.userAgent ?? "-").slice(0, 80)}`,
          );
        }
      }
    }

    // Highlight any hash NOT matched by any supplied IP — those are the
    // "unknown" visitors you might still want to identify.
    if (cli.ips.length > 0) {
      const suppliedHashes = new Set(
        cli.ips.map((x) => hashIp(x.ip, salt)),
      );
      const unknown = [...byHash.keys()].filter(
        (h) => h !== "(null)" && !suppliedHashes.has(h),
      );
      if (unknown.length > 0) {
        console.log(
          `\n  ⚠  ${unknown.length} hash(es) in the window are NOT explained by any IP you supplied:`,
        );
        for (const h of unknown) {
          const list = byHash.get(h)!;
          const ua = list[0]?.userAgent ?? "";
          console.log(
            `    ${h.slice(0, 12)}  rows=${list.length}  ua=${ua.slice(0, 80)}`,
          );
        }
        console.log(
          `    (Ask the person for their IP and re-run, or use Render's live logs to map them.)\n`,
        );
      } else {
        console.log(
          `\n  All hashes in the window are accounted for by the IPs you supplied.\n`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
