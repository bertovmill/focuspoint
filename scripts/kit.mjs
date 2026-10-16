#!/usr/bin/env node
/**
 * Kit from the terminal. Kit has no official CLI, and its MCP server only runs
 * tools on paid plans, so this covers the day-to-day with the v4 API key the
 * site already uses (KIT_API_KEY in .env.local).
 *
 * Usage:
 *   npm run kit -- stats                       counts, plus recent signups and where they came from
 *   npm run kit -- forms                       forms and their ids (KIT_FORM_ID is one of these)
 *   npm run kit -- subscribers [--all]         confirmed subscribers, newest first
 *   npm run kit -- broadcasts                  drafts, scheduled and sent
 *   npm run kit -- tags                        tags and their ids
 *   npm run kit -- tag <name> <email...>       create the tag if needed and apply it
 *   npm run kit -- import <file.csv> [--tag <name>] [--dry-run]
 *                                              add people from a CSV with an email column
 *                                              (Substack's export works as-is)
 *
 * Read-only except `tag` and `import`. Nothing here can send an email: sending
 * a broadcast stays a button in Kit.
 */

import { readFileSync } from "node:fs";

const API = "https://api.kit.com/v4";
const key = process.env.KIT_API_KEY;

// ── HTTP ────────────────────────────────────────────────────────────────────

// API keys get 120 requests per rolling minute; pacing at ~1.8/s stays under it
// with room for the live site's signups.
const MIN_GAP_MS = 550;
let lastCall = 0;

