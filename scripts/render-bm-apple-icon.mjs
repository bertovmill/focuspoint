// Renders public/bm-apple-icon.png, the home-screen icon for bertomill.com.
//
// iOS applies its own superellipse mask to apple-touch-icon, so the circular
// public/bm-icon.svg is re-rendered full-bleed: the disc becomes a square tile
// with the same gradient and the monogram stays centred. Run:
//   node scripts/render-bm-apple-icon.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/bm-icon.svg", import.meta.url), "utf8");

const fullBleed = svg
  .replace(/<!--[\s\S]*?-->/g, "")
  // Disc -> square tile; the rim is meaningless once iOS masks the corners.
  .replace(/<circle cx="256" cy="256" r="248" fill="url\(#disc\)"\/>/, '<rect width="512" height="512" fill="url(#disc)"/>')
  .replace(/<circle cx="256" cy="256" r="244"[^>]*\/>/, "");

const out = new URL("../public/bm-apple-icon.png", import.meta.url);
await writeFile(
  out,
  await sharp(Buffer.from(fullBleed), { density: 300 })
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
const meta = await sharp(out.pathname).metadata();
console.log(`wrote public/bm-apple-icon.png ${meta.width}x${meta.height}`);
