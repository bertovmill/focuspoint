# Cael — Working Log

A personal guide with memory. Built with Vercel Eve + Next.js + Neon Postgres.

---

## Session: 2026-06-28 (web search tool)

### Added a live web search tool for the agent

**Goal:** Let Cael search the live web (news, facts, current info beyond training data).

**Changes:**

| File | Change |
|---|---|
| `agent/tools/web_search.ts` | New `defineTool`. Calls the Tavily search API (`POST https://api.tavily.com/search`), returns a synthesized `answer` plus title/url/snippet results. Auto-discovered by eve — no registration needed. |

**Setup / decisions:**
- Provider: Tavily — LLM-oriented search API, free tier (~1k searches/mo).
  Swap to Brave/Exa/SerpAPI by changing the fetch; tool shape stays the same.
- Requires `TAVILY_API_KEY` env var. Tool returns a graceful "not configured"
  message (not an error) when the key is missing, so the agent degrades cleanly.
- No native eve/Anthropic built-in web search was available, hence the custom tool.

**Typecheck:** PASS ✓

**Update (same session):** Expanded the skill to be more in-depth using the eve
README. Added the full annotated project-layout tree, a "Getting started"
section (`npx eve@latest init`) with the minimal three-file example (instructions
+ `get_weather` tool + `defineAgent` model choice), more capabilities
(human-in-the-loop pause/resume, Telegram, Workflow SDK durability), beta status,
docs/community links, and depth-matching guidance so quick questions get short
answers. Tightened the `description` to also route on "how to build an eve agent".

**Update (same session):** Published the skill to the skills.sh ecosystem. Key
fact: skills.sh has **no manual publish/auth step** — it's a directory +
leaderboard that lists skills automatically once they live in a public GitHub
repo and people install them via `npx skills add`. The skills.sh CLI
(`github.com/vercel-labs/skills`) scans a **top-level `skills/`** dir (not eve's
`agent/skills/`) and requires a `name` frontmatter field.

| File | Change |
|---|---|
| `skills/explain-eve/SKILL.md` | New registry copy at the CLI-discoverable top-level path. Adds `name: explain-eve` frontmatter and is generalized (Cael self-references removed) since it installs into other people's agents. Verified discoverable via `npx skills list`. |

Kept the Cael-flavored `agent/skills/explain_eve/` for this app's own use — two
audiences, two files. Install command for the published skill:
`npx skills add bertovmill/focuspoint --skill explain-eve`. Listing on skills.sh
follows automatically as installs accrue.

---

## Session: 2026-06-28 (morning digest cron / eve schedule)

### Added a scheduled morning digest delivered over SMS

**Goal:** Set up a cron job so Cael proactively texts a morning focus summary.

**How eve does cron:** Schedules live in `agent/schedules/*.ts`, each carrying a
5-field cron string. On Vercel, every `defineSchedule` auto-registers as a Vercel
Cron Job (visible under Settings → Cron Jobs; runs evaluated in **UTC**).

**Changes:**

| File | Change |
|---|---|
| `agent/schedules/morning-digest.ts` | New handler-form schedule. `cron: "0 12 * * *"` (= 8am US Eastern in summer). Uses `receive(twilio, { target: { phoneNumber }, auth: appAuth })` to start a proactive SMS session that asks Cael to build a digest from `list_todos` + calendar. |

**Setup / decisions:**
- Delivery: SMS via the existing Twilio channel. Requires `MY_PHONE_NUMBER`
  (recipient) and `TWILIO_FROM_NUMBER` (sender) env vars; schedule skips the run
  if `MY_PHONE_NUMBER` is unset.
- Auth: `appAuth` (app principal) — single-user personal app.
- Timezone caveat: Vercel runs cron in UTC. Adjust the hour in the cron string
  for your zone.

**Testing:** `eve dev` never fires schedules on cadence. Trigger manually with:
`curl -X POST http://localhost:3000/eve/v1/dev/schedules/morning-digest`

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (mobile composer layout fix)

### Fixed: chat input hidden behind bottom nav bar on mobile

**Problem:** On mobile, the "Send a message..." text box was being covered by the fixed bottom navigation bar (Chat / Tasks / Notes).

**Root cause:** `ThreadPrimitive.Root` uses `h-full`, which resolves against AgentChat's `<main>` content height (`dvh - 64px` after nav padding). But the 56px header inside the same flex column also consumes space. So the Thread was 56px taller than the available space, pushing the sticky composer footer 56px below the nav-compensation line — directly behind the nav bar.

**Fix:** Wrapped `<AssistantRuntimeProvider>` in a `flex-1 min-h-0 flex flex-col overflow-hidden` div. This makes the Thread take only the remaining vertical space after the header, so the sticky composer footer correctly lands at the top of the nav bar.

**Files changed:**
- `app/_components/agent-chat.tsx` — added wrapper div around provider

