"use client";

import { useCallback, useEffect, useRef } from "react";

type Args = {
  sessionId: string;
  chapterSlug: string;
  segmentIndex: number;
  enabled: boolean;
};

export function useReadingProgress({
  sessionId,
  chapterSlug,
  segmentIndex,
  enabled,
}: Args) {
  const lastSent = useRef(-1);

  const send = useCallback(
    async (seg: number, scrollRatio: number) => {
      if (!sessionId || !chapterSlug) return;
      try {
        await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            chapterSlug,
            segmentIndex: seg,
            scrollRatio,
          }),
        });
      } catch {
        /* ignore */
      }
    },
    [sessionId, chapterSlug],
  );

  useEffect(() => {
    if (!enabled || !sessionId) return;
    if (lastSent.current === segmentIndex) return;
    lastSent.current = segmentIndex;
    const ratio =
      typeof window !== "undefined"
        ? window.scrollY /
          Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        : 0;
    void send(segmentIndex, Math.min(1, Math.max(0, ratio)));
  }, [enabled, sessionId, segmentIndex, send]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const ratio =
          window.scrollY /
          Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        void send(segmentIndex, Math.min(1, Math.max(0, ratio)));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, sessionId, segmentIndex, send]);
}
