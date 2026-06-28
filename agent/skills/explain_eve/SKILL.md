---
description: Use when the user asks what eve is, what eve agents can do, how eve works, or how this app is built. Loads a primer on the eve agent framework so you can explain its capabilities clearly.
---

# Explaining the eve framework

Use this when someone asks "what is eve?", "what can eve do?", "how does this
agent work?", or anything about the framework powering this app. Explain in
plain language — connect it to how *you* (Cael) are built where it helps.

## What eve is

eve is an open-source framework from Vercel for building **durable AI agents as
ordinary files in a TypeScript project** — think "Next.js for agents." Instead
of one giant config object, each part of an agent gets its own home on the
filesystem, and eve discovers that structure automatically.

Repo: https://github.com/vercel/eve · Docs: https://eve.dev/docs

## What eve agents can do

- **Run anywhere from one codebase.** The same agent serves a web chat UI, a
  terminal, Slack, Discord, SMS (Twilio), and HTTP APIs. Your logic doesn't
  need to know where a message came from.
- **Call typed tools.** Tools are typed functions (Zod-validated input) the
  model can invoke to take real action — query a database, hit an API, send a
  message. (That's how I capture your thoughts, manage todos, and read notes.)
- **Load skills on demand.** Longer procedures live as markdown and get pulled
  into context only when a task calls for them — progressive disclosure, so the
  agent stays focused. (This explanation is itself an eve skill.)
- **Spawn subagents.** Delegate focused subtasks to child agents with their own
  tools and skills.
- **Run on a schedule.** Cron-style schedules let the agent act proactively —
  e.g. my morning digest that texts you a daily focus summary.
- **Stay durable across turns.** A session can stream progress, pause for human
  approval or input, resume after an answer arrives, and survive crashes — built
  on the open-source Workflow SDK.
- **Connect to external services.** Pull in tools from MCP and OpenAPI servers,
  and authenticate per user, tenant, or channel.

## How the pieces fit (the project layout)

| File / folder | Role |
|---|---|
| `agent/agent.ts` | Picks the model, configures runtime options |
| `agent/instructions.md` | The system prompt — who the agent is, how it behaves |
| `agent/tools/*.ts` | Typed functions the model can call (auto-discovered) |
| `agent/skills/*` | Procedures loaded only when useful (like this one) |
| `agent/schedules/*.ts` | Cron jobs for proactive, scheduled actions |
| `agent/channels/*.ts` | Connections to web, Slack, SMS, and other surfaces |

**The files are the interface:** a file's location says what it does, and its
path gives it a name — no separate registry to keep in sync. Add a file and eve
discovers it.

## How to answer

Keep it conversational and concrete. Lead with the one-line "Next.js for agents"
framing, then highlight the 2–3 capabilities most relevant to what was asked.
Offer the GitHub link if they want to go deeper. Don't dump this whole table
unless they ask how the app is structured.
