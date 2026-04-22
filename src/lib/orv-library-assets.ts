/**
 * Static branding assets used by the ORV Library shell — covers, wordmarks,
 * starfield, teaser art. All paths resolve through `publicAssetUrl`, so in
 * production they come from the R2 bucket pointed at by
 * `NEXT_PUBLIC_ORV_BLOB_BASE`, and in local dev they fall back to files
 * under `public/`.
 *
 * To replace or add an asset, drop the file into `public/branding/...`,
 * upload a copy to the same key under the R2 bucket, and reference it
 * through `publicAssetUrl("/branding/<name>.ext")`.
 */
import { publicAssetUrl } from "@/lib/orv-blob-url";

/** Stories index — main ORV card. */
export const ORV_COVER_WEBP = publicAssetUrl("/branding/covers/orv.webp");
/** Stories index — ORV Sequel (CH 553+). */
export const SEQUEL_COVER_WEBP = publicAssetUrl("/branding/covers/sequel.webp");
/** Stories index — One Shot Stories. */
export const ONESHOT_COVER_WEBP = publicAssetUrl(
  "/branding/covers/oneshot.webp",
);

/**
 * Self-hosted webtoon key visual (max width 1000 from Fandom wiki).
 * Regenerate: `npm run branding:webtoon-cover`
 */
export const ORV_WEBTOON_KEY_VISUAL_JPG = publicAssetUrl(
  "/branding/orv-webtoon-key-visual.jpg",
);

/** Starfield background used behind the story picker. */
export const STARFIELD_JPG = publicAssetUrl("/branding/background-stars.jpg");

/**
 * Self-hosted wiki site logo (background removed).
 */
export const ORV_OFFICIAL_MARK_PNG = publicAssetUrl(
  "/branding/orv-wiki-logo.png",
);
export const ORV_READER_WORDMARK_PNG = publicAssetUrl(
  "/branding/orv-reader-wordmark.png",
);
/**
 * Same OMNISCIENT × READER wordmark with the pale paper background
 * keyed out (luminance-based alpha matte). Regenerate via:
 *   npx tsx scripts/make-wordmark-transparent.ts
 * Used on dark finale / reveal backgrounds where the cream paper
 * would otherwise sit as a visible rectangle.
 */
export const ORV_READER_WORDMARK_TRANSPARENT_PNG = publicAssetUrl(
  "/branding/orv-reader-wordmark-transparent.png",
);
