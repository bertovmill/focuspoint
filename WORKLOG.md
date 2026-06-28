# Cael — Working Log

A personal guide with memory. Built with Vercel Eve + Next.js + Neon Postgres.

---

## Session: 2026-06-28 (morning digest leads with AI news)

### Morning digest now opens with the top AINews headline

**Goal:** Have the daily SMS lead with what's new in AI before the focus summary.

**Changes:**

| File | Change |
|---|---|
| `agent/schedules/morning-digest.ts` | Updated the schedule prompt: Cael first calls `latest_ai_news` (limit 1) and opens the SMS with one sentence on the top AI headline, then reviews todos + today's calendar (`list_calendar_events`). Falls back to headline + warm good-morning if nothing's on the docket. (Merged with a parallel change that added the calendar tool.) |

**Verified earlier this session:** the schedule fires end-to-end — manually
dispatched via eve's dev route, Cael generated the digest and Twilio **delivered**
the SMS to the configured number.

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (calendar auth → refresh token)

### Switched Google Calendar to refresh-token auth (reliable, unattended)

**Why:** The Vercel Connect path needed Google to be set up as a generic OAuth
connector (not a managed service) and app-scoped Connect doesn't cleanly map to
a *user-owned* personal calendar. Raw access tokens expire in ~1h, so the old
static-token approach couldn't keep the morning-digest cron working. A stored
OAuth **refresh token** exchanged for short-lived access tokens on demand works
identically in chat and cron (no logged-in browser needed) and is the standard
single-user pattern.

**Changes:**

| File | Change |
|---|---|
| `agent/lib/google-calendar.ts` | Dropped `@vercel/connect/eve`. Added `mintAccessTokenFromRefresh()` — exchanges `GOOGLE_REFRESH_TOKEN` (+ client id/secret) at `oauth2.googleapis.com/token`, caches the access token in-process until ~1min before expiry. `resolveGoogleToken()` now takes no ctx: `GOOGLE_CALENDAR_ACCESS_TOKEN` override → refresh-token mint → null. |
| `agent/tools/add_calendar_event.ts`, `agent/tools/list_calendar_events.ts` | Call `resolveGoogleToken()` (no ctx); removed the Connect `requireAuth` 401 path (access tokens are auto-minted fresh, so a stale token just re-mints on the next call). |

**Setup the user must do once (Google Cloud):**
1. Create a Google Cloud project; enable the **Google Calendar API**.
2. Configure the **OAuth consent screen** (External; add yourself as a test user).
3. Create an **OAuth client ID** (type: Desktop app).
4. Authorize once for scope `https://www.googleapis.com/auth/calendar` (e.g. via
   the OAuth Playground with "Use your own OAuth credentials") to obtain a
   **refresh token**.
