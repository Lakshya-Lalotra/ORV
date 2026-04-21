import type { Metadata } from "next";
import { Instrument_Serif, Share_Tech_Mono } from "next/font/google";
import { ReaderProvider } from "@/context/ReaderContext";
import { SystemOverlayProvider } from "@/components/SystemOverlay";
import { AuthTestResetter } from "@/components/AuthTestResetter";
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
          <ReaderProvider>
            <AuthTestResetter />
            {children}
          </ReaderProvider>
        </SystemOverlayProvider>
      </body>
    </html>
  );
}
