import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { loadProloguePayload } from "@/lib/prologue-load.server";
import { getRevealMediaUrls } from "@/lib/reveal-media";
import { PROLOGUE_COOKIE } from "@/lib/orv-auth-policy";

export const metadata: Metadata = {
  title: "Enter — ORV Reader",
  description: "Speak your reader name to enter the shell.",
};

export const dynamic = "force-dynamic";

type AuthPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * /auth?replay=1 — testing: clear `orv-prologue-complete` and remount the
 * gate from the “tap to start” step (full prologue again) without freezing
 * / after you leave with “Continue” on a normal visit.
 */
export default async function AuthPage({ searchParams }: AuthPageProps) {
  const sp = await searchParams;
  const raw = sp.replay;
  const replay = raw === "1" || (Array.isArray(raw) && raw[0] === "1");
  if (replay) {
    (await cookies()).delete(PROLOGUE_COOKIE);
  }

  const prologue = await loadProloguePayload();
  const media = getRevealMediaUrls();
  // Fresh mount when replay=1. We previously used `Date.now()` inline
  // which React's pure-render lint flags as impure. The page is
  // `force-dynamic`, so the platform's per-request trace ID changes on
  // every navigation and gives us a stable-per-render key without
  // calling a side-effectful function mid-render.
  const hdrs = await headers();
  const replayToken =
    hdrs.get("x-request-id") ??
    hdrs.get("x-vercel-id") ??
    hdrs.get("x-render-id") ??
    "replay";
  const remountKey = replay ? `replay-${replayToken}` : "default";

  return (
    <Suspense fallback={null}>
      <AuthGate key={remountKey} prologue={prologue} media={media} />
    </Suspense>
  );
}
