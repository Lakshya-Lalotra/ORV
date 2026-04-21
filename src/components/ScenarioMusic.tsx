"use client";

import type { ChapterMood, SegmentKind } from "@prisma/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { setScenarioAmbient, type ScenarioAmbientState } from "@/lib/audio-engine";
import type { ScenarioVariant } from "@/lib/scenario-music";
import { useReader } from "@/context/ReaderContext";

type Seg = { kind: SegmentKind; text: string };

export function ScenarioMusic({
  slug,
  title,
  mood,
  intensity,
  segments,
  activeIndex,
}: {
  slug: string;
  title: string;
  mood: ChapterMood;
  intensity: number;
  segments: Seg[];
  activeIndex: number;
}) {
  const { settings } = useReader();
  const [classifier, setClassifier] = useState<{
    variant: ScenarioVariant;
    energy: number;
  } | null>(null);

  const excerpt = useMemo(
    () => segments.slice(0, 14).map((s) => s.text).join("\n\n").slice(0, 2200),
    [segments],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/scenario-mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, excerpt }),
    })
      .then((r) => r.json())
      .then((j: { variant?: string; energy?: number }) => {
        if (cancelled || !j?.variant) return;
        const v = j.variant.toLowerCase();
        if (v !== "calm" && v !== "tension" && v !== "chaos" && v !== "system") return;
        setClassifier({
          variant: v,
          energy:
            typeof j.energy === "number" && Number.isFinite(j.energy)
              ? Math.min(1, Math.max(0, j.energy))
              : 0.5,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, title, excerpt]);

  const activeKind = segments[activeIndex]?.kind ?? "narration";
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const state: ScenarioAmbientState = {
      mood,
      intensity,
      activeKind,
      classifierVariant: classifier?.variant,
      classifierEnergy: classifier?.energy,
    };

    const run = () => {
      void setScenarioAmbient(settings.musicEnabled, state);
    };

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(run, 140);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [settings.musicEnabled, mood, intensity, activeKind, classifier]);

  useEffect(() => {
    return () => {
      void setScenarioAmbient(false, {
        mood: "calm",
        intensity: 30,
        activeKind: "narration",
      });
    };
  }, []);

  return null;
}
