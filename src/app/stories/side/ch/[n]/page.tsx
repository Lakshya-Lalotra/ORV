import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ n: string }>;
};

/** Legacy URL — canonical reader is `/chapter/orv-side-ch-[n]` (same UI as main novel). */
export default async function LegacySideChapterRedirect({ params }: PageProps) {
  const { n } = await params;
  const number = Number(n);
  if (!Number.isFinite(number)) notFound();
  redirect(`/chapter/orv-side-ch-${number}`);
}
