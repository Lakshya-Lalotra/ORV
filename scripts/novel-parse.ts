/** Shared plain-text → chapter list (`Chapter N:` or short-form `Ch N:` headings). */

const CH_HEAD = "(?:Chapter|Ch)";

/**
 * Single-line heading like `Ch 12: Subtitle` or `Chapter 12: Subtitle`.
 */
export function parseNovelChapterHeading(line: string): { num: number; title: string } | null {
  const t = line.trim();
  const m = t.match(new RegExp(`^${CH_HEAD}\\s+(\\d+)\\s*:\\s*(.*)$`, "i"));
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  if (Number.isNaN(num) || num < 1) return null;
  const rest = (m[2] ?? "").trim();
  return { num, title: rest || `Chapter ${num}` };
}

export function expandChapterLineBreaks(text: string): string {
  const lines = text.split(/\n/);
  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  if (maxLineLen < 8_000) return text;
  return text.replace(
    new RegExp(`([^\\n])(${CH_HEAD} \\d+:)`, "g"),
    "$1\n\n$2",
  );
}

export function findBodyStart(text: string): number {
  const markers: RegExp[] = [
    new RegExp(`\\n${CH_HEAD} 1:\\s*Prologue`, "is"),
    new RegExp(`^${CH_HEAD} 1:\\s*Prologue`, "is"),
    new RegExp(`\\n${CH_HEAD} 1:\\s*Ep\\.\\s*0`, "is"),
    new RegExp(`^${CH_HEAD} 1:\\s*Ep\\.\\s*0`, "is"),
    new RegExp(`\\n${CH_HEAD} 1:\\s*Episode\\s*0`, "is"),
    new RegExp(`^${CH_HEAD} 1:\\s*Episode\\s*0`, "is"),
    new RegExp(`\\n${CH_HEAD} 1:`, "s"),
    new RegExp(`^${CH_HEAD} 1:`, "m"),
  ];
  for (const re of markers) {
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      return m[0].startsWith("\n") ? m.index + 1 : m.index;
    }
  }
  return -1;
}

export function parseChapterChunk(
  chunk: string,
): { num: number; title: string; body: string } | null {
  const lines = chunk.trim().split(/\n/);
  const head = lines[0]?.trim() ?? "";
  const hm = head.match(new RegExp(`^${CH_HEAD} (\\d+):\\s*(.*)$`, "i"));
  if (!hm) return null;
  const num = parseInt(hm[1], 10);
  if (Number.isNaN(num) || num < 1) return null;
  let title = (hm[2] ?? "").trim();
  let i = 1;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line) {
      i++;
      break;
    }
    if (line.length > 220) break;
    if (/^[|"'“‘「]/.test(line)) break;
    if (/^\[[\w\s#\-—,]+\]/i.test(line) && line.length > 90) break;
    title = title ? `${title} ${line}` : line;
    i++;
    if (title.length > 240) break;
  }
  while (i < lines.length && !lines[i]?.trim()) i++;
  const bodyText = lines.slice(i).join("\n").trim();
  return { num, title: title || `Chapter ${num}`, body: bodyText };
}

export function parseAllChapters(text: string): {
  num: number;
  title: string;
  body: string;
}[] {
  const start = findBodyStart(text);
  if (start < 0) {
    throw new Error(
      'Could not find novel body start (expected "Chapter 1:" / "Ch 1:" with Prologue or Ep. 0).',
    );
  }
  const body = text.slice(start);
  const rawChunks = body
    .split(new RegExp(`(?=^${CH_HEAD} \\d+:)`, "m"))
    .filter((s) => s.trim().length > 0);

  const byNum = new Map<number, { num: number; title: string; body: string }>();
  for (const raw of rawChunks) {
    const parsed = parseChapterChunk(raw);
    if (!parsed || parsed.body.length < 30) continue;
    const prev = byNum.get(parsed.num);
    if (!prev || parsed.body.length > prev.body.length) {
      byNum.set(parsed.num, parsed);
    }
  }

  return [...byNum.values()].sort((a, b) => a.num - b.num);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
