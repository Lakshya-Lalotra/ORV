import type { NextConfig } from "next";

/**
 * Production hardening notes
 * --------------------------
 * - `poweredByHeader: false` strips `X-Powered-By: Next.js` so we don't
 *   announce the framework + version to fingerprinters.
 * - `productionBrowserSourceMaps: false` (default) keeps `.map` files
 *   off the CDN so our component / helper source isn't re-publishable.
 * - `reactStrictMode` surfaces double-mount / unsafe-effect bugs in dev.
 * - Security headers apply to *every* route via `headers()`. The CSP is
 *   deliberately permissive for inline styles (Tailwind + framer-motion
 *   rely on them) and for the R2 origin when `NEXT_PUBLIC_ORV_BLOB_BASE`
 *   is set, but it blocks `<iframe>` embedding, framing of third-party
 *   bases, and `eval()`-style script injection.
 */

function blobBaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_ORV_BLOB_BASE?.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return "";
  }
}

function remotePatternForBlobBase(): {
  protocol: "https" | "http";
  hostname: string;
  port?: string;
  pathname: "/**";
}[] {
  const b = process.env.NEXT_PUBLIC_ORV_BLOB_BASE?.trim();
  if (!b) return [];
  try {
    const u = new URL(b);
    if (u.protocol !== "https:" && u.protocol !== "http:") return [];
    return [
      {
        protocol: u.protocol === "https:" ? "https" : "http",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/**",
      },
    ];
  } catch {
    return [];
  }
}

function buildCsp(): string {
  const blob = blobBaseOrigin();
  // Image / media / font sources: always allow self + data: (favicons,
  // CSS-in-JS background SVGs, blurhash) + the R2 mirror when configured.
  // YouTube embed (anime trailer modal) needs youtube-nocookie.com for
  // the iframe src.
  const media = ["'self'", "data:", "blob:", blob].filter(Boolean).join(" ");
  const img = ["'self'", "data:", "blob:", blob, "https://raw.githubusercontent.com", "https://www.mangaread.org", "https://placehold.co"]
    .filter(Boolean)
    .join(" ");
  const connect = ["'self'", blob].filter(Boolean).join(" ");
  const frame = "https://www.youtube-nocookie.com";

  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${img}`,
    `media-src ${media}`,
    `font-src 'self' data:`,
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: buildCsp() },
];

// API responses must never be cached by shared proxies — they carry auth
// cookies + DB-backed payloads that shouldn't leak across users.
const API_NO_CACHE_HEADERS = [
  { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  experimental: {
    // Tree-shake heavy client bundles to their actually-used icons /
    // primitives. Safe for libraries with granular exports.
    optimizePackageImports: ["framer-motion", "gsap", "@gsap/react"],
  },
  images: {
    // When we do optimize, serve modern formats + cap DoS-bait sizes.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24, // 24h
    contentDispositionType: "inline",
    dangerouslyAllowSVG: false,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.mangaread.org",
        pathname: "/wp-content/uploads/**",
      },
      ...remotePatternForBlobBase(),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/api/:path*",
        headers: API_NO_CACHE_HEADERS,
      },
    ];
  },
};

export default nextConfig;
