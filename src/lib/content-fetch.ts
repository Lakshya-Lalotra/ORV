import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Server-only lazy content fetcher.
 *
 * Behavior per request:
 *   1. If `NEXT_PUBLIC_ORV_BLOB_BASE` is set (e.g. R2 public URL), fetch
 *      `{base}/{relPath}` with Next's `revalidate` cache so a warm instance
 *      serves JSON/text from memory between refreshes.
 *   2. Otherwise (or on any fetch/parse failure, and nothing else is cached),
 *      fall back to the local repo file at `<cwd>/{relPath}`.
 *
 * `relPath` is a POSIX-style path relative to the `public/`-style tree that
 * your R2 bucket mirrors, e.g. `content/prologue.json`,
 * `content/manhwa-map.json`, `content/sequel/ch_553.json`.
 *
 * Notes:
 *   - Returns `null` on missing / malformed data so call-sites can fall back.
 *   - Uses per-path tags so we can invalidate selectively (`revalidateTag`)
 *     if we ever expose a manual flush.
 *   - File `existsSync`-style checks are avoided: `readFile` throws ENOENT
 *     cleanly and we treat that as "not found".
 */

function blobBase(): string {
  return (process.env.NEXT_PUBLIC_ORV_BLOB_BASE ?? "").trim().replace(/\/$/, "");
}

function blobUrl(relPath: string): string | null {
  const base = blobBase();
  if (!base) return null;
  const clean = relPath.replace(/^\/+/, "");
  return `${base}/${clean}`;
}

// Statically scope to `content/` so Next's NFT doesn't trace the whole
// project as a runtime dependency (see build warning). `relPath` must start
// with `content/`; other trees (e.g. `public/`) are already served statically.
async function readLocal<T>(
  relPath: string,
  parse: (raw: string) => T,
): Promise<T | null> {
  const clean = relPath.replace(/^\/+/, "");
  if (!clean.startsWith("content/")) return null;
  const sub = clean.slice("content/".length).split("/").filter(Boolean);
  if (sub.length === 0) return null;
  const abs = path.join(process.cwd(), "content", ...sub);
  try {
    const raw = await fs.readFile(abs, "utf8");
    return parse(raw);
  } catch {
    return null;
  }
}

async function fetchRemote<T>(
  url: string,
  relPath: string,
  parse: (raw: string) => T,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600, tags: [`content:${relPath}`] },
    });
    if (!res.ok) return null;
    const raw = await res.text();
    return parse(raw);
  } catch {
    return null;
  }
}

/** Fetch JSON from R2 (if configured) else local fs. Returns null on failure. */
export async function fetchContentJson<T>(relPath: string): Promise<T | null> {
  const parse = (raw: string) => JSON.parse(raw) as T;
  const url = blobUrl(relPath);
  if (url) {
    const remote = await fetchRemote<T>(url, relPath, parse);
    if (remote !== null) return remote;
  }
  return readLocal<T>(relPath, parse);
}

/** Fetch plain text from R2 (if configured) else local fs. Returns null on failure. */
export async function fetchContentText(relPath: string): Promise<string | null> {
  const parse = (raw: string) => raw;
  const url = blobUrl(relPath);
  if (url) {
    const remote = await fetchRemote<string>(url, relPath, parse);
    if (remote !== null) return remote;
  }
  return readLocal<string>(relPath, parse);
}

/**
 * Fetch binary bytes from R2 (if configured) else local fs. Returns null on
 * failure. Caller owns the buffer. Used by the EPUB runtime loader to avoid
 * shipping every chapter JSON in the repo / bucket.
 */
export async function fetchContentBuffer(relPath: string): Promise<Buffer | null> {
  const clean = relPath.replace(/^\/+/, "");
  if (!clean.startsWith("content/")) return null;

  const url = blobUrl(relPath);
  if (url) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 86400, tags: [`content-bin:${relPath}`] },
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      /* fall through to local fs */
    }
  }

  const sub = clean.slice("content/".length).split("/").filter(Boolean);
  if (sub.length === 0) return null;
  const abs = path.join(process.cwd(), "content", ...sub);
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}
