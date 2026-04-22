import { StoryLanding } from "@/components/StoryLanding";
import { buildExtraMapChapterIndexRows } from "@/lib/chapter-payload";
import { getManhwaReadySlugs } from "@/lib/manhwa-availability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ChaptersIndexPage() {
  const [chapters, manhwaReadySlugs] = await Promise.all([
    prisma.chapter.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      mood: true,
      intensity: true,
      order: true,
      _count: { select: { segments: true } },
    },
  }),
    getManhwaReadySlugs(prisma),
  ]);

  const rows = chapters.map((ch) => ({
    id: ch.id,
    slug: ch.slug,
    title: ch.title,
    mood: ch.mood,
    intensity: ch.intensity,
    order: ch.order,
    segmentCount: ch._count.segments,
  }));

  const extraRows = await buildExtraMapChapterIndexRows(
    new Set(rows.map((row) => row.slug)),
  );
  const mergedRows = [...rows, ...extraRows].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return (
    <StoryLanding chapters={mergedRows} manhwaReadySlugs={manhwaReadySlugs} />
  );
}
