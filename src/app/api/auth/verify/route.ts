import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isAllowedReaderName, normalizeReaderName } from "@/lib/allowed-readers";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const AUTH_COOKIE = "orv-reader-key";

/**
 * 10 attempts per IP per 10 minutes. Private allowlist — most users
 * succeed first try, so legitimate traffic never hits this. Blocks
 * distributed name-guessing without locking out a refresh-happy reader.
 */
const VERIFY_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.ORV_AUTH_AUDIT_SALT?.trim() || "orv-dev-salt-change-me";
  return createHash("sha256").update(`${salt}:${ip}`, "utf8").digest("hex").slice(0, 40);
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const rl = rateLimit(`auth-verify:${ip}`, VERIFY_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter),
          "X-RateLimit-Limit": String(VERIFY_LIMIT.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
        },
      },
    );
  }

  let body: { name?: string; deviceId?: string };
  try {
    body = (await request.json()) as { name?: string; deviceId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.name === "string" ? body.name : "";
  const name = normalizeReaderName(raw);
  if (!name || name.length > 120) {
    return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  }

  const allowed = isAllowedReaderName(name);
  const ua = request.headers.get("user-agent") ?? "";
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
