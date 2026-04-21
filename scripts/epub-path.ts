import fs from "node:fs";
import path from "node:path";

function scoreName(name: string): number {
  const n = name.toLowerCase();
  // Preferred local export (see content/README)
  if (n === "final ebup.epub" || n === "final epub.epub") return -3;
  if (n === "file.epub") return -2;
  if (/omniscient|orv|sing-shong|singsyong/i.test(n)) return -1;
  return 0;
}

export function resolveEpubPath(projectRoot = process.cwd()): string | null {
  const env = process.env.ORV_EPUB_PATH?.trim();
  if (env && fs.existsSync(env)) return path.resolve(env);

  const dir = path.join(projectRoot, "content");
  if (!fs.existsSync(dir)) return null;

  const epubs = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".epub"))
    .sort((a, b) => {
      const d = scoreName(a) - scoreName(b);
      if (d !== 0) return d;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

  if (epubs.length === 0) return null;
  if (epubs.length > 1) {
    console.warn(
      `Multiple .epub in content/ — using: ${epubs[0]} (set ORV_EPUB_PATH to override).`,
    );
  }
  return path.join(dir, epubs[0]!);
}
