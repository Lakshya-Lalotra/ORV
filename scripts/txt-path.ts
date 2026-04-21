import fs from "node:fs";
import path from "node:path";

function scoreName(name: string): number {
  const n = name.toLowerCase();
  /** User paste target — prefer over other .txt when present. */
  if (n === "file.txt") return -2;
  if (/orv-archive-full|archive-full/i.test(n)) return -1;
  if (/djvu|omniscient|orv|sing-shong|singsyong/i.test(n)) return 0;
  return 1;
}

/** OCR / plain-text source: ORV_TXT_PATH or first .txt in content/ (prioritises name match). */
export function resolveTxtPath(projectRoot = process.cwd()): string | null {
  const env = process.env.ORV_TXT_PATH?.trim();
  if (env && fs.existsSync(env)) return path.resolve(env);

  const contentDir = path.join(projectRoot, "content");
  if (!fs.existsSync(contentDir)) return null;

  const txts = fs
    .readdirSync(contentDir)
    .filter((f) => f.toLowerCase().endsWith(".txt"))
    .sort((a, b) => {
      const d = scoreName(a) - scoreName(b);
      if (d !== 0) return d;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

  if (txts.length === 0) return null;
  if (txts.length > 1) {
    console.warn(
      `Multiple .txt in content/ — using: ${txts[0]} (set ORV_TXT_PATH to override).`,
    );
  }
  return path.join(contentDir, txts[0]!);
}
