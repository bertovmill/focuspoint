/**
 * Generates the abstract card art for bertomill.com's homepage.
 *
 * The four story cards on the front page each sit on a full-bleed render — dark,
 * iridescent, no text and no recognisable objects, so the card's own headline
 * stays the only thing to read. Run it when the art needs regenerating:
 *
 *   node --env-file=.env.local scripts/generate-site-art.mjs [key ...]
 *
 * Images land in public/site-art/ as WebP. They're committed, not generated at
 * build time — the front page must render without an AI call in the request path.
 */
import { generateImage } from "ai";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MODEL = process.env.SITE_ART_MODEL ?? "openai/gpt-image-1";

const BASE =
  "Abstract 3D render on a pure black background. Translucent iridescent glass " +
  "forms with soft caustic light, dichroic colour fringing and long smooth " +
  "highlights. Cinematic studio lighting, extremely high detail, no text, no " +
  "letters, no logos, no people, no recognisable objects. Vertical composition, " +
  "the form occupying the centre with deep black falloff at the edges.";

const ART = [
  {
    key: "cael",
    prompt: `${BASE} Dominant colours: warm amber and burnt orange bleeding into deep violet. A single tall coiled ribbon of glass, like a spine of light.`,
  },
  {
    key: "building",
    prompt: `${BASE} Dominant colours: electric blue and cyan with a thin magenta rim. Stacked translucent planes stepping upward like a bar chart dissolving into light.`,
  },
  {
    key: "writing",
    prompt: `${BASE} Dominant colours: pale gold and warm white against near-black, with a cool teal edge. Layered sheets of glass fanned open like the pages of a book, seen edge-on.`,
  },
  {
    key: "podcast",
    prompt: `${BASE} Dominant colours: deep indigo and violet with an orange core. Concentric rings of glass rippling outward from a bright centre, like a sound wave frozen mid-air.`,
  },
];

const outDir = path.join(process.cwd(), "public", "site-art");
const only = process.argv.slice(2);
const targets = only.length ? ART.filter((a) => only.includes(a.key)) : ART;

await mkdir(outDir, { recursive: true });

for (const art of targets) {
  process.stdout.write(`${art.key} … `);
  const { image } = await generateImage({
    model: MODEL,
    prompt: art.prompt,
    size: "1024x1536",
    providerOptions: { openai: { quality: "high", output_format: "webp" } },
  });
  // The model returns ~1.5 MB per image. These are near-black renders behind a
  // dark overlay, so they survive hard compression — 1024px wide at q76 lands
  // under 80 KB with no visible loss.
  const compressed = await sharp(image.uint8Array)
    .resize({ width: 1024, withoutEnlargement: true })
    .webp({ quality: 76, effort: 6 })
    .toBuffer();

  const file = path.join(outDir, `${art.key}.webp`);
  await writeFile(file, compressed);
  console.log(
    `${(image.uint8Array.length / 1024).toFixed(0)} KB → ` +
      `${(compressed.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), file)}`,
  );
}
