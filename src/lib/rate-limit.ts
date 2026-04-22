import "server-only";

/**
 * In-memory fixed-window rate limiter keyed by a caller-supplied string
 * (typically `bucket:ip`). Good enough for small private deployments on
 * a single Node instance (Render Starter, Fly single VM). For horizontal
 * scaling, swap the `Map` for a Redis / Upstash backend — the API here
 * stays the same.
 *
 * Design notes:
 * - We never throw. Over-limit callers get `{ ok: false, retryAfter }`.
 * - The window is millisecond-precise; we round `retryAfter` up to the
 *   nearest second for `Retry-After` headers.
 * - A tiny sweeper prunes expired buckets every 10 windows so the Map
 *   stays small even under sustained abuse.
 */

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();
let sweepCounter = 0;

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number; retryAfter: number };

export type RateLimitOptions = {
  /** Max hits allowed in `windowMs`. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const existing = BUCKETS.get(key);

  if (!existing || existing.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    maybeSweep(now);
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter,
    };
  }

  existing.count += 1;
  BUCKETS.set(key, existing);
  maybeSweep(now);
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

function maybeSweep(now: number): void {
  sweepCounter = (sweepCounter + 1) % 100;
  if (sweepCounter !== 0) return;
  for (const [k, b] of BUCKETS) {
    if (b.resetAt <= now) BUCKETS.delete(k);
  }
}
