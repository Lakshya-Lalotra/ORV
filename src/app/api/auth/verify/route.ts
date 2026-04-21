import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isAllowedReaderName, normalizeReaderName } from "@/lib/allowed-readers";
import { prisma } from "@/lib/prisma";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const AUTH_COOKIE = "orv-reader-key";

function clientIp(request: Request): string | null {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.ORV_AUTH_AUDIT_SALT?.trim() || "orv-dev-salt-change-me";
  return createHash("sha256").update(`${salt}:${ip}`, "utf8").digest("hex").slice(0, 40);
}

export async function POST(request: Request) {
  let body: { name?: string; deviceId?: string };
  try {
    body = (await request.json()) as { name?: string; deviceId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.name === "string" ? body.name : "";
  const name = normalizeReaderName(raw);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  }

  const allowed = isAllowedReaderName(name);
  const ua = request.headers.get("user-agent") ?? "";
  const ip = clientIp(request);
  const ipHash = hashIp(ip);
  const deviceHint =
    typeof body.deviceId === "string" && body.deviceId.length < 200
      ? body.deviceId.slice(0, 128)
      : null;

  if (process.env.ORV_AUTH_AUDIT !== "0") {
    try {
      await prisma.readerAuthAudit.create({
        data: {
          success: allowed,
          ipHash,
          userAgent: ua.slice(0, 512),
          deviceHint,
        },
      });
    } catch {
      /* optional table / DB unavailable */
    }
  }

  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Access denied" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, encodeURIComponent(name), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
