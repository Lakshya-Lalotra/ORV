"use client";

import { useLocalProgress } from "@/hooks/useLocalProgress";
import {
  effectiveChapterMark,
  setChapterMark,
  type ChapterMark,
  type ProgressBucketKey,
} from "@/lib/local-progress";

type Props = {
  bucket: ProgressBucketKey;
  slug: string;
  title: string;
  /** Tighter styling for chapter reader header. */
  variant?: "card" | "inline";
};

const OPTIONS: { value: ChapterMark; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

export function ChapterShelfSelect({ bucket, slug, title, variant = "card" }: Props) {
  const progress = useLocalProgress();
  const entry = progress[bucket].chapters[slug];
  const value = effectiveChapterMark(entry);

  const selectClass =
    variant === "inline"
      ? "max-w-[9.5rem] rounded-full border border-[var(--reader-border)] bg-[var(--reader-bg)]/60 px-2 py-1.5 font-mono text-[10px] text-[var(--reader-fg)] outline-none ring-[var(--accent)]/30 focus:ring-2"
      : "w-full max-w-[11rem] rounded-full border border-[var(--hairline)] bg-[var(--overlay-mid)] px-3 py-2 font-mono text-[10px] text-[var(--reader-fg)] outline-none ring-[var(--accent)]/25 focus:ring-2";

  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--reader-muted)]">
        Shelf
      </span>
      <select
        value={value}
        onChange={(e) => {
          setChapterMark(bucket, slug, e.target.value as ChapterMark, title);
        }}
        className={selectClass}
        aria-label="Mark chapter as unread, reading, or read"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
