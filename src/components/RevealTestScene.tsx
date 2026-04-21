"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FinaleScene } from "@/components/FinaleScene";
import {
  FINALE_HERO_ART,
  FINALE_LEAD_IN_MS,
  FINALE_TAP_DELAY_MS,
  REVEAL_AUDIO_SRC,
  REVEAL_OUTRO_BUFFER_S,
  REVEAL_VIDEO_SRC,
  SONG_INITIAL_DELAY_MS,
  SONG_INITIAL_VOLUME,
  SONG_RAMP_MS,
  SONG_START_TIME_S,
  SONG_TARGET_VOLUME,
  buildRevealScript,
  emphasisClass,
} from "@/lib/reveal-shared";

type RunState = "idle" | "playing";

/**
 * Dev-only harness for iterating on the reveal scene (video + audio +
 * matrix prologue + finale). Lives at `/test/reveal`.
 *
 * It intentionally bypasses the intro, name prompt and unlocking phases
 * so you can hammer the animation in a tight edit → reload loop without
 * typing a name every time. The orchestration logic mirrors the real
 * `AuthGate` reveal phase, so visual changes here translate 1:1.
 *
 * Dev controls (top-left):
 *   - START / RESTART
 *   - Reader name (defaults to "Reader")
 *   - Skip to finale (hero-image takeover)
 *   - Skip to final tap prompt
 *   - Force-toggle the finale
 *   - Live readout of current line / audio time / video time
 */
