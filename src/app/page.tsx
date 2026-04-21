import type { Metadata } from "next";
import { StoryModePicker } from "@/components/StoryModePicker";

export const metadata: Metadata = {
  title: "Stories — ORV Reader",
  description:
    "Pick novel or manhwa before opening the reader (orv.pages.dev–style flow).",
};

export default function Home() {
  return <StoryModePicker />;
}
