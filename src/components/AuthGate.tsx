"use client";

import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  playAccessDenied,
  playBackspaceTick,
  playKeystroke,
  playRecognizedChime,
} from "@/lib/keystroke-sound";
import { playGameStartJingle, resumeAudio } from "@/lib/audio-engine";
import { FinaleScene } from "@/components/FinaleScene";
import { PROLOGUE_COOKIE } from "@/lib/orv-auth-policy";
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
import { getOrCreateDeviceId } from "@/lib/device-id";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Hold [ recognized ] + reader name on screen before starting reveal video.
const UNLOCK_MS = 3000;

type Phase = "tap" | "intro" | "prompt" | "unlocking" | "reveal";

type IntroStep = { text: string; whisper?: string };

const INTRO_STEPS: IntroStep[] = [
  { text: "[ You are not the only one alive? ]", whisper: "— a lonely voice" },
  { text: "[ I am alone. ]", whisper: "— are you really? Alone?" },
  { text: "Why did you come here, if you are alone?" },
  { text: "[ I… ]" },
  { text: "[ You… who are you? ]" },
];

const INTRO_PRIMARY_IN_MS = 700;
const INTRO_WHISPER_DELAY_MS = 1900;
const INTRO_HOLD_WITH_WHISPER_MS = 5400;
const INTRO_HOLD_SOLO_MS = 3800;
const INTRO_EXIT_MS = 620;
const INTRO_GAP_MS = 650;

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Where to land after the prologue. Never send readers back to `/chapters` from a stale `next` — always story library (`/`). Deep links to a chapter still work. */
function postAuthDestination(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next === "/chapters" || next.startsWith("/chapters?")) return "/";
  return next;
}

