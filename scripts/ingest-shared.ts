import fs from "node:fs";
import path from "node:path";
import type { ChapterMood, SegmentKind } from "@prisma/client";
import { isWindowSegmentText } from "../src/lib/rich-segments";

export const MAX_SEGMENT_CHARS = 8000;

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= MAX_SEGMENT_CHARS) {
      out.push(p);
      continue;
    }
    let start = 0;
    while (start < p.length) {
      out.push(p.slice(start, start + MAX_SEGMENT_CHARS).trim());
      start += MAX_SEGMENT_CHARS;
    }
  }
  return out;
}

export function inferKind(text: string): SegmentKind {
  if (isWindowSegmentText(text)) return "system";
  const t = text.trim();
  if (/^\[[^\]]+\]/.test(t) || (/^\s*\[/.test(t) && t.includes("]"))) {
    return "system";
  }
  if (/^[“"'"「]/.test(t) || /^[\s]*[“"']/.test(t)) {
    return "dialogue";
  }
  if (
    t.length < 600 &&
    /\b(struck|slash|blade|blood|scream|explosion|collapsed)\b/i.test(t)
  ) {
    return "action";
  }
  return "narration";
}

export function chapterMood(n: number): ChapterMood {
  const cycle: ChapterMood[] = ["calm", "tension", "chaos"];
  return cycle[(n - 1) % cycle.length]!;
}

export function loadManhwaMap(projectRoot: string): Record<string, string[]> | null {
  const manifestPath = path.join(projectRoot, "content", "manhwa-map.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, string[]>;
    }
  } catch {
    console.warn("Could not parse content/manhwa-map.json — skipping panels.");
  }
  return null;
}

/** `https?://` or same-origin path `/foo` (not `//`). */
export function isUsablePanelImageUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith("//")) return false;
  return u.startsWith("/");
}

export type ParsedChapterShape = { num: number; title: string; body: string };

/**
 * Drop the first N chapters and renumber 1…n (slug orv-ch-1, titles Ch. 1: …).
 */
export function trimAndRenumberChapters<T extends ParsedChapterShape>(
  chapters: T[],
  skipFirst: number,
): T[] {
  const n = Math.max(0, Math.floor(skipFirst));
  const rest = chapters.slice(Math.min(n, chapters.length));
  return rest.map((ch, i) => ({ ...ch, num: i + 1 }));
}

/**
 * `ORV_SKIP_FIRST_CHAPTERS`: **spine** EPUB — drop first N spine **files** before heading parse.
 * **merge** EPUB — drop first N parsed chapters. Default **0**.
 */
export function resolvedSkipFirstChapters(): number {
  const raw = process.env.ORV_SKIP_FIRST_CHAPTERS?.trim();
  if (raw !== undefined && raw !== "") {
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return 0;
}
