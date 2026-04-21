import { StoryLanding } from "@/components/StoryLanding";
import { sideChapterIndexRows } from "@/lib/side-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ORV One-shots · Omniscient Reader",
  description: "Side stories from the ORV universe (local EPUB).",
};

export default function SideStoriesLandingPage() {
  const rows = sideChapterIndexRows();
  return <StoryLanding chapters={rows} series="side" />;
}
