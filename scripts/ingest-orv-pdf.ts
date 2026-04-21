/**
 * Ingest a local ORV PDF into Prisma (chapters → segments, optional manhwa URLs).
 * You must own rights to the PDF; do not commit the file or extracted text to git.
 *
 * Usage:
 *   npm run ingest:orv
 *
 * PDF path: ORV_PDF_PATH, or content/Omniscient Reader's Viewpoint - Sing-shong (singsyong).pdf,
 * or any single .pdf in content/ (see scripts/pdf-path.ts).
 *
 * Optional 1:1 manhwa panel URLs per chapter (segment order = array index):
 *   content/manhwa-map.json  (see manhwa-map.example.json)
 */

import "dotenv/config";
import fs from "node:fs";
import { PDFParse } from "pdf-parse";
import { PrismaClient } from "@prisma/client";
import {
  chapterMood,
  inferKind,
  isUsablePanelImageUrl,
  loadManhwaMap,
  normalizeText,
  splitParagraphs,
} from "./ingest-shared";
import { resolvePdfPath } from "./pdf-path";

const prisma = new PrismaClient();

/** Run from repo root: `npm run ingest:orv` */
const PROJECT_ROOT = process.cwd();

/** Split document into chapters using common webnovel PDF headings. */
function splitChapters(text: string): { order: number; title: string; body: string }[] {
  const chapterHeader =
    /^(?:Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)\b[^\n]*/gim;
  const indices: { index: number; line: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(chapterHeader.source);
  while ((m = re.exec(text)) !== null) {
    indices.push({ index: m.index, line: m[0].trim() });
  }

  if (indices.length === 0) {
    const ep = /^(?:Episode|EP\.?)\s*\d+[^\n]*/gim;
    while ((m = ep.exec(text)) !== null) {
      indices.push({ index: m.index, line: m[0].trim() });
    }
  }

  if (indices.length === 0) {
    return [
      {
        order: 1,
        title: "Imported — full document",
        body: text,
      },
    ];
  }

  const preamble = text.slice(0, indices[0]!.index).trim();
  const out: { order: number; title: string; body: string }[] = [];

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]!.index;
    const end = i + 1 < indices.length ? indices[i + 1]!.index : text.length;
    const chunk = text.slice(start, end).trim();
    const nl = chunk.indexOf("\n");
    const title = nl === -1 ? chunk : chunk.slice(0, nl).trim();
    let body = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    if (i === 0 && preamble.length > 120) {
      body = `${preamble}\n\n${body}`.trim();
    }
    out.push({ order: i + 1, title, body });
  }

  return out;
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const pdfPath = resolvePdfPath(PROJECT_ROOT);

  if (!pdfPath) {
    console.error(
      `PDF not found. Add any .pdf under content/, or use:\n  content/${"Omniscient Reader's Viewpoint - Sing-shong (singsyong).pdf"}\n  or set ORV_PDF_PATH in .env`,
    );
    process.exit(1);
  }

  console.log("Reading PDF:", pdfPath);
  const raw = await extractPdfText(pdfPath);
  const text = normalizeText(raw);
  if (text.length < 200) {
    console.error("Extracted text is very short — PDF may be image-only or encrypted.");
    process.exit(1);
  }

  const chapters = splitChapters(text);
  console.log(`Detected ${chapters.length} chapter(s).`);
  const manifest = loadManhwaMap(PROJECT_ROOT);

  await prisma.$transaction(async (tx) => {
    await tx.manhwaPanel.deleteMany();
    await tx.segment.deleteMany();
    await tx.chapter.deleteMany();

    for (const ch of chapters) {
      const slug = `orv-ch-${ch.order}`;
      const paras = splitParagraphs(ch.body);
      if (paras.length === 0) {
        console.warn(`Skipping empty body: ${ch.title}`);
        continue;
      }

      const chapter = await tx.chapter.create({
        data: {
          slug,
          title: ch.title,
          order: ch.order,
          mood: chapterMood(ch.order),
          intensity: Math.min(95, 35 + (ch.order % 6) * 9),
        },
      });

      const urls = manifest?.[slug] ?? manifest?.[String(ch.order)];

      for (let i = 0; i < paras.length; i++) {
        const seg = await tx.segment.create({
          data: {
            chapterId: chapter.id,
            orderIndex: i,
            kind: inferKind(paras[i]!),
            text: paras[i]!,
            keywordsJson: "[]",
          },
        });
        const url = urls?.[i];
        if (url && isUsablePanelImageUrl(url)) {
          await tx.manhwaPanel.create({
            data: {
              segmentId: seg.id,
              imageUrl: url,
              alt: `${slug} panel ${i + 1}`,
            },
          });
        }
      }

      console.log(
        `  ${slug}: ${paras.length} segments` +
          (urls ? `, ${urls.length} panel URLs in map` : ""),
      );
    }
  });

  console.log("Done. Open /chapters to browse.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
