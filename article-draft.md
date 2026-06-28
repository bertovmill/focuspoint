# Using Vercel Eve Agents: I built a personal assistant

**Berto:** It started with OpenClaw, then Hermes. I was building agents and it all was so confusing with hosting, etc. But then I got to using the new Vercel Eve agents and it's actually been a huge unlock for me.

[Agent: Eve is Vercel's new agent framework. Think of it like Next.js but for agents. One command and you have a whole project running. The big thing is you don't have to think about hosting at all — it just deploys like a normal web app.]

---

## The struggle

**Berto:** Before Eve, building agents felt really messy. Hosting, infrastructure, wiring everything together — it was a lot of overhead just to get something running. I went through OpenClaw, then Hermes. Each time I'd get somewhere and then hit a wall.

Eve changed that. It's just a folder with all these files, really intuitive. No sandboxes. Drop a file in the right place and it works. It's the same feeling as adding a new page to a Next.js app.

[Agent: The file structure is flat and obvious. Tools go in one folder, schedules in another, channels in another. No registration, no config file to update. It removed all the friction that was getting in the way of actually building.]

---

## Getting it off the ground

**Berto:** The first thing that really clicked was the frontend. Assistant UI is literally like the best thing ever.

[Agent: There's a React library called Assistant UI that gives you a full chat interface out of the box — streaming messages, file attachments, tool call cards, all of it. You get a really polished chat UI for free and just plug your agent into it.]

**Berto:** For storage I used Neon Postgres. This works well, high volume, and really good via CLI.

[Agent: Neon connects straight from the Vercel Marketplace — one click and your database is set up with all the right env vars. Simple to get running and it scales without you thinking about it.]

**Berto:** I also found using skills really relevant. Skills helped so much especially with navigating shadcn and assistant UI and even Eve. Skills are great for new things that are not as common knowledge.

[Agent: Skills are markdown files that give the agent extra context about a specific library or tool. The big value is for anything too new to be in the model's training data. You just run one command to install a skill and the agent knows how to use that thing properly.]

---

## Making it smarter

**Berto:** The agent gets more valuable the more tools you give it. Calendar, writing notes, posting to Twitter.

[Agent: Cael ended up with 11 tools — todos, notes, calendar, Twitter, AI news, and more. The compounding effect is real. Once the agent can read your calendar AND your notes it starts making connections between them that feel kind of magical. Each tool you add multiplies what it can already do.]

**Berto:** Having it research a GitHub repo is key if it's new. If you're using a new library or framework, have the agent go read the actual repo first.

[Agent: Before writing any code for a new library, point the agent at the source — the README, the docs, the actual source files. This beats relying on what the model already knows, especially for anything released recently.]

**Berto:** Also — use tools the CLI can use, don't use frontends. The agent is smarter than you.

[Agent: Every time you reach for a browser-based tool to do something, ask yourself if the agent could just do it instead. Generate an animation, configure an integration, design a component — the agent can read docs, write code, run commands, and iterate way faster than you clicking through a UI. Get out of its way and let it work.]

---

## Connecting it to your life

**Berto:** I connected it to my phone for iMessages. I used Twilio.

[Agent: Eve has Twilio built in so getting SMS working is surprisingly easy. One thing that tripped Berto up — the phone number in the config has to include the country code exactly right. A missing "1" at the front meant all incoming texts were silently being dropped for a while. Outbound still worked which made it really confusing to figure out.]

**Berto:** Scheduled prompts are really helpful. Every morning I get a text with my focus for the day. I didn't set that up, the agent did.

[Agent: Eve schedules are just files with a cron string. The morning digest runs at 8am, pulls your todos and calendar, grabs the latest AI news headline, and texts you a summary. No separate cron service, no extra setup — it registers automatically when you deploy.]

**Berto:** Just storing stuff isn't enough though. You need to be able to find it by meaning not just keywords.

[Agent: First version just searched by keyword which felt pretty limited. Then semantic search got added — you turn on the vector extension in Neon, store an embedding for each note when it's saved, and search by meaning instead of exact words. You can type "how should I treat people" and it surfaces the right notes even if you never used those words.]

---

## What it became

**Berto:** Creating a worklog is really valuable. Every session starts with reading it. It's the context that keeps things consistent across sessions.

[Agent: The worklog is a running diary of everything built, every decision made, every next step. Without it each session starts from scratch with no memory of what came before. It's the memory layer for the build process itself.]

**Berto:** I also gave it an animated avatar. There was a CLI tool that enabled it — I described what I wanted and it generated the animation.

[Agent: Berto described the avatar — green orb, breathing animation, rotating ring — and the agent generated the whole animation file. Then one small library to render it and it's live in the sidebar. No design tool, no manual keyframing.]

**Berto:** And then I created nightly dreaming. Every night the agent goes through everything you've captured and looks for patterns.

[Agent: A nightly job pulls the last 30 days of thoughts and todos and runs them through Claude to find recurring themes — things like "your best days always have exercise and deep work together." That report gets stored and Cael reads it at the start of every session. It's the closest thing to the agent actually getting to know you over time.]

---

**Berto:** The thing that surprised me most is how much it starts to feel like something that actually knows you. It's not just a chatbot. It texts you in the morning, it remembers what you've been thinking about, it notices patterns you don't. That's what Eve made possible for me — something that would have taken months to build, done in a weekend.
