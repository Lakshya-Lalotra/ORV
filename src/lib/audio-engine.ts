/**
 * Procedural SFX + scenario ambient bed via Web Audio API — no MP3 assets required.
 */

import type { ScenarioVariant } from "./scenario-music";

let ctx: AudioContext | null = null;
let ambientBedStop: (() => void) | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function resumeAudio() {
  const c = getCtx();
  if (c?.state === "suspended") await c.resume();
}

function noiseBuffer(duration: number, sampleRate: number): AudioBuffer {
  const c = getCtx();
  if (!c) throw new Error("No AudioContext");
  const frames = Math.floor(duration * sampleRate);
  const buffer = c.createBuffer(1, frames, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function playGlitchSystem(volume = 0.35) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 8;
  osc.type = "square";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.22);

  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.15, c.sampleRate);
  const ng = c.createGain();
  ng.gain.setValueAtTime(volume * 0.4, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  noise.connect(ng);
  ng.connect(c.destination);
  noise.start(now);
}

export function playImpact(volume = 0.45) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.28);
}

/**
 * Short “new game / login” style jingle: rising tones + soft click, then fades out (no external assets).
 * Call after `resumeAudio()` so the AudioContext is running (user gesture).
 */
export function playGameStartJingle() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.42, now + 0.04);
  master.gain.exponentialRampToValueAtTime(0.12, now + 0.85);
  master.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
  master.connect(c.destination);

  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const t0 = now + i * 0.09;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.38);
  });

  const thud = c.createOscillator();
  const tg = c.createGain();
  thud.type = "sine";
  thud.frequency.setValueAtTime(90, now);
  thud.frequency.exponentialRampToValueAtTime(45, now + 0.12);
  tg.gain.setValueAtTime(0.0001, now);
  tg.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  thud.connect(tg);
  tg.connect(master);
  thud.start(now);
  thud.stop(now + 0.25);

  const click = c.createBufferSource();
  click.buffer = noiseBuffer(0.04, c.sampleRate);
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.12, now + 0.28);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  click.connect(cg);
  cg.connect(master);
  click.start(now + 0.28);
}

export function playUiHover(volume = 0.08) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.linearRampToValueAtTime(740, now + 0.05);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playAmbientShift(intensity: number) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  const f = 80 + intensity * 0.4;
  osc.frequency.setValueAtTime(f, now);
  gain.gain.setValueAtTime(0.02 + intensity * 0.0003, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

export function speakLine(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 0.9;
  window.speechSynthesis.speak(u);
}

export type ScenarioAmbientState = {
  mood: "calm" | "tension" | "chaos";
  intensity: number;
  activeKind: "narration" | "dialogue" | "system" | "action";
  classifierVariant?: ScenarioVariant;
  classifierEnergy?: number;
};

function pickVariant(s: ScenarioAmbientState): ScenarioVariant {
  if (s.activeKind === "system") return "system";
  if (s.classifierVariant) return s.classifierVariant;
  return s.mood;
}

function energyMix(s: ScenarioAmbientState): number {
  const fromDb = Math.min(1, Math.max(0, s.intensity / 100));
  const fromAi =
    typeof s.classifierEnergy === "number" && Number.isFinite(s.classifierEnergy)
      ? s.classifierEnergy
      : fromDb;
  return Math.min(1, Math.max(0.15, fromDb * 0.45 + fromAi * 0.55));
}

function profileForVariant(v: ScenarioVariant, e: number) {
  const bases = {
    calm: { root: 58, ratio: 1.2599, noise: 0.01, filter: 720, lfo: 0.04, master: 0.028 },
    tension: { root: 71, ratio: 1.22, noise: 0.035, filter: 1200, lfo: 0.1, master: 0.038 },
    chaos: { root: 86, ratio: 1.18, noise: 0.065, filter: 2000, lfo: 0.18, master: 0.045 },
    system: { root: 96, ratio: 1.414, noise: 0.048, filter: 1600, lfo: 0.22, master: 0.042 },
  }[v];
  const bump = e * 28;
  return {
    rootHz: bases.root + bump * 0.35,
    ratio: bases.ratio,
    noiseGain: bases.noise + e * 0.04,
    filterHz: bases.filter + e * 400,
    lfoHz: bases.lfo + e * 0.08,
    masterGain: bases.master + e * 0.022,
  };
}

/** Scenario-aware ambient bed (replaces plain drone). */
export async function setScenarioAmbient(enabled: boolean, state: ScenarioAmbientState) {
  const c = getCtx();
  if (!c) return;
  await resumeAudio();

  ambientBedStop?.();
  ambientBedStop = null;

  if (!enabled) return;

  const variant = pickVariant(state);
  const e = energyMix(state);
  const p = profileForVariant(variant, e);
  const now = c.currentTime;

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(p.masterGain, now + 1.35);
  master.connect(c.destination);

  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.setValueAtTime(p.rootHz, now);
  osc2.frequency.setValueAtTime(p.rootHz * p.ratio * 1.002, now);

  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(p.lfoHz, now);
  const lfoGain = c.createGain();
  lfoGain.gain.setValueAtTime(p.rootHz * 0.018 + e * 0.04, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(p.filterHz, now);
  filter.Q.setValueAtTime(0.65, now);

  const dry = c.createGain();
  dry.gain.value = 0.52;
  osc1.connect(dry);
  osc2.connect(dry);
  dry.connect(filter);

  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = noiseBuffer(3, c.sampleRate);
  noiseSrc.loop = true;
  const noiseG = c.createGain();
  noiseG.gain.value = p.noiseGain;
  noiseSrc.connect(noiseG);
  noiseG.connect(filter);

  filter.connect(master);

  osc1.start(now);
  osc2.start(now);
  lfo.start(now);
  noiseSrc.start(now);

  const nodes: { stop: (t: number) => void }[] = [
    { stop: (t) => osc1.stop(t) },
    { stop: (t) => osc2.stop(t) },
    { stop: (t) => lfo.stop(t) },
    { stop: (t) => noiseSrc.stop(t) },
  ];

  ambientBedStop = () => {
    const t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const stopAt = t + 0.62;
    for (const n of nodes) n.stop(stopAt);
  };
}
