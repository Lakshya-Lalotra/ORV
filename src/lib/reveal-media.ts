/**
 * Resolve reveal / finale media URLs for production blob/CDN or local `public/`.
 * Set full URLs or NEXT_PUBLIC_ORV_BLOB_BASE so assets are not served from the app bundle.
 */

const VIDEO_PATH = "/Video/gilded-lily-animation.mp4";
const AUDIO_PATH = "/audio/gilded-lily.mp3";
const HERO_PATH = "/art/finale-hero.jpg";

function joinBase(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Public base for mirrored `public/` tree on R2/S3 (no trailing slash). */
function blobBase(): string {
  return process.env.NEXT_PUBLIC_ORV_BLOB_BASE?.trim() ?? "";
}

export type RevealMediaUrls = {
  videoSrc: string;
  audioSrc: string;
  finaleHeroSrc: string;
};

export function getRevealMediaUrls(): RevealMediaUrls {
  const v = process.env.NEXT_PUBLIC_ORV_REVEAL_VIDEO_URL?.trim();
  const a = process.env.NEXT_PUBLIC_ORV_REVEAL_AUDIO_URL?.trim();
  const h = process.env.NEXT_PUBLIC_ORV_FINALE_HERO_URL?.trim();
  const base = blobBase();

  return {
    videoSrc: v || (base ? joinBase(base, VIDEO_PATH) : VIDEO_PATH),
    audioSrc: a || (base ? joinBase(base, AUDIO_PATH) : AUDIO_PATH),
    finaleHeroSrc: h || (base ? joinBase(base, HERO_PATH) : HERO_PATH),
  };
}
