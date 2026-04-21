import { NextResponse } from "next/server";
import { buildChapterPayload, buildMapOnlyChapterPayload } from "@/lib/chapter-payload";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { slug },
    include: {
      segments: {
        orderBy: { orderIndex: "asc" },
        include: { panel: true },
      },
    },
  });

  const payload = chapter ? buildChapterPayload(chapter) : buildMapOnlyChapterPayload(slug);

  if (!payload) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
