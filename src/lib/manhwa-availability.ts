import { loadManhwaMap } from "@/lib/chapter-payload";

/**
 * Slugs that have at least one manhwa panel. Now sourced exclusively from
 * `content/manhwa-map.json` (on R2) — the Postgres-backed `ManhwaPanel`
 * table is no longer written to by the EPUB-direct loader.
 */
export async function getManhwaReadySlugs(): Promise<string[]> {
  const map = await loadManhwaMap();
  const set = new Set<string>();
  for (const [slug, urls] of Object.entries(map)) {
    if (Array.isArray(urls) && urls.length > 0) set.add(slug);
  }
  return [...set].sort((a, b) => {
    const na = Number.parseInt(a.replace(/^orv-ch-/i, ""), 10);
    const nb = Number.parseInt(b.replace(/^orv-ch-/i, ""), 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
