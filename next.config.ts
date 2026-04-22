import type { NextConfig } from "next";

/** Allow `next/image` to load from R2 (or any HTTPS mirror of `public/`) at build time. */
function remotePatternForBlobBase(): { protocol: "https" | "http"; hostname: string; port?: string; pathname: "/**" }[] {
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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/Bittu5134/ORV-Reader/**",
      },
      {
        protocol: "https",
        hostname: "www.mangaread.org",
        pathname: "/wp-content/uploads/**",
      },
      {
        protocol: "https",
        hostname: "orv.pages.dev",
        pathname: "/**",
      },
      ...remotePatternForBlobBase(),
    ],
  },
};

export default nextConfig;
