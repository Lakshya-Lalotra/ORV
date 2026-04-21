import fs from "node:fs";
import path from "node:path";

export const ORV_DEFAULT_PDF_NAME =
  "Omniscient Reader's Viewpoint - Sing-shong (singsyong).pdf";

/** Resolve PDF for ingest: env, canonical name, or any single .pdf in content/. */
export function resolvePdfPath(projectRoot = process.cwd()): string | null {
  const env = process.env.ORV_PDF_PATH?.trim();
  if (env && fs.existsSync(env)) return path.resolve(env);

  const contentDir = path.join(projectRoot, "content");
  const canonical = path.join(contentDir, ORV_DEFAULT_PDF_NAME);
  if (fs.existsSync(canonical)) return canonical;

  if (!fs.existsSync(contentDir)) return null;

  const pdfs = fs
    .readdirSync(contentDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (pdfs.length === 0) return null;
  if (pdfs.length > 1) {
    console.warn(
      `Multiple PDFs in content/ — using: ${pdfs[0]} (set ORV_PDF_PATH to pick another).`,
    );
  }
  return path.join(contentDir, pdfs[0]!);
}
