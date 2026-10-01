// Creates the capabilities / portfolio_projects / project_capabilities tables on
// the live Neon DB and seeds a starting set (bertomill.com/capabilities).
// Mirrors the block in lib/db.ts ensureSchema(). Idempotent — safe to re-run;
// rows that already exist are left alone, so edits made since are kept.
//   node --env-file=.env.local scripts/portfolio-migrate.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS capabilities (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS portfolio_projects (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    year TEXT,
    live_url TEXT,
    repo_url TEXT,
    work_slug TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS project_capabilities (
    project_id INTEGER NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
    capability_id INTEGER NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    evidence TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (project_id, capability_id)
  )
`;

// The ten things a senior full-stack GenAI role screens for (from a Lead
// Full-Stack GenAI Developer description, 2026-10-01).
const CAPABILITIES = [
  ["production-ai-systems", "Production AI systems", "AI products I wrote, deployed and keep running for real users — not demos or notebooks."],
  ["workflow-to-deployment", "From messy workflow to shipped tool", "Turning an ambiguous business process into a thin working slice, testing it with the people who use it, and hardening what works."],
  ["rag-and-retrieval", "Retrieval & context engineering", "Ingestion, embeddings, hybrid search, citations, and knowing when there isn't enough evidence to answer."],
  ["agents-and-tools", "Agents, tools & MCP", "Agents with typed tools, MCP servers, and deterministic workflows where an agent isn't worth it."],
  ["human-in-the-loop", "Human-in-the-loop & guardrails", "Approvals, safe-action confirmation and escalation before an AI does anything consequential."],
  ["evals", "Evaluation & quality gates", "Eval datasets, regression suites and thresholds that decide whether a change ships."],
  ["observability", "Observability & debugging", "Traces, token and cost tracking, and root-causing failures across model, retrieval, API, data and UI."],
  ["full-stack", "Full-stack product engineering", "React/TypeScript front ends and Python/TypeScript services, built to be used daily."],
  ["deployment-and-ops", "CI/CD & production operations", "Repeatable deploys, environment config, secrets, rollback and keeping things up after launch."],
  ["enterprise-integration", "Integration & security", "Connecting AI to systems of record — email, calendars, CRMs, databases — with auth, least privilege and audit trails."],
];

for (const [i, [slug, name, summary]] of CAPABILITIES.entries()) {
  await sql`
    INSERT INTO capabilities (slug, name, summary, sort_order)
    VALUES (${slug}, ${name}, ${summary}, ${(i + 1) * 10})
    ON CONFLICT (slug) DO NOTHING
  `;
}

// Starting projects, as DRAFTS: review the wording in the Career tab (or ask
// Cael) and publish when it's right.
const PROJECTS = [
  {
    slug: "cael",
    name: "Cael",
    summary: "A personal life agent I use every day: tasks, notes, calendar, training, nutrition and writing, through a web app, phone and any MCP client.",
    year: "2026",
    live_url: "https://bertomill.com/chat",
    links: {
      "production-ai-systems": "Built solo and run in production on Vercel and Neon Postgres; I depend on it daily.",
      "agents-and-tools": "An eve agent with 60+ typed tools, all exposed through one MCP server so Claude Code, claude.ai and Codex share the same toolset.",
      "full-stack": "Next.js and TypeScript front end with a persistent shell, real-time agent chat and a writing editor with a side-by-side agent.",
      "evals": "An eval suite (evals/) that smoke-tests agent behaviour against the real toolset.",
      "observability": "A traces view of every agent run, used to debug tool calls and failed turns.",
    },
  },
  {
    slug: "venice",
    name: "Venice",
    summary: "Aucctus's internal go-to-market app: deals, people, events, campaigns and content, with an in-app agent that works on production data.",
    year: "2026",
    links: {
      "production-ai-systems": "In daily use by the Aucctus team on real pipeline data.",
      "workflow-to-deployment": "Built around how the GTM team actually works: deals, events, invites and follow-ups.",
      "human-in-the-loop": "Nothing sends on its own: the agent drafts, and a person approves each email or invite on a send page before it goes out.",
      "agents-and-tools": "An eve agent plus an MCP server exposing the same tools to outside clients, with validation and dedupe on every write.",
      "enterprise-integration": "Connected to Gmail, Google Calendar and Docs, Slack and Notion.",
    },
  },
];

for (const [i, p] of PROJECTS.entries()) {
  const inserted = await sql`
    INSERT INTO portfolio_projects (slug, name, summary, year, live_url, status, sort_order)
    VALUES (${p.slug}, ${p.name}, ${p.summary}, ${p.year}, ${p.live_url ?? null}, 'draft', ${(i + 1) * 10})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (!inserted.length) {
    console.log(`skipped ${p.slug} (already exists)`);
    continue;
  }
  for (const [capSlug, evidence] of Object.entries(p.links)) {
    await sql`
      INSERT INTO project_capabilities (project_id, capability_id, evidence)
      SELECT ${inserted[0].id}, id, ${evidence} FROM capabilities WHERE slug = ${capSlug}
      ON CONFLICT DO NOTHING
    `;
  }
  console.log(`seeded ${p.slug} (draft)`);
}

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM capabilities`;
console.log(`${n} capabilities`);
