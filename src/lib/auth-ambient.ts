/**
 * Auth ambient — intentionally a no-op.
 *
 * The procedural Web Audio drone was removed. The auth page is silent
 * until the user submits a valid name, at which point the overlay audio
 * element in `AuthGate` (`/audio/videoplayback.weba`) fades in and is
 * the only sound source.
 *
 * These stubs are kept so `AuthGate.tsx` can keep its existing imports
 * without a bigger refactor.
 */

export async function resumeAuthAmbient(): Promise<void> {
  /* no-op */
}

export async function startMysteryAmbient(_volume?: number): Promise<void> {
  void _volume;
  /* no-op: procedural ambient removed */
}

export function stopMysteryAmbient(): void {
  /* no-op */
}

export function setMysteryAmbientVolume(_volume: number, _rampSeconds?: number): void {
  void _volume;
  void _rampSeconds;
  /* no-op */
}
