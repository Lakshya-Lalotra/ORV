import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  sessionId: z.string().min(8).max(128),
  chapterSlug: z.string().min(1).max(200),
  segmentIndex: z.number().int().min(0),
  scrollRatio: z.number().min(0).max(1),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId, chapterSlug, segmentIndex, scrollRatio } = parsed.data;

  const row = await prisma.readingProgress.upsert({
    where: {
      sessionId_chapterSlug: { sessionId, chapterSlug },
    },
    create: { sessionId, chapterSlug, segmentIndex, scrollRatio },
    update: { segmentIndex, scrollRatio },
  });

  return NextResponse.json({ ok: true, id: row.id });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const chapterSlug = searchParams.get("chapterSlug");
  if (!sessionId || !chapterSlug) {
    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  }

  const row = await prisma.readingProgress.findUnique({
    where: {
      sessionId_chapterSlug: { sessionId, chapterSlug },
    },
  });

  return NextResponse.json(row ?? null);
}
