import type { PrismaClient } from "@prisma/client";
import { loadManhwaMap } from "@/lib/chapter-payload";

/**
 * Slugs that have at least one manhwa panel: `content/manhwa-map.json` entries
 * and/or Prisma segments with a linked `ManhwaPanel`.
 */
export async function getManhwaReadySlugs(
  prisma: PrismaClient,
): Promise<string[]> {
  const [map, withDbPanels] = await Promise.all([
    loadManhwaMap(),
    prisma.chapter.findMany({
      where: {
        segments: { some: { panel: { isNot: null } } },
      },
      select: { slug: true },
    }),
  ]);

  const set = new Set<string>();
  for (const [slug, urls] of Object.entries(map)) {
    if (Array.isArray(urls) && urls.length > 0) set.add(slug);
  }
  for (const { slug } of withDbPanels) set.add(slug);

  return [...set].sort((a, b) => {
    const na = Number.parseInt(a.replace(/^orv-ch-/i, ""), 10);
    const nb = Number.parseInt(b.replace(/^orv-ch-/i, ""), 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
