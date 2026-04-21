import type { PrismaClient } from "@prisma/client";
import {
  BITTU_IMG_MARKER_PREFIX,
  BITTU_IMG_MARKER_SUFFIX,
  urlForBittuAssetFilename,
} from "./bittu-illustrations";
import {
  chapterMood,
  inferKind,
  isUsablePanelImageUrl,
  loadManhwaMap,
  splitParagraphs,
} from "./ingest-shared";

export type ParsedChapter = {
  num: number;
  title: string;
  body: string;
  /** Set during EPUB/TXT ingest when Bittu chap_N.txt lists <cover>/<img> filenames. */
  bittuPanelFilenames?: string[];
};

/** Text segment or Bittu illustration slot (marker expanded at DB write). */
const BITTU_MARKER_RE = new RegExp(
  `^${escapeRegExp(BITTU_IMG_MARKER_PREFIX)}(.+)${escapeRegExp(BITTU_IMG_MARKER_SUFFIX)}$`,
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Placeholder text so segments are non-empty (novel view shows a thin gap). */
const ILLUSTRATION_SEGMENT_TEXT = "\u00A0";

function segmentSpecsFromBody(body: string): { text: string; imageUrl?: string }[] {
  const paras = splitParagraphs(body);
  return paras.map((p) => {
    const m = p.trim().match(BITTU_MARKER_RE);
    if (!m) return { text: p };
    let filename: string;
    try {
      filename = decodeURIComponent(m[1]!);
    } catch {
      return { text: p };
    }
    return {
      text: ILLUSTRATION_SEGMENT_TEXT,
      imageUrl: urlForBittuAssetFilename(filename),
    };
  });
}

/** Spread Bittu filenames across segments (EPUB/TXT have different splits than Bittu .txt). */
function mergeBittuFilenamesIntoSpecs(
  specs: { text: string; imageUrl?: string }[],
  filenames: string[] | undefined,
): void {
  if (!filenames?.length) return;
  const n = specs.length;
  if (n === 0) return;
  const k = filenames.length;
  for (let i = 0; i < k; i++) {
    const preferred = k === 1 ? 0 : Math.round((i / (k - 1)) * (n - 1));
    const url = urlForBittuAssetFilename(filenames[i]!);
    let placed = false;
    for (let step = 0; step < n; step++) {
      const j = (preferred + step) % n;
      if (!specs[j]!.imageUrl) {
        specs[j]!.imageUrl = url;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
}

/** Avoid `Ch. 3: Chapter 3: …` when subtitle already had a matching prefix. */
export function chapterDisplayTitle(num: number, subtitle: string): string {
  const t = subtitle.trim();
  const re = new RegExp(`^(?:Chapter|Ch)\\.?\\s*${num}\\s*:\\s*`, "i");
  const cleaned = t.replace(re, "").trim();
  return `Ch. ${num}: ${cleaned || t}`;
}

export async function writeNovelChaptersToDb(
  prisma: PrismaClient,
  projectRoot: string,
  chapters: ParsedChapter[],
): Promise<void> {
  const manifest = loadManhwaMap(projectRoot);

  // Default interactive tx timeout is 5s — full-novel ingests exceed it (P2028).
  await prisma.$transaction(
    async (tx) => {
      await tx.manhwaPanel.deleteMany();
      await tx.segment.deleteMany();
      await tx.chapter.deleteMany();

      for (const ch of chapters) {
        const slug = `orv-ch-${ch.num}`;
        const specs = segmentSpecsFromBody(ch.body);
        mergeBittuFilenamesIntoSpecs(specs, ch.bittuPanelFilenames);
        if (specs.length === 0) continue;

        const chapter = await tx.chapter.create({
          data: {
            slug,
            title: chapterDisplayTitle(ch.num, ch.title),
            order: ch.num,
            mood: chapterMood(ch.num),
            intensity: Math.min(95, 35 + (ch.num % 6) * 9),
          },
        });

        const urls = manifest?.[slug] ?? manifest?.[String(ch.num)];

        await tx.segment.createMany({
          data: specs.map((row, i) => ({
            chapterId: chapter.id,
            orderIndex: i,
            kind: inferKind(row.text),
            text: row.text,
            keywordsJson: "[]",
          })),
        });

        const bittuPanelCount = specs.filter((s) => s.imageUrl).length;
        const needsPanels = bittuPanelCount > 0 || (urls?.length ?? 0) > 0;
        if (needsPanels) {
          const segs = await tx.segment.findMany({
            where: { chapterId: chapter.id },
            orderBy: { orderIndex: "asc" },
            select: { id: true, orderIndex: true },
          });
          const panelRows = segs
            .map((s) => {
              const spec = specs[s.orderIndex];
              const url = spec?.imageUrl || urls?.[s.orderIndex];
              if (!url || !isUsablePanelImageUrl(url)) return null;
              return {
                segmentId: s.id,
                imageUrl: url,
                alt: `${slug} panel ${s.orderIndex + 1}`,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
          if (panelRows.length > 0) {
            await tx.manhwaPanel.createMany({ data: panelRows });
          }
        }

        const note =
          bittuPanelCount > 0 ? `, ${bittuPanelCount} Bittu illustration(s)` : "";
        console.log(`  ${slug}: ${specs.length} segments${note}`);
      }
    },
    { maxWait: 60_000, timeout: 600_000 },
  );
}
