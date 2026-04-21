import type { ChapterMood } from "@prisma/client";

export function moodVars(mood: ChapterMood, intensity: number) {
  const t = intensity / 100;
  switch (mood) {
    case "calm":
      return {
        "--accent": `rgb(${56 + t * 40} ${189 + t * 20} ${248})`,
        "--accent-dim": "rgb(30 120 180)",
        "--glow": `rgba(56, 189, 248, ${0.25 + t * 0.25})`,
      } as Record<string, string>;
    case "tension":
      return {
        "--accent": `rgb(${251 - t * 30} ${191 - t * 40} ${36 + t * 60})`,
        "--accent-dim": "rgb(180 100 40)",
        "--glow": `rgba(251, 191, 36, ${0.2 + t * 0.3})`,
      };
    case "chaos":
      return {
        "--accent": `rgb(${248 - t * 20} ${113 - t * 30} ${113 + t * 40})`,
        "--accent-dim": "rgb(180 60 90)",
        "--glow": `rgba(248, 113, 113, ${0.25 + t * 0.35})`,
      };
    default:
      return {
        "--accent": "rgb(57 255 200)",
        "--accent-dim": "rgb(30 140 120)",
        "--glow": "rgba(57, 255, 200, 0.35)",
      };
  }
}
