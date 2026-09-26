// Renders public/apple-icon.png from public/icon.svg.
//
// iOS applies its own superellipse mask to apple-touch-icon, so the source is
// re-rendered full-bleed: square corners (no rx), and the orb scaled up so it
// fills the tile the way a native app icon does. Run: node scripts/render-apple-icon.mjs
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");

// Square the tile and enlarge the artwork ~18% around the centre. The halo
// still fades out before the edge, so nothing gets clipped by the iOS mask.
const fullBleed = svg
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/rx="108"/, 'rx="0"')
  .replace(
    /<circle cx="256" cy="256" r="204" fill="url\(#halo\)"\/>/,
    '<g transform="translate(256 256) scale(1.18) translate(-256 -256)">\n  <circle cx="256" cy="256" r="204" fill="url(#halo)"/>',
  )
  .replace(/<\/svg>\s*$/, "  </g>\n</svg>\n");

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
