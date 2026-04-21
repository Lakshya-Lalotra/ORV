"use client";

import { useEffect, useRef } from "react";
import { useSystemOverlay } from "./SystemOverlay";

const LINES = [
  "A constellation leans closer to the stream.",
  "Sponsorship probability fluctuating…",
  "You are being indexed.",
  "Observation logged: emotional variance +12%.",
  "Patron interest: unstable.",
];

export function ConstellationWatcher({
  enabled,
  chapterIntensity,
}: {
  enabled: boolean;
  chapterIntensity: number;
}) {
  const { push } = useSystemOverlay();
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const base = 28000 - Math.min(12000, chapterIntensity * 80);
    const jitter = () => base + Math.random() * 22000;

    const run = () => {
      timeoutRef.current = window.setTimeout(() => {
        const line = LINES[Math.floor(Math.random() * LINES.length)]!;
        push({
          title: "[ CONSTELLATION ]",
          body: line,
          variant: "warn",
        });
        run();
      }, jitter());
    };

    run();
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [enabled, chapterIntensity, push]);

  return null;
}