---

## Session: 2026-06-28 (rename to Cael)

### Renamed app from FocusPoint → Cael

**Goal:** Give the app a meaningful persona name — a guide who represents helping the user reach their dreams.

**Changes:**

| File | Change |
|---|---|
| `app/layout.tsx` | Updated `<title>` and description metadata to Cael |
| `app/_components/agent-chat.tsx` | Updated header label to "Cael" |
| `app/_components/dashboard.tsx` | Updated dashboard heading to "Cael" |
| `agent/instructions.md` | Rewrote persona as Cael — boundless sky guide, connects daily actions to bigger dreams |
| `package.json` | Renamed package from `focuspoint-agent` to `cael` |
| `WORKLOG.md` | Updated log title |

**Decisions made:**
- Name: Cael (Irish/Latin for "sky") — boundless, holds the big picture, guides toward dreams
- Persona: warm, calm, grounded. Sees further than the user can. Connects tasks to meaning.

---

## Session: 2026-06-28 (inline memory editing)

### Added inline edit and delete for Notes (memories)

**Goal:** Let the user edit and delete captured thoughts/memories directly from the Notes tab.

**Changes:**

| File | Change |
|---|---|
| `app/api/thoughts/[id]/route.ts` | Added `PATCH` handler — updates thought content, returns updated row |
| `app/_components/dashboard.tsx` | Edit/delete UX on each note card; inline textarea editor with Save/Cancel |

**UX details:**
- Hover a note card → pencil (edit) and trash (delete) icons appear
- Click pencil → card flips to inline textarea; Enter saves, Escape cancels, Shift+Enter newline
- Optimistic UI: state updates immediately before the API call
- Delete removes the card instantly from the list

**Typecheck:** PASS ✓

---

## Session: 2026-06-28

### 12:25 — Project kick-off

**Goal:** Build a personal AI agent that captures thoughts, builds memory about the user, and helps with calendar reminders + todos.

**Decisions made:**
- Framework: Vercel Eve (launched June 17 2026 — "Next.js for agents")
- Frontend: Next.js 15, App Router
- Storage: Neon Postgres (via Vercel Marketplace) — thoughts, todos, memories
- Integrations: Google Calendar (day one), email (later)
- Todo list: built-in (no external app)
- Memory: cloud is fine, stored in our own Neon DB

**Two surfaces:**
- Mobile web: quick capture bar, recent thoughts, chat
- Desktop web: full dashboard (notes/todos/calendar left) + agent chat (right)

---

### 12:30 — Scaffolding started

- Ran `npx eve init focuspoint-agent` — created Eve agent project
- Ran `eve channels add web` — scaffolded Next.js web chat UI
- Installed `@neondatabase/serverless` for Postgres

---

### 13:00 — Core build complete ✓

**Files created:**

| File | Purpose |
|---|---|
| `agent/instructions.md` | Agent personality + behavior rules |
| `agent/tools/capture_thought.ts` | Save a thought to Postgres |
| `agent/tools/search_memory.ts` | Search past thoughts |
| `agent/tools/add_todo.ts` | Create a todo |
| `agent/tools/list_todos.ts` | Retrieve todo list |
| `agent/tools/complete_todo.ts` | Mark todo done |
| `agent/tools/add_calendar_event.ts` | Add Google Calendar event |
| `lib/db.ts` | Neon Postgres connection + schema |
| `app/page.tsx` | Split layout: dashboard left, chat right |
| `app/_components/dashboard.tsx` | Dashboard panel with Tasks/Notes tabs |
| `app/api/todos/route.ts` | REST: GET/POST todos |
| `app/api/todos/[id]/complete/route.ts` | REST: complete a todo |
| `app/api/thoughts/route.ts` | REST: GET thoughts/notes |

**Typecheck:** PASS ✓

---

### Next steps (to get it running)

1. **Set up Neon Postgres**
   - Go to vercel.com/marketplace → add Neon Postgres integration
   - Pull env: `cd focuspoint-agent && vercel link && vercel env pull`
   - Run schema migration (the `ensureSchema()` fn creates tables on first API call)

2. **Link to Vercel**
   - `cd focuspoint-agent && vercel link`

3. **Run locally**
   - `cd focuspoint-agent && npm run dev`
   - Eve dev server + Next.js at localhost:3000

4. **Google Calendar (optional, for now)**
   - Add `GOOGLE_CALENDAR_ACCESS_TOKEN` to Vercel env vars
   - Agent gracefully skips calendar if token is absent

5. **Deploy**
   - `vercel deploy --prod`

---

### 13:30 — Database Explorer added ✓

**New route:** `/explore`

