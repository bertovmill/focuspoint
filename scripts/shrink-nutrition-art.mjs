/**
 * Re-encodes already-generated Nutrition art down to a sane size.
 *
 *   node --env-file=.env.local scripts/shrink-nutrition-art.mjs
 *
 * The first batch was written before lib/nutrition-art.ts resized on upload:
 * 1024px PNGs of ~1.5 MB each, which made Next's image optimizer time out
 * fetching a page's worth. This downloads each one, re-encodes it to webp, and
 * points the row at the new blob — no model calls, so it's cheap and repeatable.
 * Anything already stored as .webp is left alone.
 */
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import sharp from "sharp";

const sql = neon(process.env.DATABASE_URL);

async function shrink(url, key, width) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const src = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(src).resize(width, undefined, { withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const blob = await put(`${key}.webp`, webp, { access: "public", contentType: "image/webp", allowOverwrite: true });
  return { url: blob.url, before: src.length, after: webp.length };
}

const jobs = [
  ...(await sql`SELECT id, name, image_url FROM nutrition_staples WHERE image_url IS NOT NULL`).map((r) => ({
    label: `staple ${r.name}`,
    url: r.image_url,
    key: `nutrition/staples/${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    width: 512,
    save: (url) => sql`UPDATE nutrition_staples SET image_url = ${url} WHERE id = ${r.id}`,
  })),
  ...(await sql`SELECT rule_key, image_url FROM nutrition_rule_art`).map((r) => ({
    label: `rule ${r.rule_key}`,
    url: r.image_url,
    key: `nutrition/rules/${r.rule_key}`,
    width: 512,
    save: (url) => sql`UPDATE nutrition_rule_art SET image_url = ${url}, updated_at = NOW() WHERE rule_key = ${r.rule_key}`,
  })),
  ...(await sql`SELECT id, slot, meal_date, image_url FROM meal_recommendations WHERE image_url IS NOT NULL`).map((r) => ({
    label: `meal ${String(r.meal_date).slice(0, 10)} ${r.slot}`,
    url: r.image_url,
    key: `nutrition/meals/${r.slot}-${r.id}`,
    width: 1024,
    save: (url) => sql`UPDATE meal_recommendations SET image_url = ${url} WHERE id = ${r.id}`,
  })),
];

let saved = 0;
for (const job of jobs) {
  if (job.url.endsWith(".webp")) {
    console.log(`${job.label} … already webp`);
    continue;
  }
  process.stdout.write(`${job.label} … `);
  try {
    const { url, before, after } = await shrink(job.url, job.key, job.width);
    await job.save(url);
    saved += before - after;
    console.log(`${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
  } catch (err) {
    console.log(`FAILED — ${err.message}`);
  }
}
console.log(`saved ${(saved / 1024 / 1024).toFixed(1)} MB`);
