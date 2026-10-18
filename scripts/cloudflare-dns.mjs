#!/usr/bin/env node
/**
 * Point bertomill.com at Vercel, via the Cloudflare API.
 *
 * Idempotent: every record is an upsert keyed on (type, name), so re-running
 * after a partial failure converges rather than piling up duplicates.
 *
 * Records are created **unproxied** (grey cloud) on purpose. Vercel terminates
 * TLS itself; putting Cloudflare's proxy in front means Vercel's certificate
 * challenge has to pass through it, and it buffers streaming responses — which
 * the public /chat endpoint depends on.
 *
 * Usage:
 *   node --env-file=.env.local scripts/cloudflare-dns.mjs [--apply]
 *
 * Without --apply it prints the plan and changes nothing.
 */

const ZONE = "bertomill.com";
const API = "https://api.cloudflare.com/client/v4";
const APPLY = process.argv.includes("--apply");

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("CLOUDFLARE_API_TOKEN is not set. Add it to .env.local and pass --env-file=.env.local");
  process.exit(1);
}

/**
 * The records Vercel asked for, verbatim from `vercel domains inspect`: an A
 * record at its anycast address for all three names, subdomains included. A
 * CNAME to cname.vercel-dns.com would also resolve, but following Vercel's own
 * recommendation keeps the three names uniform and sidesteps CNAME flattening.
 */
const APEX_IP = process.env.VERCEL_APEX_IP || "76.76.21.21";

const DESIRED = [
  { type: "A", name: ZONE, content: APEX_IP, comment: "Vercel cael-agent — public site" },
  { type: "A", name: `www.${ZONE}`, content: APEX_IP, comment: "Vercel cael-agent — redirects to apex" },
  { type: "A", name: `cael.${ZONE}`, content: APEX_IP, comment: "Vercel cael-agent — private Cael app" },
];

/**
 * Mail records (SPF/DKIM/MX) for the Resend sending domain, passed in as JSON by
 * `scripts/resend-setup.mjs` rather than hardcoded — the DKIM key is generated per
 * domain, so it can't be known ahead of time. Routing them through this script
 * keeps every record in the zone created by one reviewed, idempotent path.
 */
if (process.env.RESEND_DNS_JSON) {
  for (const r of JSON.parse(process.env.RESEND_DNS_JSON)) {
    DESIRED.push({
      type: r.type,
      name: r.name,
      content: r.content,
      ...(r.priority != null ? { priority: r.priority } : {}),
      comment: "Resend — newsletter sending",
    });
  }
}

/**
 * Clerk's production instance records, passed in as JSON the same way — the mail
 * and DKIM hosts carry a per-instance id, so they can't be hardcoded either.
 * Get them straight from the CLI:
 *
 *   CLERK_DNS_JSON=$(clerk deploy status | jq -c .pendingDnsRecords) \
 *     node --env-file=.env.local scripts/cloudflare-dns.mjs --apply
 *
 * These must stay **unproxied** like everything else here: Clerk terminates TLS
 * on its own edge, and its certificate challenge can't pass through the orange
 * cloud. Clerk names its fields host/value rather than name/content.
 */
if (process.env.CLERK_DNS_JSON) {
  for (const r of JSON.parse(process.env.CLERK_DNS_JSON)) {
    DESIRED.push({
      type: r.type,
      name: r.host ?? r.name,
      content: r.value ?? r.content,
      comment: "Clerk — production instance",
    });
  }
}

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    const detail = (body.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ") || res.statusText;
    throw new Error(`${init.method ?? "GET"} ${path} → ${detail}`);
  }
  return body.result;
}

// Confirm the token works before touching anything, so a bad token fails loudly
// here rather than halfway through the record list.
await cf("/user/tokens/verify");
console.log("✓ Cloudflare token valid");

const zones = await cf(`/zones?name=${ZONE}`);
if (zones.length === 0) throw new Error(`Zone ${ZONE} not found — is the token scoped to it?`);
const zoneId = zones[0].id;
console.log(`✓ Zone ${ZONE} (${zoneId}), status: ${zones[0].status}`);

const existing = await cf(`/zones/${zoneId}/dns_records?per_page=100`);

for (const want of DESIRED) {
  const current = existing.find((r) => r.type === want.type && r.name === want.name);
  // `proxied` is only meaningful for record types the CDN can sit in front of;
  // sending it on a TXT or MX is rejected.
  const proxiable = ["A", "AAAA", "CNAME"].includes(want.type);
  const payload = { ...want, ttl: 1, ...(proxiable ? { proxied: false } : {}) };

  if (!current) {
    console.log(`${APPLY ? "creating" : "would create"}  ${want.type.padEnd(5)} ${want.name} → ${want.content}`);
    if (APPLY) await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(payload) });
    continue;
  }

  if (current.content === want.content && (!proxiable || current.proxied === false)) {
    console.log(`unchanged      ${want.type.padEnd(5)} ${want.name} → ${want.content}`);
    continue;
  }

  console.log(
    `${APPLY ? "updating" : "would update"}  ${want.type.padEnd(5)} ${want.name}: ` +
      `${current.content}${current.proxied ? " (proxied)" : ""} → ${want.content}`,
  );
  if (APPLY) {
    await cf(`/zones/${zoneId}/dns_records/${current.id}`, { method: "PUT", body: JSON.stringify(payload) });
  }
}

console.log(APPLY ? "\nDone. DNS propagation is usually seconds on Cloudflare." : "\nDry run — re-run with --apply to make these changes.");
