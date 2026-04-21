import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  sessionId: z.string().min(8).max(128),
  event: z.string().min(1).max(120),
  meta: z.record(z.string(), z.any()).optional(),
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

  const { sessionId, event, meta } = parsed.data;

  await prisma.analyticsEvent.create({
    data: {
      sessionId,
      event,
      metaJson: JSON.stringify(meta ?? {}),
    },
  });

  return NextResponse.json({ ok: true });
}
