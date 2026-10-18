/**
 * Generates the homepage desk scene for bertomill.com: the desk with the money
 * tree that stands in front of the concrete wall, and the view of Toronto out
 * of the window cut into it, in four skies (day, golden hour, night, overcast)
 * that the wall shader cross-fades by the real Toronto sky.
 *
 *   node --env-file=.env.local scripts/generate-desk-art.mjs [key ...] [--out dir]
 *
 * Needs AI Gateway credentials (a fresh VERCEL_OIDC_TOKEN from `vercel env pull`).
 * The three non-day skylines are edits of the day image so the buildings stay
 * put while the light changes; if the gateway refuses edits they fall back to
 * fresh generations from the same description.
 *
 * Images land in public/site-art/ as WebP (the desk keeps its alpha). They are
 * committed, not generated at build time.
 */
import { generateImage } from "ai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MODEL = process.env.SITE_ART_MODEL ?? "openai/gpt-image-1";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join("public", "site-art"));
const only = args.filter((a, i) => !a.startsWith("--") && i !== outIndex + 1);

const DESK_PROMPT =
  "Photorealistic studio product photograph, isolated on a fully transparent background, of a " +
  "premium designer writing desk with a money tree houseplant standing on it, seen straight on " +
  "at standing eye height and slightly from above so the whole desktop and the legs down to the " +
  "feet are visible. The desk: a thick solid white-oak slab top with a soft matte finish and " +
  "visible cathedral grain, about 170 cm wide, on a sculptural solid-oak trestle base. On the left " +
  "a small brass dome desk lamp with a warm bulb, and in the middle a closed tan leather notebook " +
  "with a brass fountain pen on it. Near the right end a lush, healthy money tree (Pachira " +
  "aquatica) about 70 cm tall with a braided trunk and glossy palmate leaves, in a matte off-white " +
  "ceramic pot. Nothing else on the desk. Soft window daylight from the upper left, realistic " +
  "contact shadows on the desk surface only. No floor, no wall, no background, no reflection " +
  "below the feet, no text, no watermark.";

const CITY_PROMPT =
  "Photorealistic view of downtown Toronto seen from a high window in a nearby building " +
  "on a clear afternoon: the CN Tower standing tall just left of centre with the white dome " +
  "of the Rogers Centre at its base, dense glass office and condo towers of the financial " +
  "district to the right, a thin strip of Lake Ontario visible at the bottom, blue sky with " +
  "a few thin high clouds above. Natural daylight, true-to-life colours, slight atmospheric " +
  "haze on the far buildings, shot on a 35 mm lens at eye level. No window frame, no glass " +
  "reflections, no people, no text, no watermark; the scene fills the entire frame edge to edge.";

/** The skies, as edits of the day image. `fresh` is the stand-alone fallback. */
const SKIES = [
  {
    key: "toronto-golden",
    edit:
      "Keep this exact photograph, same composition and buildings, but change the time to " +
      "sunset golden hour: warm amber and orange sunlight raking across the towers from the " +
      "left, long soft shadows, the sky a gradient from deep gold at the horizon to soft " +
      "violet above, a few windows beginning to light up.",
    fresh: CITY_PROMPT.replace("on a clear afternoon", "at sunset golden hour, warm amber light on the towers, gold to violet sky"),
  },
  {
    key: "toronto-night",
    edit:
      "Keep this exact photograph, same composition and buildings, but make it deep night: " +
      "a dark navy sky, the CN Tower illuminated with its white and coloured LED lighting, " +
      "thousands of warm lit windows in the towers, red aircraft warning lights on the " +
      "rooftops, the glow of the streets below, lights reflecting faintly on the lake.",
    fresh: CITY_PROMPT.replace("on a clear afternoon", "at night, dark navy sky, the CN Tower lit up, thousands of warm lit windows"),
  },
  {
    key: "toronto-overcast",
    edit:
      "Keep this exact photograph, same composition and buildings, but make it a grey " +
      "overcast day: a flat uniform pale-grey cloud ceiling, soft shadowless light, muted " +
      "desaturated colours, light mist softening the farthest towers.",
    fresh: CITY_PROMPT.replace("on a clear afternoon", "on a flat grey overcast day, soft shadowless light, muted colours"),
  },
];

/**
 * The mason jar on the sill, upright and tipped. Fresh generations, not edits:
 * edits of the jar came back on an opaque backdrop. (Image viewers may show a
 * coloured backdrop behind these PNGs; the alpha channel is real.)
 */
