/**
 * Static art from Bittu5134/ORV-Reader (orv.pages.dev source).
 * https://github.com/Bittu5134/ORV-Reader/tree/main/website/assets
 *
 * Story cards on https://orv.pages.dev/stories/ use `../assets/covers/*.webp`
 * from that route — same files as below.
 */
const ORV_PAGES = "https://orv.pages.dev";
const REPO_ASSETS =
  "https://raw.githubusercontent.com/Bittu5134/ORV-Reader/main/website/assets";

const cover = (name: "orv" | "cont" | "side") =>
  `${ORV_PAGES}/assets/covers/${name}.webp`;

/** Stories index — main ORV card. */
export const BITTU_COVER_ORV_WEBP = cover("orv");
/** Stories index — ORV Sequel (CH 553+). */
export const BITTU_COVER_SEQUEL_WEBP = cover("cont");
/** Stories index — One Shot Stories. */
export const BITTU_COVER_ONESHOT_WEBP = cover("side");

/**
 * Self-hosted webtoon key visual (max width 1000 from Fandom wiki).
 * Regenerate: `npm run branding:webtoon-cover`
 * Source: https://static.wikia.nocookie.net/omniscient-readers-viewpoint/images/4/4e/ORV_Webtoon_Key_Visual_2.jpg/revision/latest/scale-to-width-down/1000
 */
export const ORV_WEBTOON_KEY_VISUAL_JPG = "/branding/orv-webtoon-key-visual.jpg";

/** Representative manhwa panel from the same repo (chapter art). */
const MANHWA_TEASER =
  "002 - In short, my life was like this Kim Dokja, 28 years old, single.jpg";

export const BITTU_MANHWA_TEASER_JPG = `${REPO_ASSETS}/images/${encodeURIComponent(MANHWA_TEASER)}`;

export const BITTU_STARFIELD_JPG = `${REPO_ASSETS}/background-stars.jpg`;

/**
 * Self-hosted wiki site logo (background removed). Source PNG:
 * https://static.wikia.nocookie.net/omniscient-readers-viewpoint/images/e/e6/Site-logo.png/revision/latest
 */
export const ORV_OFFICIAL_MARK_PNG = "/branding/orv-wiki-logo.png";
export const ORV_READER_WORDMARK_PNG = "/branding/orv-reader-wordmark.png";
/**
 * Same OMNISCIENT × READER wordmark with the pale paper background
 * keyed out (luminance-based alpha matte). Regenerate via:
 *   npx tsx scripts/make-wordmark-transparent.ts
 * Used on dark finale / reveal backgrounds where the cream paper
 * would otherwise sit as a visible rectangle.
 */
export const ORV_READER_WORDMARK_TRANSPARENT_PNG =
  "/branding/orv-reader-wordmark-transparent.png";