export function RevealTestScene() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [readerName, setReaderName] = useState("Reader");
  const [revealLine, setRevealLine] = useState(0);
  const [tapReady, setTapReady] = useState(false);
  const [finaleActive, setFinaleActive] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [runToken, setRunToken] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const rampIntervalRef = useRef<number | null>(null);
  const sceneMsRef = useRef<number>(0);

  const script = useMemo(() => buildRevealScript(readerName), [readerName]);

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
    if (rampIntervalRef.current !== null) {
      window.clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
  }, []);

  // Main scheduler — mirrors AuthGate's reveal effect.
  useEffect(() => {
    if (runState !== "playing") return;

    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const fitVideoToScene = (sceneMs: number) => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      video.playbackRate = Math.max(
        0.5,
        Math.min(2.2, (video.duration * 1000) / sceneMs),
      );
    };

    const schedule = () => {
      if (
        !Number.isFinite(audio.duration) ||
        audio.duration <= SONG_START_TIME_S + 1
      ) {
        return false;
      }

      const playableAudioMs = (audio.duration - SONG_START_TIME_S) * 1000;
      const sceneMs = SONG_INITIAL_DELAY_MS + playableAudioMs;
      const outroMs = REVEAL_OUTRO_BUFFER_S * 1000;
      sceneMsRef.current = sceneMs;

      fitVideoToScene(sceneMs);

      const N = script.length;
      const firstAt = 0;
      const lastAt = Math.max(firstAt + 1000, sceneMs - outroMs);

      const weights = script.map((s) => Math.max(0.1, s.weight ?? 1));
      const intervalWeights = weights.slice(0, -1);
      const totalWeight = intervalWeights.reduce((a, b) => a + b, 0) || 1;
      const unit = (lastAt - firstAt) / totalWeight;

      clearAllTimers();

      let cursor = firstAt;
      for (let i = 1; i < N; i++) {
        cursor += intervalWeights[i - 1] * unit;
        timersRef.current.push(
          window.setTimeout(() => setRevealLine(i), Math.round(cursor)),
        );
      }

      timersRef.current.push(
        window.setTimeout(() => {
          try {
            audio.currentTime = SONG_START_TIME_S;
          } catch {
            /* ignore */
          }
          audio.muted = false;
          audio.volume = SONG_INITIAL_VOLUME;
          void audio.play().catch(() => {});

          if (rampIntervalRef.current !== null) {
            window.clearInterval(rampIntervalRef.current);
          }
          const steps = 40;
          const stepSize =
            (SONG_TARGET_VOLUME - SONG_INITIAL_VOLUME) / steps;
          let k = 0;
          const iv = window.setInterval(() => {
            k++;
            const next = Math.min(
              SONG_TARGET_VOLUME,
              SONG_INITIAL_VOLUME + stepSize * k,
            );
            audio.volume = next;
            if (k >= steps) {
              audio.volume = SONG_TARGET_VOLUME;
              window.clearInterval(iv);
              rampIntervalRef.current = null;
            }
          }, SONG_RAMP_MS / steps);
          rampIntervalRef.current = iv;
        }, SONG_INITIAL_DELAY_MS),
      );

      const finaleAt = Math.max(0, sceneMs - FINALE_LEAD_IN_MS);
      timersRef.current.push(
        window.setTimeout(() => setFinaleActive(true), finaleAt),
      );

      timersRef.current.push(
        window.setTimeout(
          () => setTapReady(true),
          sceneMs + FINALE_TAP_DELAY_MS,
        ),
      );

      return true;
    };

    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      video.muted = true;
      video.playsInline = true;
      void video.play().catch(() => {});

      const scheduled = schedule();
      if (!scheduled) {
        const onAudioReady = () => {
          if (schedule()) {
            audio.removeEventListener("loadedmetadata", onAudioReady);
            audio.removeEventListener("durationchange", onAudioReady);
            audio.removeEventListener("canplay", onAudioReady);
          }
        };
        audio.addEventListener("loadedmetadata", onAudioReady);
        audio.addEventListener("durationchange", onAudioReady);
        audio.addEventListener("canplay", onAudioReady);
      }

      const onVideoMeta = () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        const sceneMs =
          SONG_INITIAL_DELAY_MS +
          (audio.duration - SONG_START_TIME_S) * 1000;
        fitVideoToScene(sceneMs);
        video.removeEventListener("loadedmetadata", onVideoMeta);
      };
      video.addEventListener("loadedmetadata", onVideoMeta);
    };

    start();

    return () => {
      cancelled = true;
      clearAllTimers();
    };
    // runToken intentionally in deps so "Restart" re-fires this effect.
  }, [runState, runToken, script, clearAllTimers]);

  // Live readout of media time for the dev HUD.
  useEffect(() => {
    if (runState !== "playing") return;
    const iv = window.setInterval(() => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (video) {
        setVideoTime(video.currentTime);
        if (Number.isFinite(video.duration)) setVideoDuration(video.duration);
      }
      if (audio) {
        setAudioTime(audio.currentTime);
        if (Number.isFinite(audio.duration)) setAudioDuration(audio.duration);
      }
    }, 250);
    return () => window.clearInterval(iv);
  }, [runState, runToken]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (video) {
        video.pause();
      }
      if (audio) {
        audio.pause();
      }
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const handleStart = useCallback(() => {
    // User gesture primes both media elements so programmatic play()
    // inside the effect isn't blocked by autoplay policies.
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.muted = true;
      void video
        .play()
        .then(() => {
          video.pause();
          video.currentTime = 0;
        })
        .catch(() => {});
    }
    if (audio) {
      audio.muted = true;
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.muted = false;
        })
        .catch(() => {});
    }
    setRevealLine(0);
    setTapReady(false);
    setFinaleActive(false);
    setRunState("playing");
    setRunToken((t) => t + 1);
  }, []);

  const handleRestart = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    clearAllTimers();
    if (video) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setRevealLine(0);
    setTapReady(false);
    setFinaleActive(false);
    setRunToken((t) => t + 1);
  }, [clearAllTimers]);

  // Jump the scene ahead by `deltaMs`, re-scheduling remaining timers
  // so the prologue / finale / tap still land at the correct offsets
  // relative to audio time. Simpler: cancel everything, hop audio/video
  // forward, then skip-ahead the line index proportionally and fire any
  // still-pending milestones on a tight schedule.
  const skipBy = useCallback(
    (targetOffsetMs: number) => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || !audio) return;
      if (!Number.isFinite(audio.duration)) return;

      clearAllTimers();

      const sceneMs = sceneMsRef.current || SONG_INITIAL_DELAY_MS;
      const clamped = Math.max(0, Math.min(sceneMs - 500, targetOffsetMs));

      // Audio: past the initial silent pause → actual song time, else park at start.
      if (clamped >= SONG_INITIAL_DELAY_MS) {
        const songMsIn = clamped - SONG_INITIAL_DELAY_MS;
        try {
          audio.currentTime = SONG_START_TIME_S + songMsIn / 1000;
        } catch {
          /* ignore */
        }
        audio.muted = false;
        audio.volume = SONG_TARGET_VOLUME;
        void audio.play().catch(() => {});
      } else {
        try {
          audio.currentTime = SONG_START_TIME_S;
        } catch {
          /* ignore */
        }
        audio.pause();
      }

      // Video: park at proportional position, keep playing.
      if (Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = Math.min(
            video.duration - 0.1,
            (clamped / sceneMs) * video.duration,
          );
        } catch {
          /* ignore */
        }
        video.muted = true;
        void video.play().catch(() => {});
      }

      // Re-derive all milestone offsets relative to `clamped`.
      const N = script.length;
      const outroMs = REVEAL_OUTRO_BUFFER_S * 1000;
      const firstAt = 0;
      const lastAt = Math.max(firstAt + 1000, sceneMs - outroMs);
      const weights = script.map((s) => Math.max(0.1, s.weight ?? 1));
      const intervalWeights = weights.slice(0, -1);
      const totalWeight = intervalWeights.reduce((a, b) => a + b, 0) || 1;
      const unit = (lastAt - firstAt) / totalWeight;

      let cursor = firstAt;
      const lineOffsets: number[] = [0];
      for (let i = 1; i < N; i++) {
        cursor += intervalWeights[i - 1] * unit;
        lineOffsets.push(cursor);
      }

      // Line at `clamped` = last index whose offset <= clamped.
      let currentIdx = 0;
      for (let i = 0; i < lineOffsets.length; i++) {
        if (lineOffsets[i] <= clamped) currentIdx = i;
      }
      setRevealLine(currentIdx);

      // Schedule remaining future lines.
      for (let i = currentIdx + 1; i < N; i++) {
        const remaining = Math.max(0, lineOffsets[i] - clamped);
        timersRef.current.push(
          window.setTimeout(() => setRevealLine(i), Math.round(remaining)),
        );
      }

      // Finale window.
      const finaleStart = Math.max(0, sceneMs - FINALE_LEAD_IN_MS);
      if (clamped >= finaleStart) {
        setFinaleActive(true);
      } else {
        setFinaleActive(false);
        timersRef.current.push(
          window.setTimeout(
            () => setFinaleActive(true),
            Math.round(finaleStart - clamped),
          ),
        );
      }

      // Tap.
      const tapAt = sceneMs + FINALE_TAP_DELAY_MS;
      if (clamped >= tapAt) {
        setTapReady(true);
      } else {
        setTapReady(false);
        timersRef.current.push(
          window.setTimeout(
            () => setTapReady(true),
            Math.round(tapAt - clamped),
          ),
        );
      }
    },
    [clearAllTimers, script],
  );

  const skipToFinale = useCallback(() => {
    const sceneMs = sceneMsRef.current;
    if (!sceneMs) return;
    skipBy(Math.max(0, sceneMs - FINALE_LEAD_IN_MS - 200));
  }, [skipBy]);

  const skipToTap = useCallback(() => {
    const sceneMs = sceneMsRef.current;
    if (!sceneMs) return;
    skipBy(sceneMs - 200);
  }, [skipBy]);

  const currentStep = script[Math.min(revealLine, script.length - 1)];
  const running = runState === "playing";
  const sceneMs = sceneMsRef.current;
  const elapsedMs =
    running && audioDuration > 0
      ? Math.max(
          0,
          SONG_INITIAL_DELAY_MS +
            (audioTime - SONG_START_TIME_S) * 1000,
        )
      : 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-neutral-200">
      <video
        ref={videoRef}
        src={REVEAL_VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        className={
          running
            ? "fixed inset-0 z-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
            : "pointer-events-none fixed -left-[200vw] top-0 h-0 w-0 opacity-0"
        }
        style={
          running && finaleActive
            ? { opacity: 0, filter: "blur(8px)" }
            : undefined
        }
      />
      <audio ref={audioRef} src={REVEAL_AUDIO_SRC} preload="auto" className="hidden" />

      {running ? (
        <motion.div
          key={`reveal-${runToken}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-10 overflow-hidden"
        >
          <div
            aria-hidden
            className={`orv-reveal-scanlines pointer-events-none absolute inset-0 z-10 transition-opacity duration-[1200ms] ease-out ${
              finaleActive ? "opacity-0" : "opacity-60"
            }`}
          />
          <div
            aria-hidden
            className={`orv-reveal-vignette pointer-events-none absolute inset-0 z-10 transition-opacity duration-[1200ms] ease-out ${
              finaleActive ? "opacity-0" : "opacity-100"
            }`}
          />

          <div
            aria-hidden
            className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FINALE_HERO_ART} alt="" />
          </div>

          <div
            className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-8 transition-opacity duration-[1000ms] ease-out ${
              finaleActive ? "opacity-0" : "opacity-100"
            }`}
          >
            <AnimatePresence mode="wait">
              {currentStep && !finaleActive ? (
                <motion.p
                  key={`reveal-${revealLine}`}
                  initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(10px)" }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  className={`max-w-3xl text-center text-2xl md:text-4xl ${emphasisClass(
                    currentStep.emphasis,
                  )}`}
                >
                  {currentStep.text}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {finaleActive ? (
            <div className="absolute inset-0 z-30">
              <FinaleScene
                tapReady={tapReady}
                tapLabel="[ End of reveal — tap is a no-op here. ]"
              />
            </div>
          ) : null}
        </motion.div>
      ) : (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-md">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-neutral-500">
              [ dev / reveal ]
            </p>
            <h1 className="mt-3 font-serif text-3xl text-neutral-100">
              Reveal scene test harness
            </h1>
            <p className="mt-3 text-sm text-neutral-400">
              Loads the Gilded Lily video + audio and replays the full
              post-auth prologue and finale. Skip the intro, the name
              prompt and cookie churn while iterating on timing and
              visuals.
            </p>

            <label
              htmlFor="reader-name"
              className="mt-8 block font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-500"
            >
              Reader name
            </label>
            <input
              id="reader-name"
              value={readerName}
              onChange={(e) => setReaderName(e.target.value)}
              className="mt-2 w-full border-b border-neutral-700 bg-transparent py-2 font-serif text-lg text-neutral-100 outline-none transition-colors focus:border-neutral-400"
              autoComplete="off"
              spellCheck={false}
            />

            <button
              type="button"
              onClick={handleStart}
              className="mt-8 font-mono text-xs uppercase tracking-[0.32em] text-neutral-200 transition-colors hover:text-white"
            >
              ▸ start reveal
            </button>

            <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
              tip: controls appear top-left once playback starts.
            </p>
          </div>
        </div>
      )}

      {/* Dev HUD */}
      {running ? (
        <div className="pointer-events-auto fixed left-4 top-4 z-[60] w-[260px] select-none rounded-md border border-neutral-800/70 bg-black/70 p-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-300 backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-neutral-500">
            <span>dev hud</span>
            <span>/test/reveal</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <Row label="line">
              {revealLine + 1} / {script.length}
            </Row>
            <Row label="audio">
              {audioTime.toFixed(1)}s / {audioDuration.toFixed(1)}s
            </Row>
            <Row label="video">
              {videoTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
            </Row>
            <Row label="scene">
              {(elapsedMs / 1000).toFixed(1)}s /{" "}
              {sceneMs ? (sceneMs / 1000).toFixed(1) : "…"}s
            </Row>
            <Row label="finale">{finaleActive ? "active" : "idle"}</Row>
            <Row label="tap">{tapReady ? "ready" : "—"}</Row>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <HudButton onClick={handleRestart}>restart</HudButton>
            <HudButton onClick={skipToFinale}>skip → finale</HudButton>
            <HudButton onClick={skipToTap}>skip → tap</HudButton>
            <HudButton onClick={() => setFinaleActive((v) => !v)}>
              toggle finale
            </HudButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200">{children}</span>
    </div>
  );
}

function HudButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-neutral-700/80 bg-neutral-900/60 px-2 py-1 text-[9px] tracking-[0.18em] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
    >
      {children}
    </button>
  );
}
