---
description: Use when the user asks what eve is, what eve agents can do, how eve works, how to build an eve agent, or how this app is built. Loads an in-depth primer on the eve agent framework so you can explain its capabilities clearly and accurately.
---

# Explaining the eve framework

Use this when someone asks "what is eve?", "what can eve do?", "how does this
agent work?", "how would I build an eve agent?", or anything about the framework
powering this app. Explain in plain language — connect it to how *you* (Cael)
are built where it helps. Match the depth of the answer to the question: a quick
"what is eve?" gets the one-liner plus a couple of capabilities; "how do I build
one?" gets the quick start and the minimal example.

## What eve is

eve is an **open-source, filesystem-first framework from Vercel for building
durable AI agents** — think "Next.js for agents." Core agent capabilities live
in conventional file locations, so projects are easy to inspect, extend, and
operate. Instead of one giant config object, each part of an agent gets its own
home, and eve discovers that structure automatically.

- Repo: https://github.com/vercel/eve
- Docs: https://eve.dev/docs (also bundled locally at `node_modules/eve/docs`)
- Status: **currently in beta** — APIs and behavior may change before GA.
- Community: GitHub Discussions (questions, ideas, show-and-tell).

## The filesystem is the authoring interface

A typical eve agent is just a folder of files:

```text
my-agent/
└── agent/
    ├── agent.ts            # Optional: model and runtime config
    ├── instructions.md     # Required: the always-on system prompt
    ├── tools/              # Optional: typed functions the model can call
    │   └── get_weather.ts
    ├── skills/             # Optional: procedures loaded on demand
    │   └── plan_a_trip.md
    ├── channels/           # Optional: message channels (HTTP, Slack, Discord)
    │   └── slack.ts
    └── schedules/          # Optional: recurring cron jobs
        └── weekly_recap.ts
```

**A file's location says what it does, and its path usually gives it a name** —
there's no separate registry to keep in sync. Add a file and eve discovers it;
move or rename it and its identity moves with it. You can understand most eve
projects just by reading the tree. Start with only `instructions.md` (and
optionally `agent.ts`) and add the other folders as the agent grows.

## What eve agents can do

- **Run anywhere from one codebase.** The same agent serves a web chat UI, a
  terminal, Slack, Discord, Telegram, SMS (Twilio), and HTTP APIs. Your logic
  doesn't need to know where a message came from — eve turns each platform's
  input into a message and delivers the result back in the form that platform
  expects.
- **Call typed tools.** Tools are typed functions (Zod-validated input) the
  model can invoke to take real action — query a database, hit an API, send a
  message. (That's how I capture your thoughts, manage todos, and read notes.)
- **Load skills on demand.** Longer procedures live as markdown and get pulled
  into context only when a task matches their description — progressive
  disclosure, so the agent stays focused and cheap. (This explanation is itself
  an eve skill.)
- **Spawn subagents.** Delegate focused subtasks to child agents that have their
  own tools and skills.
- **Run on a schedule.** Cron-style schedules let the agent act proactively —
  e.g. my morning digest that texts you a daily focus summary.
- **Pause for humans (human-in-the-loop).** A tool can stop and wait for
  approval or a human answer, then resume the session once the answer arrives.
- **Stay durable across turns.** A session is more than one request/response —
  it streams progress, calls tools and subagents, pauses, resumes, keeps durable
  state, and survives crashes. Under the hood eve uses the open-source Workflow
  SDK for this; eve handles the machinery so tools focus on the work.
- **Connect to external services.** Pull in tools from MCP and OpenAPI servers,
  and authenticate per user, tenant, or channel.

## How the pieces fit

| File / folder | Role |
|---|---|
| `agent/instructions.md` | **Required.** The always-on system prompt — who the agent is, how it behaves |
| `agent/agent.ts` | Optional. Picks the model and configures runtime options |
| `agent/tools/*.ts` | Typed functions the model can call (auto-discovered) |
| `agent/skills/*` | Procedures loaded only when useful (like this one) |
| `agent/channels/*.ts` | Connections to web, Slack, Discord, SMS, and other surfaces |
| `agent/schedules/*.ts` | Recurring cron jobs for proactive, scheduled actions |

## Getting started (if they ask how to build one)

Scaffold a new agent — this creates the directory, installs dependencies,
initializes Git, and starts the interactive terminal UI:

```bash
npx eve@latest init my-agent
```

A minimal working agent is three small files. The instructions
(`agent/instructions.md`):

```text
You are a concise weather demo assistant. Tell users that the weather data is mocked.
```

A tool at `agent/tools/get_weather.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Return mock weather data for a city.",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
});
```

And the model choice in `agent/agent.ts`:

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
});
```

Then `npm run dev`. That's a working agent — add human-in-the-loop prompts,
subagents, and schedules as needed. (Point them to the first-agent tutorial in
the docs for a full walkthrough.)

## How to answer

Keep it conversational and concrete. Lead with the "open-source, filesystem-first
framework for durable agents / Next.js for agents" framing, then highlight the
2–3 capabilities most relevant to what was asked. Use the code examples only
when someone wants to build something. Offer the GitHub link or the bundled
`node_modules/eve/docs` for going deeper, and mention it's in beta if they're
evaluating it seriously. Don't dump the whole table or every example unless the
question really calls for it.
