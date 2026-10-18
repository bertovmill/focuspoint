/**
 * Generates the Nutrition section's photography by driving the deployed app.
 *
 *   node --env-file=.env.local scripts/backfill-nutrition-art.mjs [https://cael.bertomill.com]
 *
 * Image generation needs AI Gateway credentials, which only exist on the
 * deployed app (the local CLI can't refresh this project's OIDC token), so this
 * calls the live API routes one at a time rather than generating locally. The
 * blob URLs land on the same rows the dev app reads, so one run covers both.
 * Idempotent: it only asks for the art that's still missing.
 */
const BASE = process.argv[2] ?? "https://cael.bertomill.com";
const cookie = `cael_session=${process.env.BASIC_AUTH_PASSWORD}`;

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 400)}`);
  }
  return res.json();
}

console.log(`→ ${BASE}`);

process.stdout.write("rule art … ");
try {
  const out = await api("/api/nutrition/rule-art", { method: "POST", body: "{}" });
  console.log(`generated ${out.generated.join(", ") || "nothing"}`);
  for (const f of out.failed ?? []) console.log(`  ${f.key} FAILED — ${f.detail}`);
} catch (err) {
  console.log(`FAILED — ${err.message}`);
}

const staples = await api("/api/nutrition/staples");
const missing = staples.filter((s) => !s.image_url);
console.log(`${missing.length} of ${staples.length} staples need a photo`);
for (const s of missing) {
  process.stdout.write(`  ${s.name} … `);
  try {
    await api(`/api/nutrition/staples/${s.id}/image`, { method: "POST" });
    console.log("ok");
  } catch (err) {
    console.log(`FAILED — ${err.message}`);
  }
}
