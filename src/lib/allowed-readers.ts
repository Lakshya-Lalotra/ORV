/**
 * Server-only allowlist for the reader name gate.
 * Configure `ORV_ALLOWED_NAMES` in the deployment environment (never commit real names).
 * Comma- or newline-separated, case-insensitive after normalization.
 */

export function normalizeReaderName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Parsed once per cold start in middleware / route handlers. */
export function loadAllowedNamesFromEnv(): Set<string> {
  const raw = process.env.ORV_ALLOWED_NAMES?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\n]+/)
      .map((s) => normalizeReaderName(s))
      .filter((s) => s.length > 0),
  );
}

export function isAllowedReaderName(name: string): boolean {
  const n = normalizeReaderName(name);
  if (!n) return false;
  return loadAllowedNamesFromEnv().has(n);
}
