import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAuthenticatedReader } from "@/lib/require-reader";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  sessionId: z.string().min(8).max(128),
  chapterSlug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Invalid chapterSlug"),
  segmentIndex: z.number().int().min(0).max(100_000),
  scrollRatio: z.number().min(0).max(1),
});

// 240 writes / minute / IP: covers scroll-throttled progress updates
// (typically 1-2/sec) even for users with multiple tabs open.
const PROGRESS_LIMIT = { limit: 240, windowMs: 60 * 1000 };

export async function POST(req: Request) {
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = rateLimit(`progress:${ip}`, PROGRESS_LIMIT);
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

  const { sessionId, chapterSlug, segmentIndex, scrollRatio } = parsed.data;

  try {
    const row = await prisma.readingProgress.upsert({
      where: { sessionId_chapterSlug: { sessionId, chapterSlug } },
      create: { sessionId, chapterSlug, segmentIndex, scrollRatio },
      update: { segmentIndex, scrollRatio },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const chapterSlug = searchParams.get("chapterSlug");

  if (!sessionId || sessionId.length < 8 || sessionId.length > 128) {
    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  }
  if (
    !chapterSlug ||
    chapterSlug.length > 200 ||
    !/^[a-z0-9][a-z0-9_-]*$/i.test(chapterSlug)
  ) {
    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  }

  try {
    const row = await prisma.readingProgress.findUnique({
      where: { sessionId_chapterSlug: { sessionId, chapterSlug } },
    });
    return NextResponse.json(row ?? null);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
