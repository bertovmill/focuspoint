#!/usr/bin/env node
/**
 * Finish the Resend newsletter wiring after the Marketplace resource is provisioned.
 *
 * Does three things, all idempotent:
 *   1. Finds (or creates) the Audience the signup form writes into, and prints its id.
 *   2. Reports the sending domain's verification state.
 *   3. Prints the DNS records Resend wants, as a JSON block that
 *      `scripts/cloudflare-dns.mjs` can consume — so the records get created by
 *      the same path as the rest of the zone rather than by hand.
 *
 * Usage:
 *   node --env-file=.env.local scripts/resend-setup.mjs
 */

const API = "https://api.resend.com";
const AUDIENCE_NAME = process.env.RESEND_AUDIENCE_NAME || "bertomill.com newsletter";
const DOMAIN = process.env.RESEND_DOMAIN || "bertomill.com";

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY is not set. Provision the Marketplace resource, then `vercel env pull .env.local`.");
  process.exit(1);
}

async function resend(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

// ── 1. Audience ───────────────────────────────────────────────────────────────
const audiences = await resend("/audiences");
const list = audiences.data ?? [];
let audience = list.find((a) => a.name === AUDIENCE_NAME);

if (audience) {
  console.log(`✓ Audience "${AUDIENCE_NAME}" already exists`);
} else {
  audience = await resend("/audiences", { method: "POST", body: JSON.stringify({ name: AUDIENCE_NAME }) });
  console.log(`✓ Created audience "${AUDIENCE_NAME}"`);
}
console.log(`\nRESEND_AUDIENCE_ID=${audience.id}\n`);

// ── 2 & 3. Sending domain ─────────────────────────────────────────────────────
const domains = await resend("/domains");
const domain = (domains.data ?? []).find((d) => d.name === DOMAIN);

if (!domain) {
  console.log(`No sending domain "${DOMAIN}" registered in Resend yet.`);
  console.log("Add it in the Resend dashboard (or via POST /domains), then re-run this script.");
  process.exit(0);
}

const detail = await resend(`/domains/${domain.id}`);
console.log(`Domain ${DOMAIN}: status = ${detail.status}`);

const records = (detail.records ?? []).map((r) => ({
  type: r.type,
  // Resend returns the host relative to the zone in some responses and absolute in
  // others; normalise to an absolute name so the Cloudflare script can match on it.
  name: r.name === "@" || r.name === DOMAIN ? DOMAIN : r.name.endsWith(DOMAIN) ? r.name : `${r.name}.${DOMAIN}`,
  content: r.value,
  priority: r.priority,
}));

if (records.length === 0) {
  console.log("No DNS records required (already verified).");
} else {
  console.log("\nRecords Resend requires — feed to cloudflare-dns.mjs via RESEND_DNS_JSON:\n");
  console.log(JSON.stringify(records, null, 2));
}
