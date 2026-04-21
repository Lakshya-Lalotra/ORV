import { NextResponse } from "next/server";
import {
  classifyScenarioLocal,
  coerceScenarioVariant,
  type ScenarioVariant,
} from "@/lib/scenario-music";

export const runtime = "nodejs";

type Body = { title?: string; excerpt?: string };

async function openAiClassify(
  title: string,
  excerpt: string,
): Promise<{ variant: ScenarioVariant; energy: number } | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.OPENAI_SCENARIO_MODEL?.trim() || "gpt-4o-mini";
  const slice = excerpt.slice(0, 2800);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Reply with JSON only: {"variant":"calm"|"tension"|"chaos"|"system","energy":number 0-1} for dark fantasy webnovel atmosphere.',
        },
        {
          role: "user",
          content: `Title: ${title.slice(0, 400)}\n\nExcerpt:\n${slice}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  try {
    const j = JSON.parse(text) as { variant?: string; energy?: number };
    return {
      variant: coerceScenarioVariant(j.variant),
      energy:
        typeof j.energy === "number" && Number.isFinite(j.energy)
          ? Math.min(1, Math.max(0, j.energy))
          : 0.5,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title : "";
  const excerpt = typeof body.excerpt === "string" ? body.excerpt : "";

  const local = classifyScenarioLocal(title, excerpt);
  const ai = await openAiClassify(title, excerpt);
  const out = ai ?? local;

  return NextResponse.json({
    variant: out.variant,
    energy: out.energy,
    source: ai ? "openai" : "local",
  });
}
