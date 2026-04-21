import type { NextConfig } from "next";

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
    ],
  },
};

export default nextConfig;
