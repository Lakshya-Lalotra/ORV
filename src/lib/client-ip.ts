import "server-only";

/**
 * Best-effort client IP for rate-limiting / audit hashing.
 *
 * Trusts the first `x-forwarded-for` entry when set by a known edge
 * (Render / Vercel / Cloudflare all populate it); otherwise falls back
 * to `x-real-ip` or an opaque string so in-memory buckets still work
 * locally. We never log the raw IP — only its SHA-256 prefix in
 * `api/auth/verify`.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = headers.get("x-real-ip");
  if (xr) return xr.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return "unknown";
}
