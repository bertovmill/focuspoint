// Renders public/apple-icon.png from public/icon.svg.
//
// iOS applies its own superellipse mask to apple-touch-icon, so the source is
// re-rendered full-bleed with square corners. Run: node scripts/render-apple-icon.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");

const fullBleed = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/rx="108"/, 'rx="0"');

const out = new URL("../public/apple-icon.png", import.meta.url);
await writeFile(
  out,
  await sharp(Buffer.from(fullBleed), { density: 300 })
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
const meta = await sharp(out.pathname).metadata();
console.log(`wrote public/apple-icon.png ${meta.width}x${meta.height}`);
