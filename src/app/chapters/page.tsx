import { StoryLanding } from "@/components/StoryLanding";
import {
  buildExtraMapChapterIndexRows,
  loadOrvChapterIndexRows,
} from "@/lib/chapter-payload";
import { getManhwaReadySlugs } from "@/lib/manhwa-availability";

export const dynamic = "force-dynamic";

export default async function ChaptersIndexPage() {
  const [rows, manhwaReadySlugs] = await Promise.all([
    loadOrvChapterIndexRows(),
    getManhwaReadySlugs(),
  ]);

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
