import { spawn } from "node:child_process";
import path from "node:path";
import type { ManhwaIncrementalRange } from "./manhwa-incremental-range";
import { defaultManhwaChapter0Url } from "./manhwa-incremental-range";

export type ManhwaIncrementalSpawnResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

/**
 * Runs the existing CLI scraper for a numeric chapter range (same cwd as Next / scripts).
 */
export function spawnManhwaIncrementalScrape(
  range: ManhwaIncrementalRange,
  cwd: string = process.cwd(),
): Promise<ManhwaIncrementalSpawnResult> {
  const url = defaultManhwaChapter0Url();
  const args = [
    "tsx",
    path.join("scripts", "scrape-manhwa-chapter.ts"),
    "--",
    "--from",
    String(range.from),
    "--to",
    String(range.to),
    "--url",
    url,
  ];

  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      stderr += err instanceof Error ? err.message : String(err);
      resolve({ exitCode: 1, stdout, stderr });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
