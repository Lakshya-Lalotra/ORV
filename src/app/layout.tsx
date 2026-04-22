import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Share_Tech_Mono } from "next/font/google";
import { ReaderProvider } from "@/context/ReaderContext";
import { SystemOverlayProvider } from "@/components/SystemOverlay";
import "./globals.css";

const serif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const mono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ORV Reader — Omniscient Reader's Viewpoint",
  description:
    "Choose web novel or manhwa, then read with audio and a Prisma-backed chapter API.",
  // Private allowlist-only deployment: don't invite crawlers to the
  // content or to dead-end behind the auth gate.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  // Prevent social scrapers from republishing the prologue / first
  // chapter on referral cards.
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * `viewport-fit=cover` is required so `env(safe-area-inset-*)` resolves
 * on notched / gesture-bar phones (Pixel 10, iPhone 14+, etc.). Without
 * it the prologue video leaves a system-color strip below the media and
 * the story library can't size to `100dvh` correctly.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${serif.variable} ${mono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] font-sans text-[var(--foreground)]">
        <SystemOverlayProvider>
          <ReaderProvider>{children}</ReaderProvider>
        </SystemOverlayProvider>
      </body>
    </html>
  );
}
