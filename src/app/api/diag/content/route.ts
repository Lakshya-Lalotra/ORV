import { NextResponse } from "next/server";

/**
 * Content-availability probe. Exercises every content key the server reads
 * at runtime against the configured R2 base (and local fs as a fallback)
 * so you can see from Render logs / curl whether the bucket is reachable
 * and shaped correctly.
 *
 *   curl "https://your-app.onrender.com/api/diag/content?key=$CRON_SECRET"
 *
 * Reported fields per key:
 *   - r2Url           the exact URL the server tried on R2
 *   - r2Status        HTTP status (or "no-base" / "fetch-threw")
 *   - r2Bytes         Content-Length (if 2xx)
 *   - localPath       filesystem path the server falls back to
 *   - localExists     whether that file exists + its size
 *   - parsedKeys      sample of top-level JSON keys (first 5), or null
 *   - parsedKeyCount  total top-level JSON keys (for manhwa-map.json)
 *
 * Protected by `?key=` query matching CRON_SECRET to avoid leaking
 * configuration to the public.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

const PROBES = [
  { rel: "content/manhwa-map.json", kind: "json" },
  { rel: "content/prologue.json", kind: "json" },
  { rel: "content/prologue.txt", kind: "text" },
  { rel: "content/Final Ebup.epub", kind: "binary" },
  { rel: "content/orv_sequel.epub", kind: "binary" },
  { rel: "content/orv_side.epub", kind: "binary" },
] as const;

type ProbeResult = {
  rel: string;
  kind: string;
  r2Url: string | null;
  r2Status: string | number;
  r2Bytes: number | null;
  localPath: string;
  localExists: boolean;
  localBytes: number | null;
  parsedKeyCount?: number;
  parsedKeys?: string[];
  notes?: string;
};

function blobBase(): string {
  return (process.env.NEXT_PUBLIC_ORV_BLOB_BASE ?? "").trim().replace(/\/$/, "");
}

function encodeContentPath(rel: string): string {
  return rel
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function probeOne(rel: string, kind: string): Promise<ProbeResult> {
  const base = blobBase();
  const r2Url = base ? `${base}/${encodeContentPath(rel)}` : null;

  const clean = rel.replace(/^\/+/, "");
  const sub = clean.replace(/^content\//, "").split("/").filter(Boolean);
  const localPath = path.join(process.cwd(), "content", ...sub);

  const out: ProbeResult = {
    rel,
    kind,
    r2Url,
    r2Status: r2Url ? "pending" : "no-base",
    r2Bytes: null,
    localPath,
    localExists: false,
    localBytes: null,
  };

  if (r2Url) {
    try {
      const res = await fetch(r2Url, { cache: "no-store" });
      out.r2Status = res.status;
      const len = res.headers.get("content-length");
      out.r2Bytes = len ? Number(len) : null;
      if (res.ok && kind === "json") {
        try {
          const raw = await res.text();
          const parsed = JSON.parse(raw) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const keys = Object.keys(parsed);
            out.parsedKeyCount = keys.length;
            out.parsedKeys = keys.slice(0, 5);
          }
        } catch (err) {
          out.notes = `json parse failed: ${(err as Error).message}`;
        }
      }
    } catch (err) {
      out.r2Status = "fetch-threw";
      out.notes = (err as Error).message;
    }
  }

  try {
    const st = await fs.stat(localPath);
    out.localExists = st.isFile();
    out.localBytes = st.size;
  } catch {
    /* missing — that's the whole point of R2 */
  }

  return out;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  // Constant-time-ish string compare so timing on short secrets doesn't
  // leak length/prefix info. Not perfect (JS strings differ from Buffers)
  // but good enough for the admin-only probe.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret || !timingSafeEqualStr(key, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: ProbeResult[] = [];
  for (const p of PROBES) {
    results.push(await probeOne(p.rel, p.kind));
  }

  return NextResponse.json(
    {
      blobBase: blobBase() || null,
      cwd: process.cwd(),
      tmpdir: os.tmpdir(),
      results,
    },
    { status: 200 },
  );
}
