import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { loadProloguePayload } from "@/lib/prologue-load.server";
import { getRevealMediaUrls } from "@/lib/reveal-media";

export const metadata: Metadata = {
  title: "Enter — ORV Reader",
  description: "Speak your reader name to enter the shell.",
};

export const dynamic = "force-dynamic";

export default function AuthPage() {
  const prologue = loadProloguePayload();
  const media = getRevealMediaUrls();

  return (
    <Suspense fallback={null}>
      <AuthGate prologue={prologue} media={media} />
    </Suspense>
  );
}
