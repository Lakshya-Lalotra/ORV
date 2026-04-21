import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { IntroStepPayload, ProloguePayload } from "@/lib/prologue-types";

const CONTENT = "content";
const JSON_NAME = "prologue.json";
const TXT_NAME = "prologue.txt";

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

function contentPath(name: string): string {
  return path.join(process.cwd(), CONTENT, name);
}

/**
 * Load prologue copy for `/auth` (server-only).
 * Order: `content/prologue.json` → else `content/prologue.txt` (intro only) → null (client fallbacks).
 */
export function loadProloguePayload(): ProloguePayload | null {
  const jsonPath = contentPath(JSON_NAME);
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw) as ProloguePayload;
      if (Array.isArray(data.intro) && data.intro.length > 0) {
        const reveal = Array.isArray(data.reveal) ? data.reveal : [];
        return { intro: data.intro, reveal };
      }
    } catch {
      /* fall through */
    }
  }

  const txtPath = contentPath(TXT_NAME);
  if (fs.existsSync(txtPath)) {
    try {
      const raw = fs.readFileSync(txtPath, "utf8");
      const intro = parseIntroTextFile(raw);
      if (intro.length > 0) {
        return { intro, reveal: [] };
      }
    } catch {
      /* fall through */
    }
  }

  return null;
}
