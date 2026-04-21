import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const assets = await prisma.audioAsset.findMany({
    orderBy: { key: "asc" },
    select: { key: true, kind: true, url: true, label: true },
  });
  return NextResponse.json(assets);
}
