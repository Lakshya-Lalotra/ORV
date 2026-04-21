"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ColorScheme, ManhwaPanelLayout, ReaderSettings, ViewMode } from "@/lib/types";
import { DEFAULT_SETTINGS, MIN_SCREEN_BRIGHTNESS } from "@/lib/types";

const STORAGE_KEY = "orv-reader-settings";
const SESSION_KEY = "orv-reader-session";

function coerceViewMode(raw: string | null | undefined): ViewMode {
  return raw === "manhwa" ? "manhwa" : "novel";
}

function syncModeInUrl(viewMode: ViewMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("mode", viewMode);
  window.history.replaceState(window.history.state, "", url);
}

function persistSettingsNow(next: ReaderSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function loadSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Omit<ReaderSettings, "viewMode">> & {
      viewMode?: string;
    };
    const rawVm = p.viewMode;
    let viewMode: ReaderSettings["viewMode"] = DEFAULT_SETTINGS.viewMode;
    if (rawVm === "novel" || rawVm === "manhwa") viewMode = rawVm;
    if (rawVm === "hybrid") viewMode = "novel";
    const rawLayout = p.manhwaPanelLayout;
    let manhwaPanelLayout: ReaderSettings["manhwaPanelLayout"] = DEFAULT_SETTINGS.manhwaPanelLayout;
    if (rawLayout === "scroll" || rawLayout === "paged") manhwaPanelLayout = rawLayout;
    const rawScheme = p.colorScheme;
    let colorScheme: ReaderSettings["colorScheme"] = DEFAULT_SETTINGS.colorScheme;
    if (rawScheme === "light" || rawScheme === "dark") colorScheme = rawScheme;
    let screenBrightness = DEFAULT_SETTINGS.screenBrightness;
    const rawBr = (p as { screenBrightness?: unknown }).screenBrightness;
    if (typeof rawBr === "number" && Number.isFinite(rawBr)) {
      screenBrightness = Math.min(1, Math.max(MIN_SCREEN_BRIGHTNESS, rawBr));
    }
    return {
      ...DEFAULT_SETTINGS,
      ...p,
      viewMode,
      manhwaPanelLayout,
      colorScheme,
      screenBrightness,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type ReaderCtx = {
  settings: ReaderSettings;
  sessionId: string;
  setViewMode: (m: ViewMode) => void;
  setManhwaPanelLayout: (l: ManhwaPanelLayout) => void;
  setColorScheme: (c: ColorScheme) => void;
  setSoundEnabled: (v: boolean) => void;
  setMusicEnabled: (v: boolean) => void;
  setTextScale: (n: number) => void;
  setVoiceEnabled: (v: boolean) => void;
  setScreenBrightness: (n: number) => void;
  track: (event: string, meta?: Record<string, unknown>) => void;
};

const Ctx = createContext<ReaderCtx | null>(null);

export function ReaderProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    // Client-only hydration of persisted settings (localStorage unavailable on SSR).
    queueMicrotask(() => {
      const next = loadSettings();
      const modeFromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("mode")
          : null;
      const hydrated =
        modeFromUrl != null ? { ...next, viewMode: coerceViewMode(modeFromUrl) } : next;
      persistSettingsNow(hydrated);
      setSettings(hydrated);
      setSessionId(getOrCreateSessionId());
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const persist = useCallback((partial: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial };
      if (partial.viewMode) syncModeInUrl(partial.viewMode);
      persistSettingsNow(next);
      return next;
    });
  }, []);

  const track = useCallback(
    async (event: string, meta?: Record<string, unknown>) => {
      if (!sessionId) return;
      try {
        await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, event, meta }),
        });
      } catch {
        /* offline */
      }
    },
    [sessionId],
  );

  const value = useMemo<ReaderCtx>(
    () => ({
      settings,
      sessionId,
      setViewMode: (viewMode) => persist({ viewMode }),
      setManhwaPanelLayout: (manhwaPanelLayout) => persist({ manhwaPanelLayout }),
      setColorScheme: (colorScheme) => persist({ colorScheme }),
      setSoundEnabled: (soundEnabled) => persist({ soundEnabled }),
      setMusicEnabled: (musicEnabled) => persist({ musicEnabled }),
      setTextScale: (textScale) => persist({ textScale }),
      setVoiceEnabled: (voiceEnabled) => persist({ voiceEnabled }),
      setScreenBrightness: (screenBrightness) =>
        persist({
          screenBrightness: Math.min(1, Math.max(MIN_SCREEN_BRIGHTNESS, screenBrightness)),
        }),
      track,
    }),
    [settings, sessionId, persist, track],
  );

  return (
    <Ctx.Provider value={value}>
      <ThemeDomBinder />
      {children}
    </Ctx.Provider>
  );
}

function ThemeDomBinder() {
  const { settings } = useReader();
  useEffect(() => {
    document.documentElement.dataset.theme = settings.colorScheme;
  }, [settings.colorScheme]);
  return null;
}

export function useReader() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReader outside ReaderProvider");
  return v;
}
