/**
 * Local “scenario” scoring from visible text (no network). Optional OpenAI refinement in /api/scenario-mood.
 */

export type ScenarioVariant = "calm" | "tension" | "chaos" | "system";

export function classifyScenarioLocal(title: string, excerpt: string): {
  variant: ScenarioVariant;
  energy: number;
} {
  const t = `${title}\n${excerpt}`.toLowerCase();
  let tension = 0;
  let chaos = 0;
  let system = 0;

  if (
    /\bstar stream\b|\bconstellation\b|\[.*scenario|\[.*main scenario|system window|\[\s*system\b/i.test(
      t,
    )
  ) {
    system += 3;
  }
  if (
    /\b(blood|blade|death|monster|demon|collapse|explosion|scream|slash|corpse)\b/i.test(t)
  ) {
    chaos += 2;
  }
  if (/\b(fear|trembling|panic|escape|danger|warning)\b/i.test(t)) tension += 2;
  if (/\b(calm|quiet|tea|rest|peace|soft)\b/i.test(t)) tension -= 1;

  const raw = system * 0.9 + chaos * 1.1 + Math.max(0, tension);
  const energy = Math.min(1, Math.max(0.22, raw / 7 + 0.15));

  let variant: ScenarioVariant = "calm";
  if (system >= 2.5) variant = "system";
  else if (chaos >= 3) variant = "chaos";
  else if (chaos + tension >= 2.5) variant = "tension";

  return { variant, energy };
}

export function coerceScenarioVariant(raw: string | undefined): ScenarioVariant {
  const v = raw?.toLowerCase().trim();
  if (v === "calm" || v === "tension" || v === "chaos" || v === "system") return v;
  return "calm";
}
