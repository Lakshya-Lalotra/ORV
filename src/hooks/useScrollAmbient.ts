"use client";

import { useEffect, useRef } from "react";
import { playAmbientShift, resumeAudio } from "@/lib/audio-engine";

export function useScrollAmbient(
  enabled: boolean,
  chapterIntensity: number,
) {
  const last = useRef(0);
  const acc = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = Math.abs(y - last.current);
      last.current = y;
      acc.current += delta;
      if (acc.current > 420) {
        acc.current = 0;
        void resumeAudio();
        playAmbientShift(chapterIntensity);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, chapterIntensity]);
}
