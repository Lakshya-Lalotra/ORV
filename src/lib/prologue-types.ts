/** Serializable prologue payload from `content/prologue.json` (passed server → client). */

export type IntroStepPayload = { text: string; whisper?: string };

export type RevealStepPayload = {
  text: string;
  emphasis?: "soft" | "wobble" | "breathe" | "command";
  weight?: number;
};

export type ProloguePayload = {
  intro: IntroStepPayload[];
  reveal: RevealStepPayload[];
};