export function AuthGate() {
  const router = useRouter();
  const search = useSearchParams();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("tap");
  const [tapFading, setTapFading] = useState(false);
  const tapLock = useRef(false);
  const [introStep, setIntroStep] = useState(0);
  const [introShowWhisper, setIntroShowWhisper] = useState(false);
  const [introExiting, setIntroExiting] = useState(false);
  const [readerName, setReaderName] = useState("");
  const [isTouch, setIsTouch] = useState(false);
  const [deniedCount, setDeniedCount] = useState(0);
  const [revealLine, setRevealLine] = useState(0);
  const [tapReady, setTapReady] = useState(false);
  const [finaleActive, setFinaleActive] = useState(false);
  const shakeControls = useAnimation();
  const continuedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealTimersRef = useRef<number[]>([]);
  const rampIntervalRef = useRef<number | null>(null);

  const script = useMemo(
    () => buildRevealScript(readerName || "Reader"),
    [readerName],
  );

  useEffect(() => {
    setIsTouch(
      typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches,
    );
  }, []);

  // Intro phase pacing
  useEffect(() => {
    if (phase !== "intro") return;
    const step = INTRO_STEPS[introStep];
    if (!step) {
      setPhase("prompt");
      return;
    }
    setIntroShowWhisper(false);
    setIntroExiting(false);
    const timers: number[] = [];
    if (step.whisper) {
      timers.push(
        window.setTimeout(
          () => setIntroShowWhisper(true),
          INTRO_WHISPER_DELAY_MS,
        ),
      );
    }
    const holdMs = step.whisper
      ? INTRO_HOLD_WITH_WHISPER_MS
      : INTRO_HOLD_SOLO_MS;
    timers.push(
      window.setTimeout(
        () => setIntroExiting(true),
        INTRO_PRIMARY_IN_MS + holdMs,
      ),
    );
    timers.push(
      window.setTimeout(
        () => {
          if (introStep + 1 < INTRO_STEPS.length) {
            setIntroStep((s) => s + 1);
          } else {
            setPhase("prompt");
          }
        },
        INTRO_PRIMARY_IN_MS + holdMs + INTRO_EXIT_MS + INTRO_GAP_MS,
      ),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [phase, introStep]);

  // Unlocking → reveal handoff
  useEffect(() => {
    if (phase !== "unlocking") return;
    const t = window.setTimeout(() => setPhase("reveal"), UNLOCK_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Reveal orchestration: video + audio + line scheduling
  useEffect(() => {
    if (phase !== "reveal") return;

    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const clearTimers = () => {
      for (const id of revealTimersRef.current) window.clearTimeout(id);
      revealTimersRef.current = [];
      if (rampIntervalRef.current !== null) {
        window.clearInterval(rampIntervalRef.current);
        rampIntervalRef.current = null;
      }
    };

    // Best-effort: adjust the video playback speed whenever its metadata
    // arrives so the animation ends roughly together with the song. The
    // scene scheduling itself does NOT depend on this — otherwise a slow
    // or failed video load would freeze the prologue on its first line.
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

      fitVideoToScene(sceneMs);

      const N = script.length;
      const firstAt = 0;
      const lastAt = Math.max(firstAt + 1000, sceneMs - outroMs);

      // Normalize per-line weights so the sum of all intervals up to the
      // final line fills (lastAt - firstAt). This lets atmospheric lines
      // feel quick while emphasis/command banners breathe.
      const weights = script.map((s) => Math.max(0.1, s.weight ?? 1));
      const intervalWeights = weights.slice(0, -1);
      const totalWeight =
        intervalWeights.reduce((a, b) => a + b, 0) || 1;
      const unit = (lastAt - firstAt) / totalWeight;

      clearTimers();

      let cursor = firstAt;
      for (let i = 1; i < N; i++) {
        cursor += intervalWeights[i - 1] * unit;
        revealTimersRef.current.push(
          window.setTimeout(() => setRevealLine(i), Math.round(cursor)),
        );
      }

      // Start the song after the silent pause
      revealTimersRef.current.push(
        window.setTimeout(() => {
          try {
            audio.currentTime = SONG_START_TIME_S;
          } catch {
            /* ignore */
          }
          audio.muted = false;
          audio.volume = SONG_INITIAL_VOLUME;
          void audio.play().catch(() => {
            /* autoplay blocked — unlikely since we came from a user gesture */
          });

          // Gradual volume ramp
          if (rampIntervalRef.current !== null) {
            window.clearInterval(rampIntervalRef.current);
          }
          const steps = 40;
          const stepSize =
            (SONG_TARGET_VOLUME - SONG_INITIAL_VOLUME) / steps;
          let i = 0;
          const iv = window.setInterval(() => {
            i++;
            const next = Math.min(
              SONG_TARGET_VOLUME,
              SONG_INITIAL_VOLUME + stepSize * i,
            );
            audio.volume = next;
            if (i >= steps) {
              audio.volume = SONG_TARGET_VOLUME;
              window.clearInterval(iv);
              rampIntervalRef.current = null;
            }
          }, SONG_RAMP_MS / steps);
          rampIntervalRef.current = iv;
        }, SONG_INITIAL_DELAY_MS),
      );

      // Finale: fades in just before the video ends and takes over
      // once the song trails off. Centred hero illustration, soft
      // halo, drifting motes and a tap prompt.
      const finaleAt = Math.max(0, sceneMs - FINALE_LEAD_IN_MS);
      revealTimersRef.current.push(
        window.setTimeout(() => setFinaleActive(true), finaleAt),
      );

      // Tap prompt appears once the finale has had time to breathe.
      revealTimersRef.current.push(
        window.setTimeout(
          () => setTapReady(true),
          sceneMs + FINALE_TAP_DELAY_MS,
        ),
      );

      return true;
    };

    let cancelled = false;

    const attemptStart = () => {
      if (cancelled) return;
      video.muted = true;
      video.playsInline = true;
      void video.play().catch(() => {
        /* first play may be blocked; we retry on user gesture */
      });

      // Try to schedule immediately if audio metadata is already known
      // (it usually is, because we primed the audio element inside the
      // submit gesture).
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

      // If video metadata arrives later, adjust its playbackRate then —
      // independently of the already-running line schedule.
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

    attemptStart();

    // Retry video play on any gesture (in case autoplay was blocked)
    const retry = () => {
      if (video.paused) void video.play().catch(() => {});
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);

    return () => {
      cancelled = true;
      clearTimers();
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [phase, script.length]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (video) {
        video.pause();
        video.src = "";
      }
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      for (const id of revealTimersRef.current) window.clearTimeout(id);
      revealTimersRef.current = [];
      if (rampIntervalRef.current !== null) {
        window.clearInterval(rampIntervalRef.current);
        rampIntervalRef.current = null;
      }
    };
  }, []);

  const fadeOutAndGo = useCallback(() => {
    if (continuedRef.current) return;
    continuedRef.current = true;

    const audio = audioRef.current;
    if (audio) {
      const steps = 24;
      const start = audio.volume;
      let i = 0;
      const iv = window.setInterval(() => {
        i++;
        audio.volume = Math.max(0, start * (1 - i / steps));
        if (i >= steps) {
          audio.pause();
          window.clearInterval(iv);
        }
      }, 30);
    }

    const destination = postAuthDestination(search.get("next"));
    document.cookie = `${PROLOGUE_COOKIE}=1;path=/;max-age=${ONE_YEAR_SECONDS};SameSite=Lax`;
    router.replace(destination);
    router.refresh();
  }, [router, search]);

  useEffect(() => {
    if (phase !== "reveal" || !tapReady) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fadeOutAndGo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, tapReady, fadeOutAndGo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = normalize(value);
    if (!name) {
      setError("Whisper your name first.");
      return;
    }

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          deviceId: getOrCreateDeviceId(),
        }),
      });
      if (!res.ok) {
        setError("Access denied. Try another name, reader.");
        setDeniedCount((c) => c + 1);
        playAccessDenied();
        void shakeControls.start({
          x: [0, -14, 14, -10, 10, -6, 6, 0],
          transition: { duration: 0.55, ease: [0.36, 0.07, 0.19, 0.97] },
        });
        return;
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
      return;
    }

    setReaderName(titleCase(name));

    // Prime media elements within this user gesture so subsequent
    // programmatic play() calls (after the 3s unlocking delay) are
    // allowed by autoplay policies.
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

    setPhase("unlocking");
    playRecognizedChime();
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      playBackspaceTick();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      playKeystroke();
    }
  }

  const onAuthTapToStart = useCallback(() => {
    if (tapLock.current) return;
    tapLock.current = true;
    void (async () => {
      await resumeAudio();
      playGameStartJingle();
    })();
    setTapFading(true);
  }, []);

  const continueLabel = isTouch ? "Tap to continue" : "Click to continue";
  const revealClickable = phase === "reveal" && tapReady;
  const currentStep = script[Math.min(revealLine, script.length - 1)];

  return (
    <div
      onClick={revealClickable ? fadeOutAndGo : undefined}
      className={`orv-auth-gate relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-neutral-200 ${
        revealClickable ? "cursor-pointer" : ""
      }`}
    >
      <video
        ref={videoRef}
        src={REVEAL_VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        className={
          phase === "reveal"
            ? "fixed inset-0 z-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-out"
            : "pointer-events-none fixed -left-[200vw] top-0 h-0 w-0 opacity-0"
        }
        style={
          phase === "reveal" && finaleActive
            ? { opacity: 0, filter: "blur(8px)" }
            : undefined
        }
      />
      <audio
        ref={audioRef}
        src={REVEAL_AUDIO_SRC}
        preload="auto"
        className="hidden"
      />
      <AnimatePresence mode="wait">
        {phase === "tap" ? (
          <motion.button
            key="tap-start"
            type="button"
            aria-label="Click or tap to start the prologue"
            onClick={onAuthTapToStart}
            initial={{ opacity: 1 }}
            animate={{ opacity: tapFading ? 0 : 1 }}
            transition={{ duration: 1.15, ease: [0.42, 0, 0.58, 1] }}
            onAnimationComplete={() => {
              if (!tapFading || phase !== "tap") return;
              setPhase("intro");
            }}
            className="fixed inset-0 z-[50] flex cursor-pointer flex-col items-center justify-center gap-3 border-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(12,10,8,0.94),rgba(0,0,0,0.98))] px-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#d6aa5c]/50"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.38em] text-[#c9a86a]">
              Star stream
            </span>
            <span className="font-serif text-[clamp(1.25rem,4vw,1.85rem)] font-medium tracking-tight text-neutral-100">
              Click or tap to start
            </span>
            <span className="max-w-xs font-mono text-[10px] leading-relaxed tracking-[0.12em] text-neutral-500">
              Sound unlocks the scenario — then the prologue begins.
            </span>
          </motion.button>
        ) : phase === "intro" ? (
          <motion.div
            key={`intro-${introStep}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: introExiting ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: introExiting ? INTRO_EXIT_MS / 1000 : 0.4,
              ease: introExiting
                ? [0.7, 0, 0.84, 0]
                : [0.22, 1, 0.36, 1],
            }}
            className="flex w-full max-w-3xl flex-col items-center text-center"
          >
            <motion.p
              key={`intro-text-${introStep}`}
              initial={{
                opacity: 0,
                x: -6,
                skewX: "-4deg",
                filter: "blur(3px)",
              }}
              animate={{
                opacity: introExiting
                  ? [1, 0.2, 0.6, 0]
                  : [0, 1, 0.15, 1, 0.4, 1],
                x: introExiting ? [0, 3, -5, 2, 0] : [-6, 3, -2, 1, 0, 0],
                skewX: introExiting
                  ? ["0deg", "2deg", "-3deg", "0deg"]
                  : ["-4deg", "2deg", "-1deg", "0deg"],
                filter: introExiting
                  ? ["blur(0px)", "blur(1px)", "blur(3px)"]
                  : ["blur(3px)", "blur(0px)", "blur(0px)"],
              }}
              transition={{
                duration: introExiting
                  ? INTRO_EXIT_MS / 1000
                  : INTRO_PRIMARY_IN_MS / 1000,
                ease: "easeOut",
              }}
              className="orv-intro-text text-lg font-medium md:text-2xl"
            >
              {INTRO_STEPS[introStep]?.text}
            </motion.p>
            <AnimatePresence>
              {introShowWhisper && !introExiting ? (
                <motion.p
                  key={`intro-whisper-${introStep}`}
                  initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(3px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="orv-intro-whisper mt-5 text-sm md:text-base"
                >
                  {INTRO_STEPS[introStep]?.whisper}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : phase === "prompt" ? (
          <motion.form
            key="prompt"
            onSubmit={onSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="relative w-full max-w-sm"
          >
            <AnimatePresence>
              {deniedCount > 0 ? (
                <motion.div
                  key={`flash-${deniedCount}`}
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.55, 0.18, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.65, ease: "easeOut" }}
                  className="pointer-events-none fixed inset-0 z-0"
                  style={{
                    background:
                      "radial-gradient(circle at center, rgba(153, 27, 27, 0.55) 0%, rgba(40, 0, 0, 0.35) 40%, transparent 75%)",
                    mixBlendMode: "screen",
                  }}
                />
              ) : null}
            </AnimatePresence>
            <motion.div animate={shakeControls} className="relative z-10">
              <label
                htmlFor="reader-name"
                className="block font-serif text-xl text-neutral-100"
              >
                What is your name, reader?
              </label>
              <input
                id="reader-name"
                autoFocus
                value={value}
                onKeyDown={onInputKeyDown}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                className={`mt-4 w-full border-b bg-transparent py-2 font-serif text-lg outline-none transition-colors ${
                  error
                    ? "border-rose-500/60 text-rose-100 focus:border-rose-400"
                    : "border-neutral-700 text-neutral-100 focus:border-neutral-400"
                }`}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
              />
              <button
                type="submit"
                className="mt-5 font-mono text-xs uppercase tracking-[0.28em] text-neutral-500 transition-colors hover:text-neutral-200"
              >
                Enter
              </button>
              <div className="mt-4 min-h-[28px]">
                <AnimatePresence mode="wait">
                  {error ? (
                    <motion.div
                      key={`error-${deniedCount}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      {deniedCount > 0 ? (
                        <p className="orv-denied-text font-mono text-[11px] uppercase">
                          [ access denied ]
                        </p>
                      ) : null}
                      <p
                        className={`font-mono text-[10px] uppercase tracking-[0.32em] ${
                          deniedCount > 0
                            ? "mt-1 text-rose-300/70"
                            : "text-rose-400/80"
                        }`}
                      >
                        {error}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.form>
        ) : phase === "unlocking" ? (
          <motion.div
            key="unlocking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-xl flex-col items-center text-center"
          >
            <motion.div
              aria-hidden
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.7 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mb-10 h-px w-56 origin-left bg-gradient-to-r from-transparent via-[color:rgba(214,170,92,0.55)] to-transparent"
            />
            <motion.p
              initial={{
                opacity: 0,
                y: 4,
                filter: "blur(8px)",
                letterSpacing: "0.6em",
              }}
              animate={{
                opacity: [0, 0.2, 1, 0.6, 1],
                y: 0,
                filter: "blur(0px)",
                letterSpacing: "0.28em",
              }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="font-mono text-[11px] uppercase md:text-xs"
              style={{ color: "#e6c47a" }}
            >
              [ recognized ]
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 6, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 font-serif text-2xl md:text-3xl"
              style={{
                color: "#f4e4c4",
                textShadow:
                  "0 0 14px rgba(214,170,92,0.35), 0 0 42px rgba(214,170,92,0.18)",
              }}
            >
              « {readerName} »
            </motion.p>
            <motion.div
              aria-hidden
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.7 }}
              transition={{ delay: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 h-px w-56 origin-right bg-gradient-to-r from-transparent via-[color:rgba(214,170,92,0.55)] to-transparent"
            />
          </motion.div>
        ) : (
          <motion.div
            key="reveal"
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

            {/* Warm the hero image so it doesn't pop in during the finale. */}
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
                  tapLabel={`[ ${continueLabel}. ]`}
                />
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
