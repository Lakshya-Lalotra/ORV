"use client";

import { playUiHover, resumeAudio } from "@/lib/audio-engine";
import { useReader } from "@/context/ReaderContext";
import type { ColorScheme } from "@/lib/types";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { settings, setColorScheme } = useReader();

  const cycle = () => {
    if (settings.soundEnabled) {
      void resumeAudio();
      playUiHover();
    }
    const next: ColorScheme = settings.colorScheme === "dark" ? "light" : "dark";
    setColorScheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={settings.colorScheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex items-center gap-2 rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/50 px-3 py-2 font-mono text-[11px] text-[var(--reader-fg)] transition-colors hover:border-[var(--accent)]/35 hover:text-[var(--accent)] ${className}`}
    >
      <span aria-hidden className="text-sm">
        {settings.colorScheme === "dark" ? "☾" : "☀"}
      </span>
      <span className="hidden sm:inline">{settings.colorScheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
