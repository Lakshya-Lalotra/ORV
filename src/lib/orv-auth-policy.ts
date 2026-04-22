/**
 * Auth / prologue policy (reference for production).
 *
 * - **Name allowlist**: Set `ORV_ALLOWED_NAMES` in the deployment environment only
 *   (comma-separated). The list is never shipped to the browser; verification runs
 *   in `POST /api/auth/verify`, which sets an **httpOnly** `orv-reader-key` cookie.
 * - **Middleware** (`middleware.ts`): Validates the cookie against the same env list.
 * - **MAC addresses**: Not available to websites; use optional `deviceId` (localStorage)
 *   + hashed IP in `ReaderAuthAudit` for coarse “returning device” analytics.
 * - **Post-prologue**: `AuthGate` sets `orv-prologue-complete=1` when the user
 *   finishes the finale (client-side; not yet checked by middleware).
 * - **Emergency bypass** (deploy / QA): set `ORV_BYPASS_AUTH=1` so middleware
 *   does not redirect to `/auth` (see `middleware.ts`).
 * - **Always prologue** (staging only): set `ORV_ALWAYS_PROLOGUE=1` so a
 *   valid `orv-reader-key` alone does not skip the gate; users must also have
 *   `orv-prologue-complete=1` (set when they finish the finale) or every full
 *   load goes to `/auth` again.
 */

export const PROLOGUE_COOKIE = "orv-prologue-complete";
