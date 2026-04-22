import { NextResponse, type NextRequest } from "next/server";
import { loadAllowedNamesFromEnv, normalizeReaderName } from "@/lib/allowed-readers";
import { PROLOGUE_COOKIE } from "@/lib/orv-auth-policy";

const AUTH_COOKIE = "orv-reader-key";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Admin / deploy QA: skip reader gate entirely when set (see src/lib/orv-auth-policy.ts).
  if (process.env.ORV_BYPASS_AUTH === "1") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // QA: ORV_ALWAYS_PROLOGUE=1 still sends allowlisted users to /auth on every
  // *full* navigation until they finish the finale. Once AuthGate sets
  // orv-prologue-complete=1, the same user may access the app (otherwise
  // "Continue" from the prologue never leaves /auth: middleware would always
  // 302 / → /auth again after router.replace).
  const allowed = loadAllowedNamesFromEnv();
  const raw = req.cookies.get(AUTH_COOKIE)?.value;
  const key = raw ? normalizeReaderName(decodeURIComponent(raw)) : "";
  const authed = Boolean(key && allowed.has(key));
  const prologueComplete = req.cookies.get(PROLOGUE_COOKIE)?.value === "1";
  const alwaysPrologue = process.env.ORV_ALWAYS_PROLOGUE === "1";

  if (authed && (!alwaysPrologue || prologueComplete)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/auth";
  url.search = "";
  if (pathname && pathname !== "/") {
    url.searchParams.set("next", pathname + (search ?? ""));
  }
  return NextResponse.redirect(url);
}

// Include `"/"` explicitly: a single pattern like `/((?!…).*)` can fail to
// run middleware on the home document in some Next.js versions, which breaks
// auth / ORV_ALWAYS_PROLOGUE for reloads on `/`.
export const config = {
  matcher: [
    "/",
    "/((?!api|_next/static|_next/image|favicon.ico|branding|audio|art|Video|video|panels|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp3|wav|ogg|txt|mp4|webm|mov|m4v|weba)).*)",
  ],
};
