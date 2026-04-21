import { PrismaClient, ChapterMood, SegmentKind, AudioKind } from "@prisma/client";

const prisma = new PrismaClient();

type Panel = { imageUrl: string; alt: string };
type Seg = {
  orderIndex: number;
  kind: SegmentKind;
  text: string;
  keywordsJson: string;
  panel?: Panel;
};

/** Demo prose only — not the licensed novel. */
const DEMO_CHAPTERS: {
  slug: string;
  title: string;
  order: number;
  mood: ChapterMood;
  intensity: number;
  segments: Seg[];
}[] = [
  {
    slug: "chapter-1-demo",
    title: "Fragment 01 — The first scenario",
    order: 1,
    mood: ChapterMood.tension,
    intensity: 72,
    segments: [
      {
        orderIndex: 0,
        kind: "system",
        text: "[ Main Scenario #1 — Proof of Worth ] has begun.\nSurvive the first wave.",
        keywordsJson: JSON.stringify([
          {
            term: "Scenario",
            definition:
              "A structured trial imposed by the Star Stream. Failure often means erasure.",
          },
        ]),
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/0d1117/39d98a/png?text=Manhwa+panel+1%0A%28replace+with+licensed+art%29",
          alt: "Placeholder manhwa panel 1",
        },
      },
      {
        orderIndex: 1,
        kind: "narration",
        text: "The subway car shudders. Fluorescent light stutters—once, twice—then holds. You are not alone in this carriage anymore.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/161b22/58a6ff/png?text=Panel+2%0A%28sync+slot%29",
          alt: "Placeholder manhwa panel 2",
        },
      },
      {
        orderIndex: 2,
        kind: "dialogue",
        text: "“Kim Dokja.” A voice cuts through static, too calm for the end of a world line. “Read the next line aloud. It matters.”",
        keywordsJson: JSON.stringify([
          {
            term: "Kim Dokja",
            definition:
              "The reader who knows how stories end—and pays the price to change them.",
          },
        ]),
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/21262d/f0883e/png?text=Panel+3",
          alt: "Placeholder manhwa panel 3",
        },
      },
      {
        orderIndex: 3,
        kind: "action",
        text: "Glass spiderwebs across the window. Something massive drags itself along the tunnel wall—sparks shower the darkness like constellations falling out of orbit.",
        keywordsJson: JSON.stringify([
          {
            term: "Constellation",
            definition:
              "Beings who observe scenarios from above; patrons, judges, and sometimes cruel narrators.",
          },
        ]),
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/2d1b0e/ff7b54/png?text=Action+panel",
          alt: "Placeholder action panel",
        },
      },
      {
        orderIndex: 4,
        kind: "system",
        text: "[ Hidden condition met ]\nA sponsor is watching. Do not disappoint them.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/1a1033/b78aff/png?text=System+beat",
          alt: "Placeholder system beat panel",
        },
      },
    ],
  },
  {
    slug: "chapter-2-demo",
    title: "Fragment 02 — Proof of context",
    order: 2,
    mood: ChapterMood.calm,
    intensity: 44,
    segments: [
      {
        orderIndex: 0,
        kind: "narration",
        text: "Morning light finds the platform empty in the wrong way: no schedules, no announcements, only the hum of a world that forgot its passengers.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/1e293b/94a3b8/png?text=Ch2+panel+1",
          alt: "Placeholder chapter 2 panel 1",
        },
      },
      {
        orderIndex: 1,
        kind: "system",
        text: "[ Tutorial clause ]\nReliability of narration is not guaranteed beyond this point.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/0f172a/38bdf8/png?text=Ch2+system",
          alt: "Placeholder chapter 2 system",
        },
      },
      {
        orderIndex: 2,
        kind: "dialogue",
        text: "“If you already know the ending,” the silence seems to ask, “why are you still turning the page?”",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/292524/a8a29e/png?text=Ch2+panel+3",
          alt: "Placeholder chapter 2 panel 3",
        },
      },
    ],
  },
  {
    slug: "chapter-3-demo",
    title: "Fragment 03 — Escalation curve",
    order: 3,
    mood: ChapterMood.chaos,
    intensity: 88,
    segments: [
      {
        orderIndex: 0,
        kind: "action",
        text: "The tunnel exhales heat. Rails sing a single high note—then the dark rushes forward to meet you.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/431407/f97316/png?text=Ch3+action",
          alt: "Placeholder chapter 3 action",
        },
      },
      {
        orderIndex: 1,
        kind: "system",
        text: "[ Constellation interest spike ]\nDo not look up. They enjoy being seen.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/2e1065/c4b5fd/png?text=Ch3+system",
          alt: "Placeholder chapter 3 system",
        },
      },
      {
        orderIndex: 2,
        kind: "narration",
        text: "Somewhere above the scenario ceiling, something like laughter threads through static—thin, patient, already planning the next line.",
        keywordsJson: "[]",
        panel: {
          imageUrl:
            "https://placehold.co/720x1020/134e4a/5eead4/png?text=Ch3+fin",
          alt: "Placeholder chapter 3 final panel",
        },
      },
    ],
  },
];

async function main() {
  await prisma.analyticsEvent.deleteMany();
  await prisma.readingProgress.deleteMany();
  await prisma.manhwaPanel.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.audioAsset.deleteMany();

  for (const ch of DEMO_CHAPTERS) {
    const chapter = await prisma.chapter.create({
      data: {
        slug: ch.slug,
        title: ch.title,
        order: ch.order,
        mood: ch.mood,
        intensity: ch.intensity,
      },
    });

    for (const s of ch.segments) {
      const seg = await prisma.segment.create({
        data: {
          chapterId: chapter.id,
          orderIndex: s.orderIndex,
          kind: s.kind,
          text: s.text,
          keywordsJson: s.keywordsJson,
        },
      });
      if (s.panel) {
        await prisma.manhwaPanel.create({
          data: {
            segmentId: seg.id,
            imageUrl: s.panel.imageUrl,
            alt: s.panel.alt,
          },
        });
      }
    }
    console.log("Seeded:", chapter.slug);
  }

  await prisma.audioAsset.createMany({
    data: [
      {
        key: "ambient_drone",
        kind: AudioKind.ambient,
        url: "/audio/README.txt",
        label: "Low subway drone (replace with file)",
      },
      {
        key: "music_tension",
        kind: AudioKind.music,
        url: "/audio/README.txt",
        label: "Tension bed (replace with file)",
      },
      {
        key: "sfx_system",
        kind: AudioKind.sfx_system,
        url: "/audio/README.txt",
        label: "System ping (replace with file)",
      },
      {
        key: "sfx_slash",
        kind: AudioKind.sfx_action,
        url: "/audio/README.txt",
        label: "Impact (replace with file)",
      },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
