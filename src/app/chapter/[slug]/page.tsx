import { notFound } from "next/navigation";
import { ChapterReaderRoot } from "@/components/ChapterReader";
import {
  buildExtraMapChapterIndexEntries,
  loadOrvChapterIndexEntries,
  loadOrvChapterPayloadBySlug,
} from "@/lib/chapter-payload";
import { corpusChapterToPayload } from "@/lib/corpus-chapter-payload";
import type { ChapterIndexEntry } from "@/lib/types";
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

  const [payload, epubIndex, manhwaReadySlugs] = await Promise.all([
    loadOrvChapterPayloadBySlug(slug),
    loadOrvChapterIndexEntries(),
    getManhwaReadySlugs(),
  ]);
  if (!payload) notFound();

  const epubChapters: ChapterIndexEntry[] = epubIndex.map((r) => ({
    slug: r.slug,
    title: r.title,
  }));
  const extraChapters = await buildExtraMapChapterIndexEntries(
    new Set(epubChapters.map((r) => r.slug)),
  );
  const allChapters: ChapterIndexEntry[] = [...epubChapters, ...extraChapters].sort(
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
