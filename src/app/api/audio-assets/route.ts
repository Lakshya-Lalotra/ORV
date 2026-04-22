import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrl } from "@/lib/orv-blob-url";
import { isAuthenticatedReader } from "@/lib/require-reader";

export async function GET() {
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const assets = await prisma.audioAsset.findMany({
      orderBy: { key: "asc" },
      select: { key: true, kind: true, url: true, label: true },
    });
    const withBlob = assets.map((a) => ({ ...a, url: publicAssetUrl(a.url) }));
    return NextResponse.json(withBlob);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
