import { NextResponse, type NextRequest } from "next/server";
import { loadAllowedNamesFromEnv, normalizeReaderName } from "@/lib/allowed-readers";

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

  // QA / staging: do not use the allowlisted cookie to skip the gate—every
  // server navigation goes through `/auth` and the prologue. Client-side
  // routing can still open other routes without a new request.
  const alwaysPrologue = process.env.ORV_ALWAYS_PROLOGUE === "1";
  if (!alwaysPrologue) {
    const allowed = loadAllowedNamesFromEnv();
    const raw = req.cookies.get(AUTH_COOKIE)?.value;
    const key = raw ? normalizeReaderName(decodeURIComponent(raw)) : "";
    if (key && allowed.has(key)) {
      return NextResponse.next();
    }
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
