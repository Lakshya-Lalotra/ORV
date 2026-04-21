/**
 * Downloads the ORV webtoon key visual (1000px wide) into public/branding.
 */
import fs from "node:fs";
import path from "node:path";

const URL =
  "https://static.wikia.nocookie.net/omniscient-readers-viewpoint/images/4/4e/ORV_Webtoon_Key_Visual_2.jpg/revision/latest/scale-to-width-down/1000?cb=20260216174334";

const OUT = path.join(__dirname, "..", "public", "branding", "orv-webtoon-key-visual.jpg");

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));
  console.log("Wrote", OUT, `(${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