const JARS = [
  {
    key: "jar-upright",
    prompt:
      "Photorealistic product photograph of a small clear glass mason jar, about 10 cm tall, with no " +
      "lid and no label, two-thirds full of clean still water, isolated on a fully transparent " +
      "background. Seen straight on at eye level. Soft daylight from the upper left with realistic " +
      "glass highlights, refraction through the water, and a soft contact shadow only directly " +
      "beneath the jar. Nothing else, no text.",
  },
  {
    key: "jar-pouring",
    prompt:
      "Photorealistic product photograph of a small clear glass mason jar, about 10 cm tall, no lid, " +
      "no label, isolated on a fully transparent background, tipped about 45 degrees to the right as " +
      "if someone is pouring from it: the water inside stays level with the ground, and a few drops " +
      "are just beginning to spill over the rim on the right side. No hand, no stream below the rim, " +
      "nothing else. Seen at eye level, soft daylight from the upper left with realistic glass " +
      "highlights and refraction. No text.",
  },
];

await mkdir(outDir, { recursive: true });
const wanted = (key) => only.length === 0 || only.includes(key);

async function save(key, png, { alpha = false, quality = 82 } = {}) {
  // The desk is trimmed to its pixels so the page can place it by its edges.
  // The skies lose the sliver of window frame the model paints around the
  // edges, then go to the exact size the wall's texture is allocated at.
  const image = alpha
    ? sharp(png).trim({ threshold: 10 })
    : sharp(png).extract({ left: 56, top: 20, width: 1440, height: 948 }).resize(1200, 800, { fit: "cover" });
  const compressed = await image.webp({ quality, effort: 6, alphaQuality: alpha ? 95 : undefined }).toBuffer();
  const file = path.join(outDir, `${key}.webp`);
  await writeFile(file, compressed);
  console.log(`${(png.length / 1024).toFixed(0)} KB → ${(compressed.length / 1024).toFixed(0)} KB → ${file}`);
}

async function generate(prompt, openai) {
  const { image } = await generateImage({
    model: MODEL,
    prompt,
    size: "1536x1024",
    providerOptions: { openai: { quality: "high", output_format: "png", ...openai } },
  });
  return Buffer.from(image.uint8Array);
}

if (wanted("desk-oak-money-tree")) {
  process.stdout.write("desk-oak-money-tree … ");
  const png = await generate(DESK_PROMPT, { background: "transparent" });
  await save("desk-oak-money-tree", png, { alpha: true, quality: 90 });
}

let day = null;
if (wanted("toronto-day")) {
  process.stdout.write("toronto-day … ");
  day = await generate(CITY_PROMPT);
  await save("toronto-day", day);
}

for (const sky of SKIES) {
  if (!wanted(sky.key)) continue;
  process.stdout.write(`${sky.key} … `);
  let png;
  try {
    // Edits need the day image; reuse the one just made, or the one on disk.
    const base = day ?? (await sharp(await readFile(path.join(outDir, "toronto-day.webp"))).png().toBuffer());
    const { image } = await generateImage({
      model: MODEL,
      prompt: { images: [base], text: sky.edit },
      size: "1536x1024",
      providerOptions: { openai: { quality: "high", output_format: "png" } },
    });
    png = Buffer.from(image.uint8Array);
  } catch (error) {
    console.warn(`\n  edit failed (${error?.message ?? error}); generating ${sky.key} fresh`);
    png = await generate(sky.fresh);
  }
  await save(sky.key, png);
}

for (const jar of JARS) {
  if (!wanted(jar.key)) continue;
  process.stdout.write(`${jar.key} … `);
  const { image } = await generateImage({
    model: MODEL,
    prompt: jar.prompt,
    size: "1024x1024",
    providerOptions: { openai: { quality: "high", output_format: "png", background: "transparent" } },
  });
  // Small on the page, so 480px tall is plenty. Remeasure JAR_ART (aspect, mouth) after.
  const compressed = await sharp(Buffer.from(image.uint8Array))
    .trim({ threshold: 8 })
    .resize({ height: 480, withoutEnlargement: true })
    .webp({ quality: 88, effort: 6, alphaQuality: 95 })
    .toBuffer();
  const file = path.join(outDir, `${jar.key}.webp`);
  await writeFile(file, compressed);
  console.log(`${(image.uint8Array.length / 1024).toFixed(0)} KB → ${(compressed.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), file)}`);
}
