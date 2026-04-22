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
 * - **Always prologue (QA / staging)**: set `ORV_ALWAYS_PROLOGUE=1` so a valid
 *   `orv-reader-key` alone is not enough — the reader must have completed the
 *   current prologue (via `orv-prologue-complete=1` set at the end of the
 *   finale). That simulates a “first visit to the shell” for allowlisted
 *   testers, but “Continue” still works: after the finale, navigation to `/`
 *   is allowed. It is **not** meant to lock the app.
 * - **Re-run the full prologue** (e.g. after testing): open
 *   `/auth?replay=1` — the server clears `orv-prologue-complete` and the gate
 *   remounts from the first tap. Works with or without `ORV_ALWAYS_PROLOGUE`.
 */

export const PROLOGUE_COOKIE = "orv-prologue-complete";