- Stats bar: total memories, active todos, completed today
- Memories tab: full searchable list of all captured thoughts, with tags + timestamps, delete on hover
- Todos tab: all todos including completed, filterable by status + search, priority badges
- Nav icon (database icon) in the chat header links to `/explore`
- Back arrow on explore page returns to `/`
- New API routes: `GET /api/stats`, `DELETE /api/thoughts/[id]`, `DELETE /api/todos/[id]`
- Updated `GET /api/thoughts` and `GET /api/todos` to accept `limit` and `include_completed` query params

**Also done this session:**
- Moved `focuspoint-agent` up to be the root `focuspoint` directory (removed nesting)
- Connected GitHub repo: `bertovmill/focuspoint`
- Connected Vercel project to `bertmill19s-projects` account (has AI Gateway credits)
- Provisioned Neon Postgres under correct account
- Updated `CLAUDE.md` to require agents to read `WORKLOG.md` before starting work

---

### 14:15 — Mobile-friendly layout + bottom nav ✓

**Goal:** Make the app usable on mobile with a native-feeling bottom tab bar.

**Changes:**

| File | Change |
|---|---|
| `app/page.tsx` | Converted to client component; added `mobileTab` state (`chat \| tasks \| notes`); mobile bottom nav bar (`lg:hidden`); conditional panel visibility per tab |
| `app/_components/dashboard.tsx` | Accepts optional `activeTab` prop synced from nav; added `pb-16 lg:pb-0` to scrollable content to clear nav |
| `app/_components/agent-chat.tsx` | Accepts `hasMobileNav` prop; adds `pb-20 lg:pb-6` to composer so chat input clears the nav bar |

**Behaviour:**
- Mobile (`< lg`): bottom nav with Chat / Tasks / Notes tabs. Tapping Tasks or Notes shows the Dashboard full-screen on that tab; tapping Chat switches back to the agent.
- Desktop (`lg+`): layout unchanged — sidebar Dashboard + full chat panel, no bottom nav.

**Typecheck:** PASS ✓

---

### 14:30 — App icon added ✓

**Files created/modified:**

| File | Purpose |
|---|---|
| `public/icon.svg` | App icon — camera-viewfinder bracket motif on dark ground |
| `app/layout.tsx` | Added `icons` metadata (favicon + apple-touch) pointing to `/icon.svg` |

**Design decision:** Four L-shaped corner brackets converging on a center dot — the camera autofocus viewfinder frame. Chosen over crosshair/bullseye because brackets signal attentiveness rather than targeting, which fits an agent that pays close attention to your life. Dark self-contained ground works on any background without a light-mode variant. Bracket arms sized at 14px (on 512 grid) to hold legibility at 16×16 favicon.

**Also done:**
- Strengthened `CLAUDE.md` post-feature rule: update WORKLOG + push to main, non-negotiable.

---

### Session: 2026-06-28 — assistant-ui components installed ✓

**Goal:** Replace the custom AI element components with industry-standard assistant-ui components built on shadcn.

**What was installed:**

| Package | Purpose |
|---|---|
| `@assistant-ui/react` | Core primitives: Thread, Message, Composer, ActionBar, BranchPicker, Reasoning, ToolGroup |
| `@assistant-ui/react-markdown` | Markdown rendering in messages |
| `tw-shimmer` | Shimmer/loading animations |
| `zustand` | State management (required by assistant-ui) |

**shadcn components added to `components/assistant-ui/`:**

| Component | What it does |
|---|---|
| `thread.tsx` | Full chat thread — messages, scroll, composer, welcome screen, branch picker |
| `thread-list.tsx` | Multi-thread sidebar |
| `attachment.tsx` | File/image attachment rendering |
| `markdown-text.tsx` | Streaming markdown with code highlighting |
| `reasoning.tsx` | Collapsible reasoning/thinking display |
| `tool-fallback.tsx` | Default tool call display |
| `tool-group.tsx` | Grouped tool calls with expand/collapse |
| `tooltip-icon-button.tsx` | Icon button with tooltip |

**New files:**

| File | Purpose |
|---|---|
| `hooks/use-eve-runtime.ts` | Eve → assistant-ui runtime adapter. Converts `EveMessage[]` to `ThreadMessageLike[]` and bridges `agent.send`/`agent.stop` to assistant-ui's `ExternalStoreAdapter`. |

**Key changes:**

| File | Change |
|---|---|
| `app/_components/agent-chat.tsx` | Replaced custom message rendering with `AssistantRuntimeProvider` + `Thread`. Kept custom header and error banner outside the thread. `PersonalizedWelcome` component passed as `Thread`'s `Welcome` slot. |

**Design decisions:**
- Used `useExternalStoreRuntime` (not `useChatRuntime`) since eve's transport doesn't speak AI SDK's streaming protocol
- `dynamic-tool` eve parts map to `tool-call` assistant-ui parts; `output-error` state maps to `isError: true`
- `isRunning` from `agent.status === "submitted" | "streaming"` drives the loading indicator

**Typecheck:** PASS ✓
