# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Before starting any work

Read `WORKLOG.md` in the project root first. It contains a timestamped log of everything built so far, decisions made, and next steps. Use it to get up to speed before making any changes.

## After completing any feature or change — required, no exceptions

1. **Update `WORKLOG.md`** with a timestamped entry: what was built, decisions made, files changed, and any next steps.
2. **Commit all changes to `main`** and push to origin. Do not leave work on a branch or worktree without merging.

This is non-negotiable. Every session ends with WORKLOG.md updated and main pushed.

## Commands

```bash
npm run dev        # Start Next.js + eve dev server
npm run build      # Production build
npm run typecheck  # TypeScript check (tsc --noEmit)
```

There is no test runner configured. Use `npm run typecheck` to validate TypeScript.

## Architecture

**focuspoint** is a personal life-agent app: a Next.js 16 web UI backed by an eve agent that persists data to Neon Postgres.

### eve framework

The project uses the [eve](https://eve.dev/docs) agent framework. Docs are at `node_modules/eve/docs/`. Key patterns:

- **Agent entry**: `agent/agent.ts` — defines the model via `defineAgent()`.
- **Tools**: `agent/tools/*.ts` — each file exports a `defineTool()` default. Tools use Zod schemas and execute against the DB. Add a new tool by creating a file here; eve auto-discovers it.
- **Channel**: `agent/channels/eve.ts` — configures the eve transport and auth. Uses `vercelOidc()` for production and `localDev()` / `placeholderAuth()` for local dev.
- **Instructions**: `agent/instructions.md` — the agent system prompt.

The Next.js config wraps with `withEve()` in `next.config.ts`, which registers the eve routes alongside the Next.js app.

### Web UI

- `app/page.tsx` — responsive layout: `<Dashboard>` (sidebar on desktop; full-screen panel on mobile via bottom nav) + `<AgentChat>` (main panel). Client component — manages `mobileTab` state and renders the bottom nav bar on mobile.
- `app/_components/agent-chat.tsx` — connects to the agent via `useEveAgent()` (eve's React hook).
- `app/_components/dashboard.tsx` — fetches from the REST API routes to show todos/thoughts.
- `app/api/thoughts/route.ts`, `app/api/todos/route.ts` — Next.js route handlers that read from Neon Postgres directly (bypassing the agent).
- `components/ai-elements/` — reusable streaming UI primitives (messages, tool calls, reasoning, etc.).
- `components/ui/` — shadcn/ui base components.

### Database

`lib/db.ts` exports `getDb()` (Neon serverless client) and `ensureSchema()` which creates two tables:

- `thoughts(id, content, tags[], created_at)`
- `todos(id, title, completed, priority, due_date, created_at, completed_at)`

Requires `DATABASE_URL` env var. On first run, call `ensureSchema()` or run the SQL manually.

### Env vars

- `DATABASE_URL` — Neon Postgres connection string (required for agent tools and API routes).
- Eve-specific vars are pulled via `vercel env pull` or set in `.env.local`.
