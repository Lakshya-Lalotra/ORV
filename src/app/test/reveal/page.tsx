import type { Metadata } from "next";
import { RevealTestScene } from "@/components/RevealTestScene";

export const metadata: Metadata = {
  title: "Reveal Test — ORV Reader",
  description: "Dev-only page for iterating on the post-auth reveal scene.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RevealTestPage() {
  return <RevealTestScene />;
}
