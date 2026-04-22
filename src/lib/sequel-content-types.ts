export type SequelSegmentKind =
  | "line"
  | "notice"
  | "quote"
  | "window"
  | "divider"
  | "spacer";

export type SequelSegment = {
  kind: SequelSegmentKind;
  text: string;
  title?: string;
};

export type SequelChapter = {
  number: number;
  slug: string;
  title: string;
  order: number;
  segments: SequelSegment[];
  authorNote: SequelSegment[];
  sourceUrl: string;
  scrapedAt: string;
};

export type SequelIndexEntry = {
  number: number;
  slug: string;
  title: string;
  order: number;
};
