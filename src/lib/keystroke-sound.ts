/**
 * Short, soft procedural keystroke click. Plays a pitched sine "pick"
 * with fast decay. No continuous layers, so no risk of drone buzz.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export function playKeystroke(volume = 0.12) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }

  const now = c.currentTime;
  const basePitch = 780 + Math.random() * 420;

  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(basePitch, now);
  osc.frequency.exponentialRampToValueAtTime(basePitch * 0.6, now + 0.04);

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 1.1;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

export function playBackspaceTick(volume = 0.1) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const now = c.currentTime;

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.08);
}

export function playAccessDenied(volume = 0.28) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const now = c.currentTime;

  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, now);
  lp.frequency.exponentialRampToValueAtTime(320, now + 0.6);
  lp.Q.value = 1.1;
  lp.connect(master);

  const freqs = [196, 233];
  freqs.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + 0.55);

    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume * (i === 0 ? 0.55 : 0.4), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.connect(g);
    g.connect(lp);
    osc.start(now);
    osc.stop(now + 0.65);
  });

  const sub = c.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(70, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.25);
  const subGain = c.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(volume * 0.6, now + 0.01);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start(now);
  sub.stop(now + 0.35);

  const frames = Math.floor(0.09 * c.sampleRate);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 520;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.12);
}

export function playRecognizedChime(volume = 0.28) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const now = c.currentTime;

  const notes = [520, 660, 784];

  notes.forEach((freq, i) => {
    const t = now + i * 0.09;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);

    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    lp.Q.value = 0.6;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(c.destination);

    osc.start(t);
    osc.stop(t + 1.25);
  });
}
