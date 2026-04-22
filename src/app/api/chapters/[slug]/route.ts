import { NextResponse } from "next/server";
import { loadOrvChapterPayloadBySlug } from "@/lib/chapter-payload";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const payload = await loadOrvChapterPayloadBySlug(slug);

  if (!payload) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
