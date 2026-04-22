import { NextResponse } from "next/server";
import { z } from "zod";
import {
  classifyScenarioLocal,
  coerceScenarioVariant,
  type ScenarioVariant,
} from "@/lib/scenario-music";
import { isAuthenticatedReader } from "@/lib/require-reader";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * The local classifier is cheap and pure-JS; the OpenAI hop costs money.
 * Keep a tight budget even for allowlisted readers so a stuck tab
 * doesn't run up the bill (20 calls/min/IP is plenty for real usage:
 * one classification per chapter load).
 */
const MOOD_LIMIT = { limit: 20, windowMs: 60 * 1000 };

const bodySchema = z.object({
  title: z.string().max(400).optional(),
  excerpt: z.string().max(8000).optional(),
});

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
  if (!(await isAuthenticatedReader())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = rateLimit(`scenario-mood:${ip}`, MOOD_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = parsed.data.title ?? "";
  const excerpt = parsed.data.excerpt ?? "";

  const local = classifyScenarioLocal(title, excerpt);
  const ai = await openAiClassify(title, excerpt);
  const out = ai ?? local;

  return NextResponse.json({
    variant: out.variant,
    energy: out.energy,
    source: ai ? "openai" : "local",
  });
}
