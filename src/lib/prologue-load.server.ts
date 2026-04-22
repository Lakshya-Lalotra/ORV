import "server-only";
import { fetchContentJson, fetchContentText } from "@/lib/content-fetch";
import type { IntroStepPayload, ProloguePayload } from "@/lib/prologue-types";

/**
 * Parse intro-only text file: one step per line. Optional whisper after a TAB.
 * Lines starting with # are ignored. Empty lines skipped.
 */
function parseIntroTextFile(raw: string): IntroStepPayload[] {
  const out: IntroStepPayload[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const tab = t.indexOf("\t");
    if (tab === -1) {
      out.push({ text: t });
    } else {
      const text = t.slice(0, tab).trimEnd();
      const whisper = t.slice(tab + 1).trim();
      out.push({ text, ...(whisper ? { whisper } : {}) });
    }
  }
  return out;
}

/**
 * Load prologue copy for `/auth` (server-only).
 * Order: `content/prologue.json` → else `content/prologue.txt` (intro only) → null (client fallbacks).
 * Sources: R2 when `NEXT_PUBLIC_ORV_BLOB_BASE` is set, local disk otherwise.
 */
export async function loadProloguePayload(): Promise<ProloguePayload | null> {
  const data = await fetchContentJson<ProloguePayload>("content/prologue.json");
  if (data && Array.isArray(data.intro) && data.intro.length > 0) {
    const reveal = Array.isArray(data.reveal) ? data.reveal : [];
    return { intro: data.intro, reveal };
  }

  const raw = await fetchContentText("content/prologue.txt");
  if (raw) {
    const intro = parseIntroTextFile(raw);
    if (intro.length > 0) return { intro, reveal: [] };
  }

  return null;
}
