import { notFound } from "next/navigation";
import { ChapterReaderRoot } from "@/components/ChapterReader";
import {
  buildChapterPayload,
  buildExtraMapChapterIndexEntries,
  buildMapOnlyChapterPayload,
} from "@/lib/chapter-payload";
import { corpusChapterToPayload } from "@/lib/corpus-chapter-payload";
import type { ChapterIndexEntry } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import {
  loadSequelChapterBySlug,
  loadSequelIndex,
} from "@/lib/sequel-content";
import {
  loadSideChapterBySlug,
  loadSideIndex,
} from "@/lib/side-content";
import { getManhwaReadySlugs } from "@/lib/manhwa-availability";

export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (/^orv-seq-ch-\d+$/.test(slug)) {
    const [corpus, rawIndex] = await Promise.all([
      loadSequelChapterBySlug(slug),
      loadSequelIndex(),
    ]);
    if (!corpus) notFound();
    const index = rawIndex.map((e) => ({ slug: e.slug, title: e.title }));
    const i = index.findIndex((c) => c.slug === slug);
    const prevSlug = i > 0 ? index[i - 1]!.slug : null;
    const nextSlug =
      i >= 0 && i < index.length - 1 ? index[i + 1]!.slug : null;
    return (
      <ChapterReaderRoot
        chapter={corpusChapterToPayload(corpus)}
        nav={{ prevSlug, nextSlug, allChapters: index }}
      />
    );
  }

  if (/^orv-side-ch-\d+$/.test(slug)) {
    const [corpus, rawIndex] = await Promise.all([
      loadSideChapterBySlug(slug),
      loadSideIndex(),
    ]);
    if (!corpus) notFound();
    const index = rawIndex.map((e) => ({ slug: e.slug, title: e.title }));
    const i = index.findIndex((c) => c.slug === slug);
    const prevSlug = i > 0 ? index[i - 1]!.slug : null;
    const nextSlug =
      i >= 0 && i < index.length - 1 ? index[i + 1]!.slug : null;
    return (
      <ChapterReaderRoot
        chapter={corpusChapterToPayload(corpus)}
        nav={{ prevSlug, nextSlug, allChapters: index }}
      />
    );
  }

  const [chapter, indexRows, manhwaReadySlugs] = await Promise.all([
    prisma.chapter.findUnique({
      where: { slug },
      include: {
        segments: {
          orderBy: { orderIndex: "asc" },
          include: { panel: true },
        },
      },
    }),
    prisma.chapter.findMany({
      orderBy: { order: "asc" },
      select: { slug: true, title: true },
    }),
    getManhwaReadySlugs(prisma),
  ]);

  const dbChapters: ChapterIndexEntry[] = indexRows.map((r) => ({
    slug: r.slug,
    title: r.title,
  }));
  const extraChapters = await buildExtraMapChapterIndexEntries(
    new Set(dbChapters.map((r) => r.slug)),
  );
  const allChapters: ChapterIndexEntry[] = [...extraChapters, ...dbChapters].sort(
    (a, b) => {
      const aNum = Number.parseInt(a.slug.replace("orv-ch-", ""), 10);
      const bNum = Number.parseInt(b.slug.replace("orv-ch-", ""), 10);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum)
        return aNum - bNum;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    },
  );
  const i = allChapters.findIndex((c) => c.slug === slug);
  const prevSlug = i > 0 ? allChapters[i - 1]!.slug : null;
  const nextSlug =
    i >= 0 && i < allChapters.length - 1 ? allChapters[i + 1]!.slug : null;

  const payload = chapter
    ? await buildChapterPayload(chapter)
    : await buildMapOnlyChapterPayload(slug);
  if (!payload) notFound();

  return (
    <ChapterReaderRoot
      chapter={payload}
      nav={{
        prevSlug,
        nextSlug,
        allChapters,
        manhwaReadySlugs,
      }}
    />
  );
}
