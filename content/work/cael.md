---
title: A personal agent that runs my event follow-up
org: Cael
role: Builder
year: 2026 –
outcome: My own AI agent, built in public since June 2026. It syncs every MakersLounge registration and check-in, researches attendees, drafts the follow-up I sign, and keeps my task board honest.
stat: "860+ commits since June, 50+ tools, used every day"
color: "#3a3835"
image: /site-art/cael.webp
logo: /icon.svg
tags: [ai-agents, events, follow-up]
# Order on /work only; not shown on the site. Kept last so the event work leads.
date: 2025-08-01
published: true
---

## The challenge

Running an event is the easy half. The hard half is everything around it:
knowing who registered and who actually came, remembering what each person is
building, and following up while the night is still fresh. Done by hand, that
work gets skipped, and the event gets no credit for what it started.

## What I built

Cael is a personal agent I've built in public since June 2026, on Next.js,
the eve agent framework and Postgres. It has 50+ tools and I use it every day.

- **Events.** Every MakersLounge registration and check-in syncs in from Luma,
  so I can see who keeps coming back and how each format performs.
- **Follow-up.** It researches attendees and drafts the follow-up. I read it,
  sign it and send it, so a person is always accountable for what goes out.
- **Tasks.** One board for everything on my plate, with progress notes from
  the agents that work on it.
- **Open by design.** The same tools are exposed over MCP, so Claude Code and
  other agents can work from the same board and data.

## What changed

The work around each event no longer depends on me remembering to do it.
The numbers on the [MakersLounge case study](/work/makerslounge) come straight
from it. You can ask it about my work from the Ask AI button on this site.
