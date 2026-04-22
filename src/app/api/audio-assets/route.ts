import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAssetUrl } from "@/lib/orv-blob-url";

export async function GET() {
  const assets = await prisma.audioAsset.findMany({
    orderBy: { key: "asc" },
    select: { key: true, kind: true, url: true, label: true },
  });
  const withBlob = assets.map((a) => ({ ...a, url: publicAssetUrl(a.url) }));
  return NextResponse.json(withBlob);
}
