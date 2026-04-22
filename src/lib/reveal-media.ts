/**
 * Resolve reveal / finale media URLs for production blob/CDN or local `public/`.
 * Set full URLs or NEXT_PUBLIC_ORV_BLOB_BASE so assets are not served from the app bundle.
 */

import { publicAssetUrl } from "@/lib/orv-blob-url";

const VIDEO_PATH = "/Video/gilded-lily-animation.mp4";
const AUDIO_PATH = "/audio/gilded-lily.mp3";
const HERO_PATH = "/art/finale-hero.jpg";

export type RevealMediaUrls = {
  videoSrc: string;
  audioSrc: string;
  finaleHeroSrc: string;
};

export function getRevealMediaUrls(): RevealMediaUrls {
  const v = process.env.NEXT_PUBLIC_ORV_REVEAL_VIDEO_URL?.trim();
  const a = process.env.NEXT_PUBLIC_ORV_REVEAL_AUDIO_URL?.trim();
  const h = process.env.NEXT_PUBLIC_ORV_FINALE_HERO_URL?.trim();

  return {
    videoSrc: v || publicAssetUrl(VIDEO_PATH),
    audioSrc: a || publicAssetUrl(AUDIO_PATH),
    finaleHeroSrc: h || publicAssetUrl(HERO_PATH),
  };
}
