"use client";

import { AnimatePresence, motion } from "framer-motion";
import { playUiHover, resumeAudio } from "@/lib/audio-engine";
import { useReader } from "@/context/ReaderContext";
import type { ColorScheme, ManhwaPanelLayout, ViewMode } from "@/lib/types";
import { MIN_SCREEN_BRIGHTNESS } from "@/lib/types";

const modes: {
  id: ViewMode;
  label: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: "novel",
    label: "Novel",
    desc: "Full text, typography, keywords — like the prose reader on orv.pages.dev.",
    icon: "📘",
  },
  {
    id: "manhwa",
    label: "Manhwa",
    desc: "Illustrations only (manhwa-map). Pick list (scroll) or paged below.",
    icon: "🎨",
  },
];

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    settings,
    setViewMode,
    setManhwaPanelLayout,
    setColorScheme,
    setSoundEnabled,
    setMusicEnabled,
    setTextScale,
    setVoiceEnabled,
    setScreenBrightness,
  } = useReader();

  const feedback = () => {
    if (settings.soundEnabled) {
      void resumeAudio();
      playUiHover();
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close settings"
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 280, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            className="fixed right-0 top-0 z-[71] h-full w-[min(100vw,320px)] border-l border-[var(--reader-border)] bg-[var(--reader-elevated)] p-6 shadow-[-12px_0_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          >
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-mono text-sm tracking-widest text-[var(--accent)]">
                SETTINGS
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded px-2 py-1 text-[var(--reader-muted)] hover:text-[var(--reader-fg)]"
              >
                ✕
              </button>
            </div>

            <section className="mb-8">
              <p className="mb-3 font-mono text-xs text-[var(--reader-muted)]">Appearance</p>
              <div className="flex gap-2">
                {(
                  [
                    { id: "dark" as const, label: "Dark" },
                    { id: "light" as const, label: "Light" },
                  ] satisfies { id: ColorScheme; label: string }[]
                ).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      feedback();
                      setColorScheme(row.id);
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 font-mono text-xs transition-colors ${
                      settings.colorScheme === row.id
                        ? "border-[var(--glow)] bg-[var(--glow)]/10 text-[var(--reader-fg)]"
                        : "border-[var(--reader-border)] text-[var(--reader-muted)] hover:border-[var(--hairline-strong)]"
                    }`}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] leading-snug text-[var(--reader-muted)]">
                Warm gold accent is kept in both themes.
              </p>
              <div className="mt-6">
                <label className="block">
                  <span className="mb-2 block font-mono text-xs text-[var(--reader-muted)]">
                    Reading brightness
                  </span>
                  <input
                    type="range"
                    min={MIN_SCREEN_BRIGHTNESS}
                    max={1}
                    step={0.05}
                    value={settings.screenBrightness}
                    onChange={(e) => {
                      feedback();
                      setScreenBrightness(parseFloat(e.target.value));
                    }}
                    className="w-full accent-[var(--accent)]"
                  />
                  <p className="mt-2 font-mono text-[10px] leading-snug text-[var(--reader-muted)]">
                    {Math.round(settings.screenBrightness * 100)}% — dims the chapter reader (novel and
                    manhwa) using CSS. Works offline and on every device; it does not change system
                    brightness.
                  </p>
                </label>
              </div>
            </section>

            <section className="mb-8">
              <p className="mb-3 font-mono text-xs text-[var(--reader-muted)]">Reading mode</p>
              <div className="flex flex-col gap-2">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      feedback();
                      setViewMode(m.id);
                    }}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      settings.viewMode === m.id
                        ? "border-[var(--glow)] bg-[var(--glow)]/10 text-[var(--reader-fg)]"
                        : "border-[var(--hairline)] text-[var(--reader-muted)] hover:border-[var(--hairline-strong)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-[var(--reader-fg)]">
                      <span aria-hidden>{m.icon}</span>
                      {m.label}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] leading-snug text-[var(--reader-muted)]">
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mb-8 space-y-4">
              <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-[var(--reader-body)]">
                Sound effects
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => {
                    feedback();
                    setSoundEnabled(e.target.checked);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-[var(--reader-body)]">
                <span>
                  Scenario soundtrack
                  <span className="mt-0.5 block font-mono text-[10px] font-normal text-[var(--reader-muted)]">
                    Procedural bed + text mood (local). Set OPENAI_API_KEY for AI tuning.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.musicEnabled}
                  onChange={(e) => {
                    feedback();
                    setMusicEnabled(e.target.checked);
                  }}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-[var(--reader-body)]">
                Voice (browser TTS)
                <input
                  type="checkbox"
                  checked={settings.voiceEnabled}
                  onChange={(e) => {
                    feedback();
                    setVoiceEnabled(e.target.checked);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
            </section>

            {settings.viewMode === "manhwa" ? (
              <section className="mb-8">
                <p className="mb-3 font-mono text-xs text-[var(--reader-muted)]">Manhwa layout</p>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      { id: "scroll" as const, label: "List (scroll)", desc: "All panels in one column." },
                      { id: "paged" as const, label: "Paged", desc: "One panel; ← → or buttons." },
                    ] satisfies { id: ManhwaPanelLayout; label: string; desc: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        feedback();
                        setManhwaPanelLayout(m.id);
                      }}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        settings.manhwaPanelLayout === m.id
                          ? "border-[var(--glow)] bg-[var(--glow)]/10 text-[var(--reader-fg)]"
                          : "border-[var(--hairline)] text-[var(--reader-muted)] hover:border-[var(--hairline-strong)]"
                      }`}
                    >
                      <span className="font-medium text-[var(--reader-fg)]">{m.label}</span>
                      <span className="mt-1 block font-mono text-[10px] leading-snug text-[var(--reader-muted)]">
                        {m.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {settings.viewMode === "novel" ? (
              <section>
                <p className="mb-2 font-mono text-xs text-[var(--reader-muted)]">Text size</p>
                <input
                  type="range"
                  min={0.85}
                  max={1.35}
                  step={0.05}
                  value={settings.textScale}
                  onChange={(e) => {
                    feedback();
                    setTextScale(parseFloat(e.target.value));
                  }}
                  className="w-full accent-[var(--accent)]"
                />
                <p className="mt-1 text-xs text-[var(--reader-muted)]">
                  Scale {(settings.textScale * 100).toFixed(0)}%
                </p>
              </section>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
