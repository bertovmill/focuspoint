---
title: What I learned building a personal agent
date: 2026-07-05
summary: Six things that turned out to matter more than the model — a worklog, tools that compound, semantic search, and getting out of the agent's way.
tags: [agents, eve, engineering]
published: true
---

I've been building Cael — a personal agent that holds my goals, my reading, my training and my calendar — for a while now. Most of what I expected to matter didn't. Here's what did.

## Hosting was the whole problem, until it wasn't

I went through OpenClaw, then Hermes. Every time, I'd get somewhere real and then hit the same wall: infrastructure. Where does it run, what keeps it alive, how do I deploy a change without breaking the thing that texts me in the morning.

Eve removed that question entirely. It's a folder of files that deploys like a Next.js app. Tools go in one directory, schedules in another, channels in another — no registration step, no config file to keep in sync. Drop a file in the right place and it works.

The unlock wasn't a better model. It was that I stopped spending my evenings on plumbing.

## Tools compound, they don't add

The first tool is a novelty. The fifth changes what the thing *is*.

Once the agent could read my calendar **and** my notes, it started making connections I hadn't asked for — noticing that a commitment I'd written down conflicted with something I'd scheduled, surfacing a thought from three weeks ago because today's task rhymed with it. Every tool you add multiplies against every tool already there.

So the advice is boring and correct: keep adding tools. The value curve is not linear.

## Keyword search is a dead end

The first version of memory searched by keyword. It felt fine for about a week, and then it felt useless — because I never remember the words I used, I remember what I meant.

Switching to semantic search fixed it: turn on the vector extension in Postgres, store an embedding for every note as it's saved, and search by meaning. Now I can type *"how should I treat people"* and get back the right notes even though none of them contain those words.

If you're storing anything a human wrote, do this on day one.

## The worklog is the real memory layer

Not the agent's memory — mine, and the build's.

Every session starts by reading a running log of everything built, every decision made, every next step. Without it, each session begins from zero and re-litigates choices that were already settled. With it, work compounds across days the same way tools compound across features.

This is the single highest-leverage file in the project and it's just markdown.

## Skills for anything new

Models don't know about libraries released after their cutoff, and they'll confidently guess. Skills — small markdown files that teach the agent a specific tool — fix exactly this. They were the difference between fighting shadcn and Assistant UI and just using them.

Related: before writing any code against an unfamiliar library, have the agent go read the actual repo. The source beats the model's recollection every time.

## Get out of the way

The habit that changed my output most: every time I reach for a browser UI to do something, I ask whether the agent could just do it.

Generate an animation. Configure an integration. Design a component. Query the database. The agent reads docs, writes code, runs commands and iterates far faster than I click. My job turned out to be deciding *what* — not doing it.

---

The thing that surprised me most is how much it stopped feeling like a chatbot. It texts me in the morning. It remembers what I've been chewing on. It notices patterns I don't. That's a different category of software, and it took a weekend.
