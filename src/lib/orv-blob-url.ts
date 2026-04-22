/**
 * When the `public/` tree is mirrored on R2 (or any HTTPS origin), set
 * `NEXT_PUBLIC_ORV_BLOB_BASE` to that origin (no trailing slash), e.g.
 * `https://pub-xxxxx.r2.dev` or `https://cdn.yourdomain.com`
 *
 * Same path layout as in `public/`: /Video, /audio, /art, /branding, /panels, …
 * Absolute `http(s):` URLs are left unchanged.
 */
export function publicAssetUrl(href: string): string {
  const t = (href || "").trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  const base = process.env.NEXT_PUBLIC_ORV_BLOB_BASE?.trim() ?? "";
  if (!base) {
    return t.startsWith("/") ? t : `/${t}`;
  }
  const b = base.replace(/\/$/, "");
  const p = t.startsWith("/") ? t : `/${t}`;
  return `${b}${p}`;
}
