import { StoryLanding } from "@/components/StoryLanding";
import { sequelChapterIndexRows } from "@/lib/sequel-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ORV Sequel · Omniscient Reader",
  description:
    "Read the Omniscient Reader's Viewpoint side-story (Ch 553+), locally cached for this reader.",
};

export default async function SequelLandingPage() {
  const rows = sequelChapterIndexRows();
  return <StoryLanding chapters={rows} series="sequel" />;
}
