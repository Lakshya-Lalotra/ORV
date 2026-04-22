import type { PrismaClient } from "@prisma/client";
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
};

function segmentSpecsFromBody(body: string): { text: string; imageUrl?: string }[] {
  const paras = splitParagraphs(body);
  return paras.map((p) => ({ text: p }));
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

        const needsPanels = (urls?.length ?? 0) > 0;
        if (needsPanels) {
          const segs = await tx.segment.findMany({
            where: { chapterId: chapter.id },
            orderBy: { orderIndex: "asc" },
            select: { id: true, orderIndex: true },
          });
          const panelRows = segs
            .map((s) => {
              const url = urls?.[s.orderIndex];
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

        console.log(`  ${slug}: ${specs.length} segments`);
      }
    },
    { maxWait: 60_000, timeout: 600_000 },
  );
}
