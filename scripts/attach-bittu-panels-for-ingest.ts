/**
 * After EPUB/TXT parse, fetch matching Bittu5134/ORV-Reader chap_NNNNN.txt files and
 * collect <cover>/<img> filenames so write-novel-db can attach panel URLs.
 *
 * Default ON. Set ORV_ATTACH_BITTU_ILLUSTRATIONS=0 to skip (faster ingest, no repo art).
 */

import {
  listBittuIllustrationFilenamesFromChapterRaw,
} from "./bittu-illustrations";
import type { ParsedChapter } from "./write-novel-db";

export function shouldAttachBittuPanelsForIngest(): boolean {
  const v = process.env.ORV_ATTACH_BITTU_ILLUSTRATIONS?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

export function bittuChapterTxtUrl(chapterNum: number): string {
  const n = String(Math.max(1, Math.floor(chapterNum))).padStart(5, "0");
  return `https://raw.githubusercontent.com/Bittu5134/ORV-Reader/main/chapters/orv/chap_${n}.txt`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function enrichParsedChaptersWithBittuPanelFilenames(
  chapters: ParsedChapter[],
): Promise<void> {
  const delay = parseInt(process.env.ORV_BITTU_DELAY_MS ?? "85", 10);
  let hits = 0;
  let filenamesTotal = 0;

  for (let idx = 0; idx < chapters.length; idx++) {
    const ch = chapters[idx]!;
    const url = bittuChapterTxtUrl(ch.num);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "orv-reader-ingest/1.0" },
      });
      if (!res.ok) continue;
      const raw = await res.text();
      const names = listBittuIllustrationFilenamesFromChapterRaw(raw);
      if (names.length === 0) continue;
      ch.bittuPanelFilenames = names;
      hits++;
      filenamesTotal += names.length;
    } catch {
      /* offline / blocked */
    }
    if (idx < chapters.length - 1) await sleep(delay);
  }

  if (hits > 0) {
    console.log(
      `Bittu illustrations: matched ${hits} chapter(s), ${filenamesTotal} image filename(s) (spread across EPUB/TXT segments).`,
    );
  } else {
    console.log(
      "Bittu illustrations: no matching chap_*.txt art lists (wrong chapter numbers vs repo, or fetch blocked).",
    );
  }
}