5. Set env (`.env.local` and Vercel): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN`. (`GOOGLE_CALENDAR_ACCESS_TOKEN` remains a manual
   override for quick tests.)

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (code-block syntax highlighting)

Added per-language syntax highlighting to assistant markdown code blocks — the
one low-effort assistant-ui registry capability we were missing (highlighting
was the only quick win not blocked on eve's append-only sessions).

**Packages:** `@assistant-ui/react-syntax-highlighter`, `react-syntax-highlighter`,
`@types/react-syntax-highlighter` (dev).

| File | Change |
|---|---|
| `components/assistant-ui/syntax-highlighter.tsx` | New. Exports a `SyntaxHighlighter` built via `makePrismAsyncSyntaxHighlighter` (the `/full` entry — bundles all languages, code-split/async, so no manual language registration). Theme `oneDark`; `customStyle` strips the theme's own background/padding so only token colors apply. |
| `components/assistant-ui/markdown-text.tsx` | Plugged `SyntaxHighlighter` into `memoizeMarkdownComponents`. Made the code block consistently dark in both light/dark app themes (the app uses `prefers-color-scheme`, and a fixed-dark prism theme would be unreadable on a light surface otherwise): `pre` → `bg-[#282c34] text-zinc-100`, `CodeHeader` → `bg-[#21252b] text-zinc-400`. |

**Decision:** Consistently-dark code blocks rather than swapping prism themes per
color-scheme — simpler, and dark code on a light page is a common, clean look.
Used the all-languages async highlighter over the "light" variant to avoid
maintaining a per-language `registerLanguage` list; it's code-split so the cost
is deferred.

**Verified:** `npm run typecheck` PASS, `npm run build` PASS.

---

## Session: 2026-06-28 (semantic search for notes)

### Added meaning-based (semantic) search to the Notes tab

**Goal:** Let the user search notes by meaning, not just exact text/tags.

**Changes:**

| File | Change |
|---|---|
| `app/api/thoughts/semantic-search/route.ts` | New `GET ?q=` route. Fetches notes, embeds the query + each note's content via the Vercel AI Gateway (`openai/text-embedding-3-small`, no provider key — authed by `VERCEL_OIDC_TOKEN`), ranks by cosine similarity, returns top N with a `score`. Note embeddings are cached in a module-level `Map` keyed by `id:content`, so unchanged notes aren't re-embedded across warm invocations. Returns `503` on failure so the UI degrades gracefully. |
| `app/_components/dashboard.tsx` | Added a search box (shadcn `InputGroup` + `Spinner` + sparkles/clear icons) above the tag bar in the Notes tab. Typing debounces 350ms then calls the semantic-search API; results replace the list, ranked by relevance. Tag filter bar is hidden while searching. Added searching (skeletons), no-match, and unavailable empty states. Clear button (X) exits search. |

**Decisions:**
- **On-the-fly embedding, no pgvector/migration.** At personal note scale this is
  simple and robust — no schema change, no backfill. The in-memory cache keeps
  repeat searches cheap. If note volume grows large, migrate to a stored
  `vector` column + pgvector index and an ANN query.
- **Embeddings via AI Gateway** (`ai` v7 `embed`/`embedMany`) using the existing
  OIDC token — verified live (returns 1536-dim vectors), no new env var or key.
- Used the already-installed `input-group` shadcn component for the search box
  (idiomatic search input per the shadcn skill) rather than custom markup.

**Typecheck:** PASS ✓  ·  **Embeddings:** verified against live gateway ✓

---

## Session: 2026-06-28 (search notes by tag)

### Added tag-based filtering to the Notes tab

**Goal:** Let the user search/filter their notes by tag.

**Changes:**

| File | Change |
|---|---|
| `app/_components/dashboard.tsx` | Added a `tagFilter` state + a filter bar at the top of the Notes tab. Derives the distinct sorted tag set (`allTags`) from loaded thoughts and renders one pill per tag plus an "All" pill. Selecting a tag filters the list to notes containing it (`filteredThoughts`); tags rendered inside each note card are now clickable buttons that set the same filter (active tag highlighted). Added an empty-state for "no notes tagged X". |

**Decisions:**
- Client-side filtering — the dashboard already fetches all thoughts, so no new
  API param/round-trip was needed. If the note volume grows large enough that
  the client cap (limit 30) hides notes, revisit with a server-side `?tag=` query
  on `GET /api/thoughts`.

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (assistant-ui skill installed)

Installed the `assistant-ui` skill via `npx skills add https://github.com/assistant-ui/skills --skill assistant-ui`.

- Landed at `agent/skills/assistant-ui/` — `SKILL.md` (router/overview for the assistant-ui React library: primitives, runtimes, hooks) plus `references/architecture.md` and `references/packages.md`.
- `skills-lock.json` updated to track the install.
- Security scans clean (Socket: 0 alerts, Snyk: Low Risk, Gen: Safe).

Reference/guidance for the assistant-ui integration already in use; no runtime code changed.

---

## Session: 2026-06-28 (AINews tool + web search removed)

### Added a tool to read the latest from AINews (news.smol.ai)

**Goal:** Let Cael pull the latest AI news digest from https://news.smol.ai on request.

**Changes:**

| File | Change |
|---|---|
| `agent/tools/latest_ai_news.ts` | New `defineTool`. Fetches the AINews RSS feed (`https://news.smol.ai/rss.xml`) and returns the latest N issues (title, link, date, and the feed's per-issue summary). Regex-parsed — no XML dependency, no API key. Auto-discovered by eve. |

**Decisions:**
- Source: the site's RSS feed rather than scraping HTML — stable structure, and each
  item already carries a concise summary, so Cael gets digestible output cheaply.
- Verified the parser against the live feed (extracts titles/links/dates/summaries).

### Temporarily removed the Tavily web search tool

- Deleted `agent/tools/web_search.ts` so the user can test without it. Recoverable
  from git (commit `9dcbdc1` introduced it). Native Anthropic web search via eve is
  still an open option to investigate.

---

## Session: 2026-06-28 (chat UI gaps — remove non-functional controls + dead code)

### Removed controls eve's runtime can't support, and deleted orphaned UI

**Why:** Investigated wiring the remaining assistant-ui controls (edit /
regenerate / branch) and the conversation-history sidebar. eve's `ClientSession`
is **append-only** — it exposes only `send` / `stream` / `reset`, with no edit,
regenerate, fork, truncate, or session-listing. Because the model replays full
durable session history server-side, any client-side edit/truncate would leave
the model seeing stale context (silently wrong), and branching is impossible.
So the correct move was to remove the visible-but-broken controls rather than
fake them.

**Changes:**

| File | Change |
|---|---|
| `components/assistant-ui/thread.tsx` | Removed the Edit button (`UserActionBar`), the Reload/regenerate button, the `EditComposer`, and the `isEditing` branch in `ThreadMessage`. Dropped now-unused `PencilIcon` / `RefreshCwIcon` imports. Kept Copy + Export-as-Markdown (both work). `BranchPicker` left in place — it has `hideWhenSingleBranch`, so with eve's single-branch sessions it stays invisible (not misleading). |
| `components/ai-elements/*` (9 files), `app/_components/agent-message.tsx`, `app/_components/thinking-message.tsx` | Deleted. Orphaned earlier-iteration UI (Vercel AI Elements), imported nowhere since the assistant-ui `Thread` became the chat surface. |

**Not done — needs eve capabilities, not just wiring:**
- **Edit / regenerate / branch:** blocked until eve supports history editing
  (truncate/fork) server-side. Revisit if eve adds it.
- **Conversation-history sidebar (`thread-list.tsx`):** eve has no client
  session-listing and binds one session per mount, so this needs a client-side
  multi-session persistence layer (track session cursors + remount on switch).
  A real feature, scoped for later; `thread-list.tsx` stays unmounted for now.

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (eve capability gap-fill)

### Crawled the eve framework and implemented the unused capabilities

**Goal:** Compare Cael against eve 0.16.2's full surface area and adopt the
high-value capabilities we hadn't used. Cael was using ~20% of eve (tools, web +
Twilio channels, one schedule, skills).

**What was added (each typechecked; `eve info` = 0 errors, 0 warnings):**

| Area | Change | Files |
|---|---|---|
| **Connections / OAuth** | Google Calendar now resolves its token through **Vercel Connect** (app-scoped, auto-refresh) instead of a static `GOOGLE_CALENDAR_ACCESS_TOKEN` that silently expired. Static token kept as an optional fallback. Implemented as **inline provider auth** (`ctx.getToken(connect(...))`) inside the tools — the right fit for a REST API with no MCP server — rather than a `connections/` file. Re-challenges on 401 via `ctx.requireAuth`. | `agent/lib/google-calendar.ts`, `agent/tools/add_calendar_event.ts` |
| **Calendar read** | New `list_calendar_events` tool. The morning-digest cron asked Cael to "check the calendar" but had no read tool — it now does. | `agent/tools/list_calendar_events.ts`, `agent/schedules/morning-digest.ts` |
| **Human-in-the-loop** | `add_calendar_event` gated behind `once()` approval (outward write). | `agent/tools/add_calendar_event.ts` |
| **Built-in web_search** | Confirmed the provider-managed built-in (the custom Tavily tool was already removed); documented it for the agent. | `agent/instructions.md` |
| **Durable state** | `defineState` slot (`focus` + `thoughtsCaptured`) for per-session working memory; `set_focus` tool writes it; `capture_thought` increments the counter (cross-tool state). | `agent/lib/session-state.ts`, `agent/tools/set_focus.ts`, `agent/tools/capture_thought.ts` |
| **Subagent** | `planner` specialist (own instructions, Opus model) for open decisions / weekly prioritization / project breakdowns. Cael gathers context, delegates, relays the plan. | `agent/subagents/planner/` |
| **Hooks** | Observe-only `audit` hook logging `session.started` + every `action.result` (tool call), guarded so logging can't fail a turn. | `agent/hooks/audit.ts` |
| **Telegram channel** | `telegramChannel` with image/pdf upload policy — richer personal surface than SMS (inline-keyboard HITL, attachments, free). Setup + setWebhook steps in the file header. | `agent/channels/telegram.ts` |
| **Evals** | `eve eval` harness: config + two smoke evals (task→`add_todo`, reflection→`capture_thought`). Drive a real server, so they execute tools against `DATABASE_URL` — point at a dev/test DB. | `evals/evals.config.ts`, `evals/smoke/*.eval.ts` |

**Setup the user still needs to do for new env-gated features:**
- **Google Calendar via Connect:** `vercel connect create accounts.google.com --name google-calendar`, attach, `vercel env pull`, then set `GOOGLE_CONNECT_CONNECTOR` to the connector UID. (Until then, the static `GOOGLE_CALENDAR_ACCESS_TOKEN` fallback still works.)
- **Telegram:** create a BotFather bot, set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET_TOKEN` / `TELEGRAM_BOT_USERNAME`, then register the webhook (see file header).

**Discovered surface after the work:** 11 tools, 3 channels, 1 hook, 1 subagent,
1 schedule, 2 skills.

**Still deliberately skipped (low ROI for a single-user app):** multi-tenant
patterns, dynamic capabilities, OpenAPI connections, remote agents, OTel
instrumentation, sandbox/code-execution tuning, structured output.

---

## Session: 2026-06-28 (chat UI gaps — attachments + suggestions)

### Wired two already-present assistant-ui components that weren't functional

**Context:** Audited our chat UI against the assistant-ui standard component set.
Finding: we already ship nearly the whole registry (composer, branch picker,
action bar, reasoning, tool UI, attachments UI, dictation, scroll-to-bottom),
but several controls render without the runtime adapters that make them work.
The two quickest high-impact gaps were fixed this session.

**Changes:**

| File | Change |
|---|---|
| `hooks/use-eve-runtime.ts` | (1) Registered an attachment adapter: `adapters.attachments = new CompositeAttachmentAdapter([SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter])`. Previously the composer's attachment dropzone/UI was wired but no adapter ingested files. (2) Rewrote `onNew` to forward attachment content to `agent.send` as multimodal `UserContent` — images become data-URL `image` parts, text-like files become inlined `<attachment>` text parts. Before, `onNew` sent text only, so any attached file was silently dropped. A lone text part still collapses to a plain string. |
| `components/assistant-ui/thread.tsx` | Replaced the dynamic `ThreadPrimitive.Suggestions` (which rendered nothing — the eve external store provides no runtime suggestions) with four static `ThreadPrimitive.Suggestion` starters (auto-send) tailored to Cael: today's plate, focus, recent thoughts, calendar. Removed the now-unused `SuggestionPrimitive` import + `ThreadSuggestionItem`. |

**Decisions:**
- Used assistant-ui's built-in `Simple*AttachmentAdapter`s rather than a custom
  upload pipeline — no blob storage needed; images/files ride inline in the turn.
- Mapped assistant-ui's `FileMessagePart.mimeType` → AI SDK `FilePart.mediaType`.
- Suggestions kept as a static `WELCOME_SUGGESTIONS` array (no adapter) since
  this is a single-purpose personal agent.

**Still open (noted, not done):** Edit / regenerate / branch buttons still lack
`onEdit`/`onReload`/branch adapters; `thread-list.tsx` exists but isn't mounted
(needs eve multi-thread persistence); `components/ai-elements/*` +
`agent-message.tsx` / `thinking-message.tsx` are orphaned dead code.

**Typecheck:** PASS ✓

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

**Update (same session):** Compared our skill against Vercel's official `eve`
skill (installed via `npx skills add https://github.com/vercel/eve --skill eve`).

- **Official `eve` skill** = a lean ~25-line *pointer*: "Do not rely on this
  skill — always read the bundled docs at `node_modules/eve/docs/`." Drift-proof,
  aimed at a coding agent building eve projects. Now vendored at
  `agent/skills/eve/SKILL.md` (+ `skills-lock.json`) for this repo's own dev use.
- **Ours** = a self-contained explainer for the runtime agent. Different audience
  (end users) and constraint (no file-read tool).

Chose to **blend**: added a `## Source of truth` section to both our skills
(`agent/skills/explain_eve` + published `skills/explain-eve`) instructing the
agent to read `node_modules/eve/docs/` first when reachable and treat the
embedded summary as the offline/quick-answer fallback. Keeps us drift-proof like
the official skill while staying usable without filesystem access.

- Reverted an unrequested side effect of the install: it added `microsandbox` to
  `package.json` devDependencies — backed out `package.json` + `package-lock.json`.

| File | Change |
|---|---|
| `agent/skills/eve/SKILL.md` | Vendored official eve coding-agent skill |
| `skills-lock.json` | skills CLI lockfile pinning the official eve skill |
| `agent/skills/explain_eve/SKILL.md` | Added Source-of-truth section |
| `skills/explain-eve/SKILL.md` | Added Source-of-truth section |

**Typecheck:** PASS ✓

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
