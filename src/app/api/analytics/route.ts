import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAuthenticatedReader } from "@/lib/require-reader";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  sessionId: z.string().min(8).max(128),
  event: z.string().min(1).max(120),
  meta: z.record(z.string(), z.unknown()).optional(),
});

// Readers in the normal flow fire ~1 event/sec during transitions.
// 120 events per minute per IP gives generous headroom while stopping
// DB flooding from a rogue tab or script.
const ANALYTICS_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export async function POST(req: Request) {
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = rateLimit(`analytics:${ip}`, ANALYTICS_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { sessionId, event, meta } = parsed.data;

  try {
    await prisma.analyticsEvent.create({
      data: {
        sessionId,
        event,
        metaJson: JSON.stringify(meta ?? {}),
      },
    });
  } catch {
    // Never leak DB internals; treat write failures as silent so the
    // client can continue emitting events without being rate-signaled.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
