import "server-only";
import { cookies } from "next/headers";
import { loadAllowedNamesFromEnv, normalizeReaderName } from "@/lib/allowed-readers";

/**
 * Shared server-side reader check. Mirrors what `src/middleware.ts` does
 * for page navigations, but for API route handlers (middleware does not
 * run on `/api/*` in our config so each protected handler opts-in).
 *
 * - `ORV_BYPASS_AUTH=1` — deploy/QA switch; every call returns true.
 * - No cookie, empty cookie, or cookie not in `ORV_ALLOWED_NAMES` → false.
 *
 * Usage:
 *   if (!(await isAuthenticatedReader())) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */

const AUTH_COOKIE = "orv-reader-key";

export async function isAuthenticatedReader(): Promise<boolean> {
  if (process.env.ORV_BYPASS_AUTH === "1") return true;
  const jar = await cookies();
  const raw = jar.get(AUTH_COOKIE)?.value;
  if (!raw) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false;
  }
  const key = normalizeReaderName(decoded);
  if (!key) return false;
  return loadAllowedNamesFromEnv().has(key);
}
