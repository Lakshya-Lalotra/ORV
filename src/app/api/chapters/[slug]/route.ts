import { NextResponse } from "next/server";
import { loadOrvChapterPayloadBySlug } from "@/lib/chapter-payload";
import { isAuthenticatedReader } from "@/lib/require-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  if (!slug || slug.length > 200 || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const payload = await loadOrvChapterPayloadBySlug(slug);
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