async function pace() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function kit(path, { method = "GET", body } = {}) {
  await pace();

  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "X-Kit-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 10_000));
    return kit(path, { method, body });
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const why = json.errors?.join("; ") || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${why}`);
  }
  return json;
}

/** Every item from a cursor-paginated list endpoint. */
async function all(path, field, params = {}) {
  const out = [];
  let after = null;
  for (;;) {
    const qs = new URLSearchParams({ per_page: "1000", ...params });
    if (after) qs.set("after", after);
    const page = await kit(`${path}?${qs}`);
    out.push(...(page[field] ?? []));
    if (!page.pagination?.has_next_page) return out;
    after = page.pagination.end_cursor;
  }
}

// ── Output ──────────────────────────────────────────────────────────────────

const day = (iso) => (iso ? String(iso).slice(0, 10) : "—");

function table(rows, columns) {
  if (rows.length === 0) return console.log("  (none)");
  const widths = columns.map(([label, get]) => Math.max(label.length, ...rows.map((r) => String(get(r) ?? "").length)));
  const line = (cells) => "  " + cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ").trimEnd();
  console.log(line(columns.map(([label]) => label)));
  console.log(line(widths.map((w) => "─".repeat(w))));
  for (const r of rows) console.log(line(columns.map(([, get]) => get(r))));
}

// ── Commands ────────────────────────────────────────────────────────────────

async function stats() {
  const subs = await all("/subscribers", "subscribers", { status: "all" });
  const count = (state) => subs.filter((s) => s.state === state).length;
  console.log(`\nSubscribers`);
  console.log(`  confirmed      ${count("active")}`);
  console.log(`  unconfirmed    ${count("inactive")}   (signed up, haven't clicked the confirm link)`);
  console.log(`  unsubscribed   ${count("cancelled")}`);
  const bad = count("bounced") + count("complained");
  if (bad) console.log(`  bounced/spam   ${bad}`);

  const weekAgo = Date.now() - 7 * 864e5;
  const recent = subs.filter((s) => s.state === "active" && Date.parse(s.created_at) > weekAgo).length;
  console.log(`  new this week  ${recent}`);

  const formId = process.env.KIT_FORM_ID;
  if (!formId) return;
  // The site sends which surface a signup came from as the form referrer,
  // e.g. https://bertomill.com/#footer.
  const joined = await all(`/forms/${formId}/subscribers`, "subscribers", { status: "all" });
  const bySource = new Map();
  for (const s of joined) {
    const source = (s.referrer ?? "").split("#")[1] || "unknown";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }
  console.log(`\nSignups by source (form ${formId})`);
  table([...bySource].sort((a, b) => b[1] - a[1]), [["source", (r) => r[0]], ["signups", (r) => r[1]]]);

  console.log(`\nLatest 10`);
  const latest = [...joined].sort((a, b) => String(b.added_at).localeCompare(String(a.added_at))).slice(0, 10);
  table(latest, [
    ["added", (s) => day(s.added_at)],
    ["email", (s) => s.email_address],
    ["state", (s) => s.state],
    ["source", (s) => (s.referrer ?? "").split("#")[1] || ""],
  ]);
}

async function forms() {
  const list = await all("/forms", "forms", { status: "all" });
  const current = process.env.KIT_FORM_ID;
  table(list, [
    ["id", (f) => f.id],
    ["name", (f) => f.name + (String(f.id) === current ? "  ← KIT_FORM_ID" : "")],
    ["type", (f) => f.type],
    ["archived", (f) => (f.archived ? "yes" : "")],
    ["created", (f) => day(f.created_at)],
  ]);
}

async function subscribers(args) {
  const status = args.includes("--all") ? "all" : "active";
  const list = (await all("/subscribers", "subscribers", { status })).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  table(list, [
    ["joined", (s) => day(s.created_at)],
    ["email", (s) => s.email_address],
    ["name", (s) => s.first_name ?? ""],
    ["state", (s) => s.state],
  ]);
  console.log(`\n  ${list.length} ${status === "active" ? "confirmed" : "total"}`);
}

async function broadcasts() {
  const list = (await all("/broadcasts", "broadcasts")).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  const status = (b) => (!b.send_at ? "draft" : Date.parse(b.send_at) > Date.now() ? `scheduled ${day(b.send_at)}` : `sent ${day(b.send_at)}`);
  table(list, [
    ["id", (b) => b.id],
    ["status", status],
    ["subject", (b) => b.subject],
    ["created", (b) => day(b.created_at)],
  ]);
  if (list.length) console.log(`\n  Review and send at https://app.kit.com/campaigns`);
}

async function findOrCreateTag(name) {
  const tags = await all("/tags", "tags");
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const { tag } = await kit("/tags", { method: "POST", body: { name } });
  console.log(`  created tag "${tag.name}" (${tag.id})`);
  return tag;
}

async function tags() {
  const list = await all("/tags", "tags");
  table(list, [["id", (t) => t.id], ["name", (t) => t.name], ["created", (t) => day(t.created_at)]]);
}

async function tag([name, ...emails]) {
  if (!name || emails.length === 0) usage("tag needs a tag name and at least one email");
  const t = await findOrCreateTag(name);
  for (const email of emails) {
    try {
      await kit(`/tags/${t.id}/subscribers`, { method: "POST", body: { email_address: email } });
      console.log(`  ✓ ${email}`);
    } catch (err) {
      console.log(`  ✗ ${email}: ${err.message}`);
    }
  }
}

/** Minimal CSV: quoted fields, commas and newlines inside quotes, "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

async function importCsv(args) {
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--tag");
  if (!file) usage("import needs a CSV file");
  const dryRun = args.includes("--dry-run");
  const tagName = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : null;

  const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
  const col = (re) => header.findIndex((h) => re.test(h.trim()));
  const emailCol = col(/^e-?mail( address)?$/i);
  if (emailCol < 0) throw new Error(`No email column in ${file}. Columns: ${header.join(", ")}`);
  const nameCol = col(/^(first[ _]?name|name)$/i);
  // Substack marks people who turned email off; they shouldn't come across as active.
  const disabledCol = col(/^email_disabled$/i);

  const seen = new Set();
  const people = [];
  let skipped = 0;
  for (const r of rows) {
    const email = (r[emailCol] ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || seen.has(email)) continue;
    if (disabledCol >= 0 && /^(true|yes|1)$/i.test((r[disabledCol] ?? "").trim())) {
      skipped++;
      continue;
    }
    seen.add(email);
    people.push({ email, firstName: nameCol >= 0 ? (r[nameCol] ?? "").trim().split(/\s+/)[0] || null : null });
  }

  console.log(`\n${people.length} to import from ${file}${skipped ? ` (${skipped} skipped: email turned off in Substack)` : ""}`);
  if (dryRun) {
    people.slice(0, 10).forEach((p) => console.log(`  ${p.email}${p.firstName ? `  (${p.firstName})` : ""}`));
    if (people.length > 10) console.log(`  … and ${people.length - 10} more`);
    return console.log(`\nDry run: nothing was sent to Kit.`);
  }

  const t = tagName ? await findOrCreateTag(tagName) : null;
  let created = 0;
  let existing = 0;
  let failed = 0;
  for (const [i, p] of people.entries()) {
    try {
      // Already opted in on Substack, so they come across active: no second
      // confirmation email. Creating is an upsert; someone already in Kit keeps
      // their state (including unsubscribed).
      await pace();
      const res = await fetch(`${API}/subscribers`, {
        method: "POST",
        headers: { "X-Kit-Api-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ email_address: p.email, first_name: p.firstName, state: "active" }),
      });
      if (res.status === 201) created++;
      else if (res.status === 200) existing++;
      else throw new Error(`${res.status} ${await res.text()}`);
      if (t) await kit(`/tags/${t.id}/subscribers`, { method: "POST", body: { email_address: p.email } });
    } catch (err) {
      failed++;
      console.log(`  ✗ ${p.email}: ${err.message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${people.length}`);
  }
  console.log(`\nDone: ${created} added, ${existing} already in Kit, ${failed} failed${t ? `, all tagged "${t.name}"` : ""}.`);
}

// ── Entry ───────────────────────────────────────────────────────────────────

function usage(problem) {
  if (problem) console.error(`\n${problem}\n`);
  console.error(readFileSync(new URL(import.meta.url), "utf8").match(/\* Usage:\n([\s\S]*?)\n \*\n/)[1].replace(/^ \*/gm, ""));
  process.exit(1);
}

const commands = { stats, forms, subscribers, broadcasts, tags, tag, import: importCsv };
const [command, ...args] = process.argv.slice(2);

if (!command || !commands[command]) usage(command ? `Unknown command: ${command}` : null);
if (!key) {
  console.error("KIT_API_KEY isn't set. Add it to .env.local (Kit → Settings → Developer → API keys, v4).");
  process.exit(1);
}

commands[command](args).catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
