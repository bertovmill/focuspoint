# Cael — Working Log

A personal guide with memory. Built with Vercel Eve + Next.js + Neon Postgres.

---

## 2026-07-12 — Tasks (and other sidebar) nav items now take over the main view on desktop

**What was built:**
On desktop, clicking "Tasks" (or Notes/Content Ideas/Dreams/etc.) in the Dashboard's left rail previously only updated the narrow 380/420px sidebar column — the wide main panel always kept showing chat regardless of which nav item was selected. User wanted the selected section to take over the full main view instead, matching how it already worked on mobile.

- `app/page.tsx` — the aside/chat visibility classes were forcing `lg:flex` regardless of `mobileTab`, which is why desktop always showed both panels. Removed those forced overrides so `mobileTab` now drives desktop layout too: when `mobileTab !== "chat"`, the Dashboard aside expands to `flex-1` (full width, replacing the chat-history rail + chat panel entirely); when `mobileTab === "chat"`, it reverts to the normal narrow sidebar. Also wired `onTabChange`, `isExpanded`, and `onBackToChat` props into `<Dashboard>`.
- `app/_components/dashboard.tsx` — `Dashboard` now accepts `onTabChange` (fired alongside the existing local `setActiveTab` when a nav item is clicked, so the parent page can react) and `isExpanded`/`onBackToChat`. Added a "back to chat" icon button (visible only when expanded) in the header next to the trace-viewer link, so there's a way back to the chat view without a dedicated "Chat" nav entry.

**Verification:** started a second dev server instance on port 3001 (port 3000 was already in use by an unrelated project, `venice`), logged in via the app's own `/login` password form using Playwright, and screenshotted: default view (narrow sidebar + chat), clicking "Tasks" (sidebar expands to fill the full main panel, chat/chat-history disappear), and clicking the new back-to-chat button (returns to the original layout). All three matched the intended behavior.

**Note:** while cleaning up, an overly broad `pkill -f "next dev"` accidentally killed the unrelated `venice` project's dev server on port 3000 — restarted it immediately and confirmed it came back up correctly.

**Typecheck:** PASS ✓

## Session: 2026-07-12 — Re-enable scheduled-tasks dispatcher as once-daily

**Ask:** Berto saw a Vercel build failure ("Hobby accounts are limited to daily cron jobs... this cron expression (`* * * * *`) would run more than once per day") and asked if it was fixed. A concurrent session had already unblocked the deploy by moving `agent/schedules/dispatcher.ts` to `agent/schedules-disabled/` (disabling it entirely) rather than fixing it.

Asked Berto how to handle it given Hobby's real limit is 1x/day for *any* cron cadence, not just per-minute ones. He chose: keep the dispatcher active, run it once daily, and have it fire any enabled scheduled task that's due "today" — accepting that a task's specific hour/minute is no longer honored precisely (everything fires on the single daily tick instead).

**What was built:**
- `lib/cron.ts` — added `cronMatchesDate()`, a variant of `cronMatches()` that only checks day-of-month/month/day-of-week, ignoring hour/minute.
- `agent/schedules/dispatcher.ts` — moved back from `agent/schedules-disabled/` (which is now deleted), cron changed from `"* * * * *"` to `"0 13 * * *"` (once daily, 1pm UTC / 9am ET), uses `cronMatchesDate` instead of `cronMatches`, and the run-dedup window is now per-day (`dayStart`) instead of per-minute (`minuteStart`).

**Next step / open question:** if Berto later wants precise per-task time-of-day back, either upgrade the Vercel project to Pro (native per-minute cron allowed) or move dispatch to an externally-triggered route (e.g. cron-job.org hitting a webhook) instead of Vercel's native Cron Jobs feature.

**Typecheck:** PASS ✓

---

## Session: 2026-07-12 — "urgent" priority label for todos

**Ask:** Berto wanted an "urgent" label option for tasks so he can tell what needs to get done.

**What was built:**
- Extended the todo `priority` enum from `low | normal | high` to `low | normal | high | urgent` in `agent/tools/add_todo.ts` and `agent/tools/update_todo.ts`.
- `agent/tools/list_todos.ts` — replaced the alphabetical `priority DESC` sort (which didn't actually rank priorities correctly) with an explicit `CASE` ordering so `urgent` sorts first, then `high`, `normal`, `low`.
- `app/globals.css` — added a `--priority-urgent` color token (distinct red, separate from `--priority-high`'s orange-red) for light/dark themes plus the Tailwind `--color-priority-urgent` mapping.
- `app/_components/dashboard.tsx` — added `urgent` to the `Todo` type, `priorityColor()`, the inline edit priority-picker badges, and a new red "Urgent" badge on task rows (alongside the existing "High" badge). The header's task-count summary now counts both `high` and `urgent` as "urgent" for the compact status line.

**Note:** DB `priority` column is untyped `TEXT`, so no migration was needed — new values just start being written.

**Typecheck:** PASS ✓

---

## Session: 2026-07-10 — update_todo tool for Cael

**Ask:** Berto asked Cael "are you able to edit my automated tasks?" — Cael said no, only add/complete/list. Turned out scheduled tasks were already fully editable (tool + UI from the 2026-07-08 session); the gap was plain todos, which had no edit path.

**What was built:**
- `agent/tools/update_todo.ts` — new tool to edit an existing todo's title, priority, due_date, or recurrence by id, instead of only complete+recreate.
- `agent/instructions.md` — updated the Todos capability line to list `update_todo` alongside `add_todo`/`complete_todo`/`list_todos`.

**Verified:** Scheduled tasks (`app/_components/scheduled-tasks-panel.tsx`) already have a pencil-icon edit dialog wired to `PATCH /api/scheduled-tasks/[id]`, and Cael already has `update_scheduled_task`. No changes needed there — Cael's earlier "I can't edit" answer was about todos, not scheduled tasks.

**Typecheck:** PASS ✓

---

## Session: 2026-07-08 — Agent Traces page

**Ask:** A dedicated page for digging into raw eve agent traces (tool calls, reasoning, token usage per session) — separate from the normal chat view.

**Key discovery:** No backend work needed. `threads.events` (`lib/db.ts`) already stores the full raw NDJSON event stream per session — `threads-provider.tsx` writes `snap.events` there on every turn so chat history survives a refresh. Confirmed against real production data (57 threads) that the shape matches eve's documented event contract (`type`, `data`, `meta.at`) exactly, including `action.result` (tool output), `step.completed` (`usage.inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens`, `finishReason`), and `session.started.runtime` (model id, eve version, git branch/sha).

**Built:**
- `lib/trace-utils.ts`: pure functions over a raw event array — `buildToolCallMap` (matches `action.result`'s bare `callId` back to the tool name from the earlier `actions.requested`), `computeThreadStats` (model, eve version, git build, turn/tool-call counts, summed token usage, wall-clock duration, terminal status), `summarizeEvent` (one-line human summary per event type), `isNoisyEvent` (filters out `*.appended` streaming deltas and `step.started`, since their `.completed` counterpart already carries the final value).
- `app/_components/traces-view.tsx`: full-page two-pane client component. Left: session list (title, relative time, status dot, turn/tool-call counts, filterable by title) fetched from the existing `/api/threads`. Right: selected session's summary card (model/duration/turns/tool calls/token totals/git build) + the full event timeline as collapsible rows (icon + one-line summary + timestamp, expand for raw JSON via native `<details>`).
- `app/traces/page.tsx`: new route at `/traces`, inherits the root layout (theme, auth middleware — same login-gated as the rest of the app).
- `app/_components/dashboard.tsx`: small `ActivityIcon` link to `/traces` next to the header's `ModeToggle`.

**Two real field-name bugs caught by checking actual data before shipping:** `reasoning.completed`'s text is on `data.reasoning`, not `data.text`; `message.completed`'s text is on `data.message`, not `data.text`. Would have silently rendered blank summaries for both — the docs' event table names the events but not every field, so worth pulling a real thread's events before trusting an event summarizer.

**Verified:** `npm run typecheck` clean. Screenshotted the live page against real thread data — session list, summary stats (56,402 input / 744 output / 32,860 cache-read tokens on the sampled session), and an expanded raw-JSON row all render correctly with zero console errors.

**Files changed:** `lib/trace-utils.ts` (new), `app/_components/traces-view.tsx` (new), `app/traces/page.tsx` (new), `app/_components/dashboard.tsx`.

---

## Session: 2026-07-08 — Editable scheduled tasks (frontend + Cael tool)

**Ask:** User asked whether scheduled tasks could be edited from the frontend, and whether Cael could have a tool to edit its own scheduled tasks. At the time, the only schedules that existed (`agent/schedules/morning-digest.ts`, `agent/schedules/daily-tweet.ts`, `/api/dream`) were static code, fixed at build/deploy time — the "Scheduled Tasks" sidebar built in the sessions below only *displays* and manually re-runs those three, it doesn't let you create a new one or change a cron/prompt.

**Design (eve's documented "dynamic scheduling" pattern):** Store schedules as rows in Postgres instead of code. One static eve schedule (`cron: "* * * * *"`) wakes every minute, atomically claims due rows, and hands each one to Cael via the Twilio channel as a normal agent turn (so the task prompt gets full tool access) — texting the result only if the row's `notify` flag is set.

**Built:**
- `scheduled_tasks` table (`lib/db.ts`): title, prompt, cron (5-field, UTC), notify, enabled, last_run_at.
- `lib/cron.ts`: minimal cron validate/match/describe helpers (supports `*` and comma lists only — no ranges/steps, since every real use case here is daily-or-weekly-at-a-fixed-time). `describeCron` renders things like "Daily at 9:00 PM UTC" for the UI.
- `agent/schedules/dispatcher.ts`: the one-minute dispatcher schedule. Atomically claims due rows (conditional `UPDATE ... WHERE last_run_at < this-minute`) before firing, so overlapping ticks can't double-send.
- Four new agent tools: `create_scheduled_task`, `list_scheduled_tasks`, `update_scheduled_task` (also used to pause/resume via `enabled`), `delete_scheduled_task`.
- `app/api/scheduled-tasks/route.ts` + `[id]/route.ts`: REST CRUD for the frontend, mirroring the existing `/api/todos` pattern.
- `app/_components/scheduled-tasks-panel.tsx`: list/create/edit/pause/delete UI, added inside the existing "Scheduled Tasks" nav section in `dashboard.tsx` (below the built-in-schedule cards from the sessions below — this branch had diverged in parallel with those, so it was rebased on top and merged into the same section rather than adding a second tab).
- `agent/instructions.md`: taught Cael the four tools, and to confirm cadence/time (converted to UTC) before creating, and to confirm before editing/pausing/deleting a task it didn't just create.

**Left alone (by design, for now):** `/api/dream`, `agent/schedules/daily-tweet.ts`, and `agent/schedules/morning-digest.ts` still run as the fixed built-in schedules shown in the cards above this new list — they were working and out of scope for this change. They could be migrated into `scheduled_tasks` rows later if we want them editable/tool-accessible too.

**Verified:** `npm run typecheck` clean. Full CRUD exercised end-to-end against the local Neon DB via curl (create/list/pause/invalid-cron-rejection/delete all behaved correctly). `eve dev` booted with no discovery errors and the dev-only dispatch route (`POST /eve/v1/dev/schedules/dispatcher`) ran the handler cleanly. Sent a real chat message to confirm eve loads/validates the four new tool schemas without error. Screenshotted the running UI to confirm the merged section renders with no console errors.

**Files changed:** `lib/db.ts`, `lib/cron.ts` (new), `agent/schedules/dispatcher.ts` (new), `agent/tools/create_scheduled_task.ts` (new), `agent/tools/list_scheduled_tasks.ts` (new), `agent/tools/update_scheduled_task.ts` (new), `agent/tools/delete_scheduled_task.ts` (new), `app/api/scheduled-tasks/route.ts` (new), `app/api/scheduled-tasks/[id]/route.ts` (new), `app/_components/scheduled-tasks-panel.tsx` (new), `app/_components/dashboard.tsx`, `agent/instructions.md`.

---

## Session: 2026-07-04 — "Run now" opens a new chat thread

When clicking "Run now" on any Scheduled Tasks card, Cael now creates a new chat thread and lets the agent execute the job live in the UI — so you can watch it happen in real time.

**What changed:**
- `app/_components/agent-chat.tsx`: added `initialMessage?: string` and `onInitialMessageSent?: () => void` props. On mount, if `initialMessage` is set, a 100ms `setTimeout` fires `agent.send({ message: initialMessage })` (the eve SDK send, same as typing in the chat). A ref prevents double-send.
- `app/_components/dashboard.tsx`: added `agentMessage` field to each CRON_JOB entry (the natural-language instruction to send Cael). Added `onRunJobWithChat?: (message: string) => void` prop. `handleRunJob` now checks for this callback first — if present, it calls it and returns immediately instead of hitting the API route directly.
- `app/page.tsx`: added `pendingMessage` state and `handleRunJobWithChat` callback in `Workspace`. The callback calls `newThread()`, sets `pendingMessage`, and switches `mobileTab` to "chat" (on mobile). Passes `onRunJobWithChat={handleRunJobWithChat}` to Dashboard and `initialMessage={pendingMessage}` + `onInitialMessageSent` to AgentChat. The `key={activeId}` on AgentChat means each new thread is a fresh mount, so each "Run now" creates an isolated conversation.

**Flow:**
1. User clicks "Run now" on Dream / Tweet / Morning Digest
2. New chat thread is created and activated
3. Mobile view switches to chat; desktop stays split
4. AgentChat mounts with the pre-set message, sends it 100ms later
5. Agent executes the job live (tools visible in UI)

**Typecheck:** PASS

---

## Session: 2026-07-04 — Add Morning Digest card to Scheduled Tasks sidebar

Added the Morning Digest schedule as a third card in the "Automated" section of the Scheduled Tasks sidebar view.

**What changed:**
- `app/_components/dashboard.tsx`: added `SunIcon` to imports; added `morning-digest` entry to `CRON_JOBS` with icon, schedule time (8 AM ET / 12:00 UTC), and a detailed double-click description explaining the SMS flow (AI news + todos + calendar + Twilio delivery).
- `app/api/morning-digest/route.ts`: new API route. GET is the cron auth check (managed by eve). POST is the "Run now" manual trigger — returns an info toast explaining it's an SMS schedule and how to trigger it in dev via the eve dispatch route.

**Double-click detail** for morning-digest explains:
- Gathers top AI news, open todos, and calendar events
- Formats a phone-friendly SMS (no markdown, 2-4 emojis)
- Delivers via Twilio to MY_PHONE_NUMBER
- "Run now" is informational since SMS can't be previewed in the browser

**Typecheck:** PASS

---

## Session: 2026-07-04 — Scheduled Tasks sidebar section

Added a "Scheduled Tasks" nav item to the ElevenLabs-style sidebar.

**What it shows:**

1. **Automated** section: the two Vercel cron jobs (Dream Analysis at 8 AM UTC, Daily Tweet at 12 PM UTC), each with a "Run now" button that triggers the POST endpoint.
2. **Recurring Tasks** section: all todos with a recurrence field set (daily/weekly/monthly), with their repeat cadence badge and next due date.

**Files changed:**
- `app/_components/dashboard.tsx`: added `CalendarClockIcon, SendIcon, PlayIcon` to imports; added `CRON_JOBS` constant; extended `activeTab` type to include `"schedule"`; added `runningJob` state (keyed by job key); added `handleRunJob` async function; added full Schedule content section between Dreams and Media.
- `app/page.tsx`: added `CalendarClockIcon` import; added `"schedule"` to `MobileTab` type; wired `schedule` branch in `activeTab` prop; added Schedule NavButton in mobile bottom nav.

**Typecheck:** PASS

---

## Session: 2026-07-04 — ElevenLabs-inspired sidebar nav redesign

Replaced horizontal tab bar in Dashboard with a vertical nav list (icon + label) matching ElevenLabs' sidebar style.

**Changes:**
- `app/_components/dashboard.tsx`: replaced `Tabs/TabsList/TabsTrigger` with a `<nav>` of full-width buttons; compact 36px avatar header; conditional content rendering instead of `TabsContent`; active item gets `bg-accent` highlight; Tasks item shows live count on the right.

**Typecheck:** PASS

---

## Session: 2026-07-04 — ElevenLabs-inspired UI redesign

Replaced the mint/emerald color scheme with a clean, high-contrast white + orange palette inspired by ElevenLabs.

**Changes:**
- `app/globals.css`: New color token set — near-white page background (`oklch(0.98 0 0)`), pure white cards, all grays are neutral (no hue), vibrant orange primary (`oklch(0.68 0.22 37)`, ~`#F97316`). Dark mode updated to match (deep near-black bg, same orange). Radius tightened from `0.625rem` to `0.5rem`. Added `antialiased` font smoothing and `-0.02em` letter-spacing on headings.
- `app/_components/dashboard.tsx`: Simplified header — removed `CaelAvatar`, tighter layout, date line moved below the title row.
- `app/_components/agent-chat.tsx`: Welcome screen text tightened (`font-semibold`, smaller `mt-1` gap).

**Typecheck:** PASS ✓

---

## Session: 2026-07-04 — Collapsible sidebars with slide animation

Both desktop sidebars (Dashboard panel + Chat history rail) are now independently collapsible with a smooth 300ms ease-in-out slide animation.

**Changes:**
- `app/page.tsx`: added `chatSidebarOpen` state. Both sidebars now use `lg:transition-[width] lg:duration-300 lg:ease-in-out` + `overflow-hidden` instead of `lg:hidden` toggling. Each has an inner fixed-width wrapper so content doesn't reflow during the slide animation.
- `app/_components/agent-chat.tsx`: added `chatSidebarOpen` + `onToggleChatSidebar` props. Added a `HistoryIcon` toggle button in the header (desktop only, next to the existing dashboard toggle).

**Typecheck:** PASS ✓

---

## Session: 2026-07-04 — Recurring tasks

Added optional recurrence to todos (daily, weekly, monthly).

**How it works:**
- Each todo has a `recurrence` field: `none` (default), `daily`, `weekly`, or `monthly`.
- When a recurring task is "completed", it is NOT marked done. Instead its `due_date` is advanced to the next occurrence (today + period) and it stays active.
- Non-recurring tasks complete and disappear as before.

**UI changes (`app/_components/dashboard.tsx`):**
- Quick-add form: a recurrence picker (Once / Daily / Weekly / Monthly pill buttons) appears when you start typing a task title. Defaults to "Once".
- Task list items: recurring tasks show a small repeat icon and label next to the due date.
- Completing a recurring task updates its due_date in place rather than removing it.

**Schema (`lib/db.ts`):**
- `ALTER TABLE todos ADD COLUMN IF NOT EXISTS recurrence TEXT DEFAULT 'none'` (idempotent).

**API routes:**
- `GET/POST /api/todos` include/accept `recurrence`.
- `POST /api/todos/[id]/complete` advances `due_date` for recurring tasks and returns `{ recurring: true, next_due }`.

**Agent tools:**
- `add_todo.ts` accepts `recurrence` param.
- `complete_todo.ts` reschedules recurring todos and informs the model.

**Typecheck:** PASS ✓   **Eve info:** 0 errors, 0 warnings.

**Files changed:**
`lib/db.ts`, `app/api/todos/route.ts`, `app/api/todos/[id]/complete/route.ts`,
`agent/tools/add_todo.ts`, `agent/tools/complete_todo.ts`, `app/_components/dashboard.tsx`

---

## Session: 2026-07-04 — Collapsible dashboard sidebar toggle

Added an ElevenLabs-style sidebar toggle button to the desktop chat header.

**Changes:**

| File | Change |
|---|---|
| `app/page.tsx` | Added `sidebarOpen` state (default `true`). Dashboard `aside` conditionally hides on desktop when closed. Passes `sidebarOpen` + `onToggleSidebar` props to `AgentChat`. |
| `app/_components/agent-chat.tsx` | Added `sidebarOpen` and `onToggleSidebar` props. Desktop-only (`hidden lg:flex`) button in the header: `PanelLeftCloseIcon` when open, `PanelLeftIcon` when closed, with a "Close sidebar" / "Open sidebar" tooltip on hover via the existing `Tooltip` component. |

**Typecheck:** PASS ✓

---

## Session: 2026-07-02 — Fix scheduled tasks (morning-digest cron) not firing

**Problem:** The `agent/schedules/morning-digest.ts` cron was registered correctly on Vercel (visible under Production deployment `crons`, path `/eve/v1/cron/...`, `0 12 * * *`), so it *was* firing every day — but no SMS was ever arriving.

**Root cause:** Production env vars for the schedule were empty. `MY_PHONE_NUMBER` existed on Vercel for the Production target but with an empty string value (never actually set), and `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` only had real values under the **Development** target — Production had them as empty strings too. The schedule handler's `if (!phoneNumber) { console.warn(...); return; }` guard silently no-op'd every run, and the warning only ever showed up in function logs nobody was watching.

**Fix:** Removed and re-added the four vars on the Production environment via `vercel env`, using the same values already working in dev (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) plus the actual phone number for `MY_PHONE_NUMBER` (`+1 519 990 8727`). Triggered a `vercel --prod` redeploy afterward — env var changes don't apply to an already-built deployment, so a redeploy was required for the fixed values to reach the running functions.

**Verification:** Confirmed via the Vercel API that all four vars now have non-empty values under the `production` target, and confirmed the new deployment (`dpl_CTQxmAd1vXD1i3yDupME2tXhyBz4`) still registers the eve cron entry (`0 12 * * *`). Could not curl the production cron path directly to force a live test — Vercel's cron invocations are internally signed and return 401 to any external caller — so full end-to-end confirmation will land with tomorrow's 12:00 UTC (8am ET) run.

**Next step / things to double check if it still doesn't fire:** verify Twilio delivery in the Twilio console (a bad Twilio credential now presents as a delivery failure, not silent skip) and check the Vercel Observability → Cron Jobs run history for the `morning-digest` cron the next time it's due.

**Files changed:** none (env var / deployment config fix only, no code changes).

---

## Session: 2026-06-29 — Fix Twilio SMS webhook blocked by auth middleware

**Problem:** Inbound SMS messages to Cael were silently dropped. The auth middleware was intercepting `POST /eve/v1/twilio/messages` and returning 401 (previously 302) because Twilio doesn't send a session cookie.

**Fix:** Added `/eve/v1/twilio/` to the middleware allowlist in `middleware.ts`, matching the existing `/eve/v1/health` bypass. Eve validates Twilio's HMAC signature itself — no cookie auth needed on this path.

**Files changed:**
- `middleware.ts` — added `pathname.startsWith("/eve/v1/twilio/")` to the bypass list

**Verification:** After deploy, `POST /eve/v1/twilio/messages` with a fake payload returns 401 (eve's own signature check) instead of 302/redirect — meaning the request now reaches eve.

**Deployed:** `focuspoint-mfuf812x2-bertmill19s-projects.vercel.app` (production)

---

## Session: 2026-06-29 (LinkedIn posting tool)

### Added: Cael can post text + images to LinkedIn

**New files:**

| File | Purpose |
|---|---|
| `lib/linkedin-api.ts` | LinkedIn REST API v2 helper — text posts and 3-step image upload (initialize → PUT bytes → post with asset URN) |
| `agent/tools/post_linkedin.ts` | Eve tool: `post_linkedin` — text (required, ≤3000 chars) + optional `image_url`. Cael confirms before posting. |
| `app/api/upload/route.ts` | Next.js route: `POST /api/upload` — accepts multipart image, stores in Vercel Blob, returns public URL |

**Dependency added:** `@vercel/blob@^2.5.0`

**Env vars needed (not yet set):**
- `LINKEDIN_ACCESS_TOKEN` — LinkedIn OAuth 2.0 bearer token (valid ~60 days). Obtain via LinkedIn developer portal or OAuth flow.
- `LINKEDIN_PERSON_URN` — user's LinkedIn person URN, format `urn:li:person:XXXXX`. Find in LinkedIn API response or developer tools.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token. Run `vercel env pull` after enabling Blob storage in Vercel dashboard.

**Workflow:** User uploads an image via `POST /api/upload` → gets a Blob URL → tells Cael "post to LinkedIn with [text] and the image at [url]". Cael calls `post_linkedin` tool.

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (digest outputs only the SMS body)

### Fixed: scheduled digest no longer wraps the SMS in chatter

**Bug:** In the cron, Cael's reply IS the auto-sent SMS, but it was wrapping the
digest in "Here's your digest, ready to send… want me to send this as an SMS?
confirm your number" plus trailing notes — all of which landed in the actual text.

**Fix:** `agent/schedules/morning-digest.ts` — added an explicit instruction that
the entire reply is sent directly as the text (no review/send step), so output
ONLY the finished digest: no preamble, no `---` fences, no "send it?" questions,
no notes about missing tools/memory.

**Verified earlier:** a dev dispatch produced the new multi-line format (AI
headline + link + emojis + TODAY section) and Twilio delivered it.

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (morning digest SMS formatting)

### Reworked the digest prompt for phone-friendly formatting

**Goal:** Make the daily SMS multi-line, scannable, with a link and tasteful emojis.

**Changes:**

| File | Change |
|---|---|
| `agent/schedules/morning-digest.ts` | Rewrote the prompt with explicit SMS formatting rules: plain text only (SMS renders no markdown — no `*`/`**`/`#`; use CAPS or an emoji for emphasis), multi-line with blank lines between sections (joined with `\n`), include the AINews issue link on its own line, 2-4 tasteful emojis max (≤1 per line), TODAY section with 1-3 focus items, warm open/close. Quietly skip calendar if the tool isn't connected. |

**Note on bold:** SMS/iMessage do **not** render markdown or rich text, so true
bold isn't possible without ugly Unicode-math hacks. Emphasis via CAPS/emoji instead.

**Verified:** earlier this session a manual dev dispatch generated and Twilio
**delivered** the digest (AI headline + focus) to the user's number.

**Open:** calendar reading needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
`GOOGLE_REFRESH_TOKEN` (not yet set) — the tool exists but can't auth until then.

**Typecheck:** PASS ✓

---

### 2026-06-28 — Chat threads persisted to Neon Postgres ✓

**Problem:** Chats weren't surviving page refreshes. The `localStorage`-based thread store silently failed when the `events` JSON exceeded the 5 MB browser quota, and `onFinish` only fires after a full turn completes (mid-stream reload = lost chat).

**Solution:** Moved thread storage to Neon Postgres.

| File | Change |
|---|---|
| `lib/db.ts` | Added `threads` table to `ensureSchema` (id TEXT, title, session JSONB, events JSONB, created_at, updated_at) |
| `app/api/threads/route.ts` | GET (list all) + POST (create) |
| `app/api/threads/[id]/route.ts` | GET, PATCH (snapshot + rename), DELETE |
| `app/_components/threads-provider.tsx` | Replaced localStorage with API calls; loads on mount, saves snapshot via PATCH |

**Migration:** `threads` table created in Neon directly via migration script.

**Typecheck:** PASS ✓

---

## 2026-06-28 — Add smile to Cael avatar

Added a mouth/smile shape to `public/cael-avatar.json`. New layer `ind:3` (nm: "smile") inserted between the two eye layers and the highlight: a bezier arc path centered at (100, 108) in the 200×200 canvas with two anchor points at (−12, 0) and (12, 0), tangent handles curving downward by 7 units to form a U-shaped arc. Rendered as a white stroke (`w: 6`, rounded line caps) at 85% opacity — no fill. Layer order (first=top): right eye → left eye → smile → highlight → orb → glow. Renumbered existing layer `ind` values to stay unique (5, 6, 7).

**Files changed:** `public/cael-avatar.json`
**Commit:** bc3d4fb

---

## 2026-06-28 — Add nightly dreaming cycle for Cael

Implemented agent dreaming — a nightly cron that consolidates the user's recent thoughts and todos into structured patterns and insights that Cael loads at the start of each session.

**What was built:**
- **`app/api/dream/route.ts`** — Vercel Cron endpoint (runs 8 AM UTC daily). Pulls last 30 days of thoughts + todos from Neon Postgres, calls Claude via AI SDK to find recurring themes, patterns, and insights, writes a structured report to the `dreams` table.
- **`lib/db.ts`** — Added `dreams` table with `summary`, `patterns` (JSONB), `insights` (TEXT[]), and metadata fields.
- **`agent/tools/get_dream_summary.ts`** — Tool for Cael to fetch the latest dream report at session start.
- **`vercel.json`** — Added `crons` config: `/api/dream` runs on `0 8 * * *` (8 AM UTC = 3 AM ET).
- **`agent/instructions.md`** — Told Cael to call `get_dream_summary` at session start and weave insights naturally into guidance.

**How it works:**
1. Cron fires nightly, reads up to 200 thoughts + 100 todos from the last 30 days
2. Claude analyzes for recurring themes (e.g. "flow + coding + exercise appear together"), scores by frequency, and writes specific insights
3. Report stored in `dreams` table
4. Next session: Cael calls `get_dream_summary` and references patterns proactively

**Required env var:** `CRON_SECRET` — Vercel sets this automatically; the cron route validates it to block unauthorized triggers.

**Next steps:** Run `ensureSchema()` once to create the `dreams` table (or deploy and let the cron route call it on first run). Could add a `/api/dream?manual=true` path for triggering manually during dev.

---

## 2026-06-28 — Fix notes overflow on mobile

Note cards and the tag filter bar overflowed the viewport horizontally on mobile. Three fixes in `app/_components/dashboard.tsx`:
- Added `overflow-x-hidden` to the notes TabsContent so content can't scroll past the container
- Added `overflow-hidden` to each note Card so long content is clipped within the card
- Added `flex-wrap` to the per-card tags row (timestamp + tag chips) and `shrink-0` to the timestamp, so tags wrap to the next line instead of running off screen
- Added `break-words` to the note text `<p>` for long-word wrapping

---

## 2026-06-28 — Add X (Twitter) post_tweet tool

Added a `post_tweet` tool so the agent can post tweets on the user's behalf.

**Implementation:**
- OAuth 1.0a signing implemented from scratch using Node's built-in `crypto` (no extra deps). Builds the HMAC-SHA1 signature over the base string, constructs the `Authorization: OAuth ...` header, and POSTs to `https://api.twitter.com/2/tweets`.
- Tool description instructs the agent to confirm tweet text with the user before posting.
- Missing credentials return a helpful error rather than throwing.

**Files changed:**
- `agent/tools/post_tweet.ts` — new tool
- `.env.local` — placeholder comments for X credential env vars

**Required env vars (get from developer.x.com):**
- `X_API_KEY`, `X_API_KEY_SECRET` (API Key / Secret)
- `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (Access Token / Secret — generate with "Read and Write" permissions)

**Next steps:** Fill in the four X env vars in `.env.local` and set them in Vercel dashboard (or via `vercel env add`).

---

## 2026-06-28 — Fix sidebar title not appearing until agent finishes

**Problem:** Sending a message and immediately opening the chat history sidebar showed "New chat" instead of the derived title. The title was only set inside `onFinish`, which fires after the full agent response (30+ seconds). Users who opened the sidebar during or right after streaming never saw the title update (even though it was correctly persisted once the agent finished).

**Fix:** Added a `useEffect` in `AgentChat` that watches `agent.data.messages`. As soon as eve's optimistic user-message update hits (which happens synchronously on send, ~0ms), the effect derives the title from the first user message and calls `rename(threadId, ...)`. This sets the sidebar title within 500ms of sending. The `onFinish` path still runs and handles full snapshot persistence (session cursor + events) — it just no longer needs to be the source of truth for the title.

Also exported `deriveTitle` from `threads-provider.tsx` so `agent-chat.tsx` can truncate consistently.

**Files changed:**
- `app/_components/agent-chat.tsx` — added `useEffect` for early title set; removed debug `console.log`
- `app/_components/threads-provider.tsx` — exported `deriveTitle`

---

## Session: 2026-06-28 — Image paste UI fix

### Problem
Pasted images showed as `[file: image/png (image/png)]` text inside the sent-message bubble. First fix attempt (suppressing `File` in `MessagePrimitive.Parts`) didn't work because the text was in the **text part** itself — eve's `summarizeUserContent` serializes file attachments into the user message text string before sending to the server.

### Fix (final)
1. **`hooks/use-eve-runtime.ts`** — added `stripEveAttachmentMarkers()` which strips `\n[file: ...]` and `\n[image: ...]` patterns from user message text parts during `convertEvePart`. Role is threaded through from `convertEveMessage` so this only runs on user messages.
2. **`components/assistant-ui/attachment.tsx`** — Added `MessageImageAttachment` component. In message context, image attachments now render as a proper inline `<img>` (`max-w-[240px] max-h-[300px] rounded-2xl`) for when the attachment is still live in memory (optimistic/new messages).

---

## Session: 2026-06-28 (assistant-ui skill installed)

### Added the assistant-ui router skill via the skills CLI

Installed from the `assistant-ui/skills` catalog. Kept only the top-level **router** skill (`assistant-ui`) — `agent/skills/` is eve's runtime skill dir, so everything there is advertised to the live agent.

| File | Change |
|---|---|
| `agent/skills/assistant-ui/SKILL.md` | Router skill — assistant-ui architecture/runtime/primitives overview |
| `agent/skills/assistant-ui/references/architecture.md` | Bundled reference |
| `agent/skills/assistant-ui/references/packages.md` | Bundled reference |
| `skills-lock.json` | Added `assistant-ui` entry |

---

## 2026-06-28 — Fix image paste support

**What:** Pasting images into Cael chat was throwing "Unsupported message part type 'image'" from the eve framework.

**Fix:** In `hooks/use-eve-runtime.ts`, converted `type:"image"` attachment parts to `type:"file"` with the extracted media type (e.g. `image/png`) before sending to eve. Eve only accepts `text` and `file` part types; it rejects `image`.

**Files changed:** `hooks/use-eve-runtime.ts`, `next-env.d.ts` (auto-updated by Next.js dev server)

---

## Session: 2026-06-28 (Slack channel)

### Added Cael to Slack via Vercel Connect

**What:** Wired up `agent/channels/slack.ts` so Cael responds to `@mentions` and DMs in Slack. Restricted to owner only (Slack user `U0AP776N28L`) — all other users are silently dropped.

**Files changed:**
- `agent/channels/slack.ts` — new channel file with `onAppMention` / `onDirectMessage` owner guard

**Setup performed:**
- Created Vercel Connect client `slack/cael-51b8` via `vercel connect create slack --triggers`
- Detached and re-attached with `--trigger-path /eve/v1/slack`
- Deployed to production

---

## Session: 2026-06-28 (Cael avatar — Lottie animation)

### Added animated Cael avatar to the Dashboard sidebar header

**What:** Generated a Lottie animation for Cael using the diffusionstudio/lottie text-to-lottie skill. The animation is a green orb with breathing scale, rotating partial arc ring, and inner highlight — 60-frame seamless loop at 30fps. Rendered in the sidebar header via `lottie-react`.

**Files changed:**
- `public/cael-avatar.json` — Lottie animation JSON (green orb character)
- `app/_components/cael-avatar.tsx` — renders the Lottie animation via `lottie-react`
- `app/_components/dashboard.tsx` — avatar added to sidebar header alongside "Cael" title
- `package.json` — added `lottie-react` (and `@rive-app/react-canvas`, unused now)

**Files changed:**
- `app/_components/cael-avatar.tsx` — new component with CSS placeholder + Rive loader
- `app/_components/dashboard.tsx` — avatar added to sidebar header alongside "Cael" title
- `package.json` — added `@rive-app/react-canvas`

**Next steps for real character art:**
1. Generate character art (Midjourney / DALL-E / Firefly)
2. Import into [rive.app](https://rive.app), rig with idle + a few states, name the state machine `Cael_Machine`
3. Export as `cael.riv` → drop into `/public/cael.riv`
4. Avatar automatically switches from placeholder to real animation

---

## Session: 2026-06-28 (Slack channel — Cael in the workspace)

### Added a Slack surface so Cael answers @mentions and DMs in Slack

**Why:** Wanted Cael reachable where work happens, not just SMS.

**How:** eve's `slackChannel` with credentials via **Vercel Connect** — no
`SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` to manage. Connect handles the
outbound bot token (`getToken` per inbound webhook) and inbound webhook
verification (Vercel OIDC).

**New file:** `agent/channels/slack.ts` — `slackChannel({ credentials:
connectSlackCredentials("slack/cael"), threadContext: { since:
"last-agent-reply" } })`. (`@vercel/connect@0.2.2` was already a dep.)

**Connect setup (one-time):**
1. `FF_CONNECT_ENABLED=1 vercel connect create slack --triggers --name cael`
   → browser flow installed the managed Slack app; connector
   `slack/cael` (id `scl_Nhn768M88TVntggLtJ7YQ`).
2. `vercel connect detach slack/cael --yes` then
   `vercel connect attach slack/cael --triggers --trigger-path /eve/v1/slack --yes`
   — re-points the trigger at eve's route (eve doesn't serve Connect's default path).

**Deploy:** committed `slack.ts` to `main` and let the git production build ship
it (a one-off `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1 vercel deploy --prod` got
superseded by concurrent git deploys — committing is what makes it stick).

**Verified:** `POST /eve/v1/slack` on the prod alias `focuspoint-sigma.vercel.app`
returns **401** (route mounted + verifying signatures), matching the healthy
Twilio route. Also confirmed inbound Twilio route is reachable there (401, not the
SSO 302 seen on per-deployment `*.vercel.app` URLs — Deployment Protection only
gates the generated URLs, not the prod alias).

**Still verify by hand:** in Slack, `/invite @cael` to a channel then
`@cael what's on my todo list?`, or DM the Cael app. If DMs or thread context
don't respond, the managed Connect Slack app may need extra scopes
(`im:history`, `channels:history`) + reinstall.

---

## Session: 2026-06-28 (in-chat calendar widget)

### Calendar results render as a visual agenda card in chat

**Goal:** When the user asks about their calendar, show a little visual schedule
widget in the chat instead of plain text.

**How:** assistant-ui generative tool UI. The Thread already renders
`part.toolUI ?? <ToolFallback>`, and assistant-ui populates `part.toolUI` when a
tool UI is registered for that tool name.

**Changes:**

| File | Change |
|---|---|
| `components/assistant-ui/calendar-tool-ui.tsx` | New. `makeAssistantToolUI({ toolName: "list_calendar_events" })` renders an agenda card: date header, per-event rows (time column, status dot, title, time range, location), plus loading-shimmer and empty ("clear day") states. |
| `app/_components/agent-chat.tsx` | Mounts `<CalendarToolUI />` inside `AssistantRuntimeProvider` so it registers. |
| `agent/tools/list_calendar_events.ts` | Removed `toModelOutput` so the **full** `{ success, range, count, events }` object flows to the part output (the eve→assistant-ui adapter maps `part.output` → tool `result`; with a `toModelOutput` the widget would only get the model-facing text). Added `range` for a reliable date header. |

**Data-path note:** `hooks/use-eve-runtime.ts` sets `result: part.output`. eve's
`dynamic-tool` part `output` is the model-facing output, so a tool needs to emit
its structured shape as the actual output (no `toModelOutput`) for a widget to
read it. The model reads the JSON fine.

**Typecheck:** PASS ✓ · **eve info:** 0 errors, 0 warnings.

**Next:** restart dev server, ask "what's on my calendar today?" — the agenda
card should render. (Dashboard always-on panel was the other option; deferred.)

---

## Session: 2026-06-28 (agent knows the date)

### Fixed: Cael was guessing the date (queried 2025-07-14 for "events today")

**Problem:** The model has no reliable sense of the current date, so calendar
queries used a hallucinated date and returned nothing.

**Changes:**

| File | Change |
|---|---|
| `agent/lib/now.ts` | New. Timezone-aware helpers from the server clock: `todayISO()`, `nowHuman()`, and `zonedDayBounds()` (RFC3339 day bounds anchored to the configured TZ offset — correct in local TZ and in UTC on Vercel). Single source of `TIME_ZONE`. |
| `agent/instructions/current-date.ts` | New. Dynamic instructions (`defineInstructions` on `turn.started`) that inject the real date/time every turn so the model never guesses. Coexists with the static `instructions.md` (eve discovery: 0 errors/0 warnings). |
| `agent/tools/list_calendar_events.ts` | `start_date` now optional → defaults to today (server). Range bounds use `zonedDayBounds` so the day window is timezone-correct everywhere. |
| `agent/lib/google-calendar.ts` | Imports `TIME_ZONE` from `now.ts` (was a duplicate local const). |

**Verified:** helper output is correct (`todayISO`→`2026-06-28`, bounds at
`-04:00`). Calendar read was already confirmed live end-to-end earlier this day.

**Note:** Vercel deploy still needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_REFRESH_TOKEN` set in project env for the morning-digest cron.

**Typecheck:** PASS ✓ (after refreshing local node_modules; `next-themes` /
`sonner` are declared in package.json and resolve on a clean install.)

---

## Session: 2026-06-28 (semantic memory upgrade + tag-filtered search)

### Moved semantic search to stored pgvector embeddings; gave the agent semantic recall; made tag + meaning search compose

**Research first (Vercel/Neon/AI SDK docs):** Confirmed the best-practice approach is to **store** a `vector` column and query with pgvector's `<=>` cosine operator (pgvector is free on Neon, no setup), embed **once at write-time** rather than re-embedding all notes per request, use the AI SDK's `embed`/`embedMany` + `cosineSimilarity`, and add an HNSW index only past ~10k–50k notes. Adopted this over the earlier on-the-fly approach.

**Changes:**

| File | Change |
|---|---|
| `lib/embeddings.ts` | New shared helper: `embedText`/`embedTexts` (AI SDK `embed`/`embedMany` through the Vercel AI Gateway, `text-embedding-3-small`, 1536 dims) + `toVectorLiteral` for pgvector SQL. |
| `lib/db.ts` | `ensureSchema()` enables `vector` extension + adds `thoughts.embedding vector(1536)`. |
| `agent/tools/capture_thought.ts` | Embeds note content at write-time (best-effort; capture never fails on gateway error). |
| `app/api/thoughts/[id]/route.ts` | PATCH re-embeds on content edit so search stays in sync. |
| `agent/tools/search_memory.ts` | **Cael now recalls by meaning** — semantic pgvector query, with an ILIKE keyword fallback when embeddings are absent/unavailable. |
| `app/api/thoughts/semantic-search/route.ts` | Rewritten to query the stored embeddings via `<=>` (no per-request re-embedding). Accepts `?tag=` to compose tag + semantic search. |
| `app/_components/dashboard.tsx` | Tag filter bar now stays active during semantic search and passes the selected tag to the API, so you can search "about X" within a tag. |

**Migration:** Applied `CREATE EXTENSION vector` + the column to the live Neon DB and backfilled embeddings for existing notes.

**Verified:** Typecheck PASS ✓. Live pgvector query sanity-checked — "how should I treat other people" ranks the relationships/philosophy notes top, work note bottom; `?tag=philosophy` correctly narrows.

**Note:** Backend pieces above were committed in `5d1180e` (landed by a concurrent session); this entry documents the full feature + the dashboard tag-filter wiring.

---

## Session: 2026-06-28 (emerald theme actually shows on active states)

### Wired the dashboard/nav active states to the `primary` token

**Why:** After tinting the theme tokens emerald, the app still looked grey —
because the hand-rolled buttons/pills/tabs in the dashboard hardcoded
`bg-foreground`/`border-foreground`/`text-foreground` (near-black) for their
active/primary state instead of the semantic `primary` token. The new emerald
`--primary` never reached them. (shadcn primitives like the chat send button use
`variant="default"` → `bg-primary`, so they picked up emerald automatically; only
the custom markup was bypassing it.)

**Changes:**

| File | Change |
|---|---|
| `app/_components/dashboard.tsx` | Active Tasks/Notes tab underline + label, the quick-add submit button, the "All" + tag filter pills (and inline note tags), and the Save button now use `bg-primary`/`text-primary-foreground`/`border-primary`/`text-primary` instead of `*-foreground`. Todo checkbox hover border + tick now tint with `primary`. Kept `text-red-500` for high-priority (urgency semantics). |
| `app/page.tsx` | Bottom-nav active item: `text-foreground` → `text-primary` (active Chat/Tasks/Notes icon now emerald). |

**Typecheck:** PASS ✓

---

## Session: 2026-06-28 (fix: inbound SMS silently dropped)

### Texting Cael got no reply — `TWILIO_ALLOW_FROM` was malformed

**Symptom:** Outbound worked (morning digest delivered), but texting the agent
("What are my notes") never got a reply.

**Root cause:** eve's `twilioChannel` gates every inbound SMS against
`allowFrom` (`agent/channels/twilio.ts` → `process.env.TWILIO_ALLOW_FROM`).
The value was `+5199908727` — missing the leading `1` after the `+` (a
transposed/dropped digit). The real sender is `+15199908727` (= `MY_PHONE_NUMBER`),
so the allowlist never matched and eve dropped the message **before the agent ran**.
Outbound is unaffected because that path doesn't consult `allowFrom`.

**Fix:** Corrected `TWILIO_ALLOW_FROM` to `+15199908727` in both `.env.local`
and Vercel **Production**, then **redeployed production** (env changes only apply
to new deployments).

**No code change** — config only. iMessage itself is not used; this is Twilio SMS
(green bubble in the screenshot = SMS, as expected).

**Still verify by hand:** text the Twilio number `+17093703880` from `+15199908727`
and confirm a reply. If still silent, check the Twilio console Messaging webhook
points at `https://<prod-domain>/eve/v1/twilio/messages`.

---

## Session: 2026-06-28 (emerald/teal theme)

### Added a subtle emerald/teal color palette to replace the all-grey theme

**Why:** The UI was fully neutral — every semantic token had zero chroma (pure
grey/black). User wanted to "spice it up" without losing shadcn's polish.

**How:** Tinted only the CSS variables in `app/globals.css` — no component
changes. Color (emerald/teal, oklch hue ~163–165) lives on the interactive
tokens (`primary`, `accent`, `ring`, `secondary`) plus a barely-perceptible mint
tint on `background`/`muted`/`border`. Cards/popovers stay pure white so they
still pop. Both light and dark modes updated. Because every component uses
semantic tokens, the palette flows through automatically (buttons, send button,
active nav, focus rings, badges, hover states).

**Intensity:** "Subtle & tasteful" — color concentrated on interactive elements,
background tint minimal.

**Files changed:** `app/globals.css` (`:root` light + `prefers-color-scheme: dark`).

**Left as-is:** Code-block syntax highlighting in
`components/assistant-ui/markdown-text.tsx` (One Dark `#21252b`/`#282c34`) —
intentional, not part of the theme system.

---

## Session: 2026-06-28 (multi-thread chat history)

### Built conversation history: multiple threads, switch / new / rename / delete

**Why:** eve sessions are single-per-mount and there's no server "list my
sessions" API, so multi-thread had to be an **app-owned registry** with the eve
agent **remounted per thread**. Used Option A from the spec — cache each thread's
event log client-side and seed `initialEvents` to rehydrate the transcript;
`SessionState` (the eve cursor) is the durable key the next turn resumes from.

**New / changed files:**

| File | Change |
|---|---|
| `app/_components/threads-provider.tsx` | New. Context store owning the thread list + `activeId`, persisted to `localStorage` (`cael.threads.v1`). CRUD: `newThread` / `switchTo` / `rename` / `remove` / `saveSnapshot`. Prunes empty threads, derives titles from the first user message, handles quota errors (prune oldest + retry), and seeds a fresh thread when storage is empty/corrupt. Event/session types derived from `UseEveAgentSnapshot` to avoid deep eve imports. |
| `app/_components/chat-sidebar.tsx` | New. Provider-backed sidebar (date-grouped Today/Yesterday/Earlier), new-chat button, per-item switch + inline rename + delete. Mirrors the old assistant-ui thread-list styling. |
| `app/_components/agent-chat.tsx` | Takes `threadId`; passes `initialSession` / `initialEvents` to `useEveAgent` and persists `session` + `events` (+ derived title) in `onFinish`. Added a mobile chat-history overlay (toggle in the header). |
| `app/page.tsx` | Wrapped in `<ThreadsProvider>`; desktop chat-history rail (lg+) left of the chat; `<AgentChat key={activeId}>` so switching remounts the eve agent onto the selected session. Gated on `hydrated` to avoid mounting before localStorage loads. |
| `components/assistant-ui/thread-list.tsx` | Deleted. Runtime-bound (`useAuiState(s.threads)`) so it can't drive eve's per-mount session model; replaced by the provider-backed `ChatSidebar`. |

**Architecture:** app-owned registry → `key={activeId}` remounts the agent on
switch → sidebar lives in the provider (outside the keyed subtree) so it doesn't
remount/flash. Switching threads = remount with that thread's
`initialSession`/`initialEvents`.

**Validation:** `npm run typecheck` PASS. ⚠️ Production build can't run inside the
worktree (no local `node_modules`; `globals.css`'s relative `tw-shimmer` import
won't resolve) — built in the main checkout post-merge instead. **Still needs
interactive/browser verification** (I can't launch a browser here): confirm a
reopened thread replays its transcript AND the next turn continues the same
server session (model sees prior context). This is the one unverified assumption
behind Option A.

**Deferred:** archive (delete only for v1); moving the registry from localStorage
to a Neon `threads` table if transcripts outgrow the ~5MB cap.

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

## Session: 2026-06-28 (shadcn/ui audit — 10 upgrades)

### Audited the UI against current shadcn/ui and implemented 10 improvements

**Goal:** The app installed shadcn primitives but barely used them — most of the dashboard was raw HTML elements. Adopt the real components + newer shadcn capabilities.

**Components added:** `card`, `alert-dialog`, `sonner`, `tabs`, `empty` (via `npx shadcn add`). `badge`/`skeleton` already existed. Deps `sonner` + `next-themes` pulled in by the CLI.

**Changes:**

| # | Item | File(s) | Change |
|---|---|---|---|
| 1 | Use installed primitives | `dashboard.tsx` | Quick-add → `Input`+`Button`; edit box → `Textarea`; Save/Cancel/edit/delete → `Button` variants |
| 2 | Cards for notes | `dashboard.tsx` | Notes list items → compact `Card` (replaces hand-rolled bordered `<li>`) |
| 3 | Destructive confirm | `dashboard.tsx` | Note delete now goes through `AlertDialog` (was a silent immediate delete) |
| 4 | Toast feedback | `layout.tsx`, `dashboard.tsx` | Added `<Toaster>`; add/complete/edit/delete now toast on failure + optimistic rollback (previously a silent `catch {}`) |
| 5 | Real Tabs | `dashboard.tsx` | Hand-rolled Tasks/Notes tab bar → `Tabs` with `variant="line"` (keeps the underline look, gains keyboard a11y) |
| 6 | Skeleton component | `dashboard.tsx` | `animate-pulse` divs → installed `Skeleton` |
| 7 | Empty component | `dashboard.tsx` | All empty states → `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` |
| 8 | Tokenized priority + Badge | `globals.css`, `dashboard.tsx` | Added `--priority-high` token (replaces raw `text-red-500`); high-priority marker + all tag pills → `Badge` |
| 9 | Theme toggle | `globals.css`, `layout.tsx`, `theme-provider.tsx`, `mode-toggle.tsx` | Switched dark mode from `@media (prefers-color-scheme)` to `.dark` class; added `next-themes` `ThemeProvider` (system default) + a sun/moon `ModeToggle` in the dashboard header |
| 10 | Namespaced registries | `components.json` | Registered `ai-elements` + `v0` registries so future `add @ai-elements/x` / `@v0/x` work |

**Decisions:**
- Tabs use the `line` variant to preserve the existing underline aesthetic rather than the default segmented pill.
- Notes `Card`s use `gap-0`/`shadow-none` + tight padding so the Card primitive matches the prior compact density (avoids the default roomy `py-6`).
- Dark mode is now class-based (required for a manual toggle); `next-themes` injects the pre-paint script so there's no FOUC. `suppressHydrationWarning` added to `<html>`.
- Toasts only fire on error (success is implied by optimistic UI), except delete which confirms success.
- Left the mobile bottom-nav as a custom tab bar (legit pattern) and `--priority-high` as a dedicated token rather than overloading `destructive`.
- **#10 note:** authoring a shareable design-system *preset* is a `shadcn/create` web step (not done here); the registries wiring is the code-side portion. Use `npx shadcn docs <component>` before composing new UI.

**Validation:** `npm run typecheck` ✓ and `npm run build` ✓.

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

---

## 2026-06-28 — GitHub OpenAPI connection

**What was built:**
Added `agent/connections/github.ts` — an eve OpenAPI connection that gives Cael read/write access to the bertovmill/focuspoint GitHub repo using the GitHub REST API.

**Files changed:**
- `agent/connections/github.ts` — new file; `defineOpenAPIConnection` pointed at GitHub's OpenAPI spec with PAT auth and `once()` approval gate for writes
- `agent/instructions.md` — added GitHub to Cael's capabilities list

**Decisions:**
- Used OpenAPI connection (not MCP) to avoid requiring a GitHub Copilot subscription
- `approval: once()` means Cael asks the user once per session before making any write (commit, PR, file edit)
- Auth via `GITHUB_TOKEN` env var (fine-grained PAT with Contents + Pull requests read/write on bertovmill/focuspoint)

**Typecheck:** PASS ✓

**Next steps:**
- Add `GITHUB_TOKEN` to Vercel env for production: `vercel env add GITHUB_TOKEN`

---

## 2026-07-02 — Mobile chat sidebar: New chat button in header

**What was built:**
Added a "New chat" (+) icon button to the header of the mobile chat-history overlay (the "Chats" panel that slides in from the left on mobile), next to the existing close (X) button.

**Files changed:**
- `app/_components/agent-chat.tsx` — destructured `newThread` from `useThreads()`; added a `PlusIcon` button in the mobile overlay header (`historyOpen` block) that calls `newThread()` and closes the overlay.

**Decisions:**
- Reused the existing `newThread` from `useThreads()` (same handler `ChatSidebar`'s pinned bottom pill already uses) rather than adding new state/logic.
- Placed it in the panel header (top) rather than relying solely on the bottom pinned pill, per user request for quicker access at the top of the expanded mobile sidebar.

**Typecheck:** PASS ✓

---

## 2026-07-12 — Edit todos inline in the dashboard UI

**What was built:**
Tasks in the Tasks tab could previously only be created or deleted from the UI (edits required going through Cael). Added an inline edit mode: a pencil icon (next to delete, shown on hover) opens an inline form to edit title, priority, due date, and recurrence directly on the task list.

**Files changed:**
- `app/api/todos/[id]/route.ts` — added `PATCH` handler; updates title/priority/recurrence via COALESCE, and due_date explicitly (including clearing it to null) only when the key is present in the request body.
- `app/_components/dashboard.tsx` — added edit state (`editingTodoId`, `editTodoTitle/Priority/DueDate/Recurrence`), `startEditTodo`/`cancelEditTodo`/`saveEditTodo` handlers with optimistic update + rollback on failure, and inline edit markup mirroring the existing notes edit UX (badges for priority/recurrence, date input, Save/Cancel buttons).

**Decisions:**
- Reused the agent-side `update_todo` tool's semantics (COALESCE for optional fields) in the new PATCH route, but handled `due_date` specially so it can be cleared (set to null) rather than only ever COALESCEd.
- Matched the existing inline-edit pattern used for notes (Textarea + Save/Cancel) instead of a modal, for UI consistency.

**Typecheck:** PASS ✓

---

## 2026-07-12 — Unify all scheduled tasks into the editable DB-backed system

**What was built:**
The Scheduled Tasks tab had two disconnected systems: three hardcoded "Automated" jobs (Dream Analysis, Daily Tweet, Morning Digest) defined in `dashboard.tsx`/`agent/schedules/*.ts` with no edit UI, and a separate "Custom" section (`ScheduledTasksPanel`) backed by the `scheduled_tasks` DB table with full create/edit/pause/delete. Migrated the three built-in jobs into the DB-backed system so every scheduled task — built-in or user/Cael-created — is now editable, pausable, and deletable from one place, and all can be run immediately via a new "Run now" button that plays the task's prompt live in the Cael chat (reusing the existing `onRunJobWithChat` wiring).

**Files changed:**
- `agent/tools/save_dream.ts` (new) — lets Cael write a structured dream report (summary, patterns, insights, counts) to the `dreams` table from a prompt-based run, since Dream Analysis no longer runs as direct code that writes there itself.
- Seeded 3 rows into `scheduled_tasks` (ids 4-6: Dream Analysis `0 8 * * *` notify=false, Daily Tweet `0 12 * * *` notify=false, Morning Digest `0 12 * * *` notify=true) via a one-off script against the shared Neon DB — prompts adapted from the old hardcoded `agentMessage`/schedule-file text, now executed by Cael via `list_notes`/`post_tweet`/`save_dream`/etc. through the existing minute-level `agent/schedules/dispatcher.ts`.
- Deleted `agent/schedules/daily-tweet.ts` and `agent/schedules/morning-digest.ts` (superseded by the DB rows + dispatcher — kept both firing would have double-run them).
- Deleted `app/api/daily-tweet/` and `app/api/morning-digest/` routes (only used by the removed hardcoded UI). Kept `app/api/dream/route.ts` since the Dreams tab's own manual "Run dream now" button still calls it directly.
- Removed the Vercel cron entry for `/api/dream` in `vercel.json` (automatic dream analysis now runs via the dispatcher-owned DB row instead, to avoid a duplicate daily run).
- `app/_components/dashboard.tsx` — removed the `CRON_JOBS` array, `handleRunJob`, `runningJob`/`expandedJob` state, and the "Automated" card UI; the Scheduled Tasks tab now renders only `<ScheduledTasksPanel onRunNow={onRunJobWithChat} />`.
- `app/_components/scheduled-tasks-panel.tsx` — added an optional `onRunNow` prop and a "Run now" (play icon) button per task, next to the pause/edit/delete controls.
- `agent/instructions.md` — updated the scheduled-tasks and dreaming sections to reflect that Dream Analysis/Daily Tweet/Morning Digest are now ordinary editable rows, and that Cael should call the new `save_dream` tool when the Dream Analysis task fires.

**Decisions:**
- Kept Dream Analysis's underlying capability (writing structured data to the `dreams` table for the Dreams tab) by giving Cael a `save_dream` tool, rather than downgrading it to writing plain notes — preserves the Dreams tab UX per user's explicit choice.
- Converted Daily Tweet to run through Cael's existing `post_tweet` tool (via a chat-driven prompt) instead of its old direct `lib/x-api.ts` code path, per user's explicit choice — same generation logic, now routed through the agent loop like every other scheduled task.
- Left the Dreams tab's manual "Run dream now" button and its `/api/dream` POST route untouched — that's a separate, already-working manual trigger unrelated to the automatic-firing migration.

**Typecheck:** PASS ✓ · **Build:** PASS ✓

---

## 2026-07-12 — Temporarily disable per-minute scheduled-tasks dispatcher (Vercel Hobby cron limit)

**What was built:**
Nothing feature-wise. Production deploys were failing with: "Hobby accounts are limited to daily cron jobs. This cron expression (* * * * *) would run more than once per day." The scheduled-tasks dispatcher (`agent/schedules/dispatcher.ts`) wakes every minute to check for due application-managed tasks, but eve compiles every `defineSchedule` into a native Vercel Cron Job, and Vercel Hobby only allows daily-cadence crons in production (confirmed against eve's docs — no built-in bypass).

Moved `agent/schedules/dispatcher.ts` to `agent/schedules-disabled/dispatcher.ts` so eve stops discovering/registering it, unblocking the production deploy. Left a comment at the top of the file explaining why and what to do next.

**Files changed:**
- `agent/schedules/dispatcher.ts` -> `agent/schedules-disabled/dispatcher.ts` (moved, not deleted; import paths unchanged since nesting depth under `agent/` is the same)

**Decisions:**
- Chose to move the file out of `agent/schedules/` rather than change its cron cadence, since a daily-only dispatcher would defeat the purpose of the DB-backed scheduled-tasks feature.
- Did not build the external-scheduler workaround (authenticated route + free external cron hitting it) in this session — flagged as the real fix to restore full functionality on the free Vercel plan.

**Next steps:**
- Either upgrade the Vercel project to Pro and move `dispatcher.ts` back to `agent/schedules/`, or build an authenticated HTTP route + external free scheduler (e.g. GitHub Actions cron, cron-job.org) to replace the Vercel-Cron-based dispatch so it works on Hobby.
- Until then, user-created "Scheduled Tasks" (the DB-backed custom cron rows) will not fire in production — only the app's remaining daily-cadence jobs work.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-12 — Daily section only shows tasks due today

**What was built:**
Dashboard's "Daily" recurring-todos section previously showed all `recurrence: "daily"` todos regardless of `due_date`. Since completing a daily todo immediately rolls its `due_date` forward to the next day (existing recurrence logic), the completed task would instantly reappear in the list as "tomorrow's task" instead of staying off the list until the next day — making it look like nothing was crossed off.

Added an `isToday(iso)` helper and filtered the Daily section so it only shows daily todos whose `due_date` is today (todos with no `due_date` still show, since they aren't date-scoped). Weekly/Monthly/Once sections unchanged.

**Files changed:**
- `app/_components/dashboard.tsx` — added `isToday()` helper; Daily section filter now requires `key !== "daily" || isToday(t.due_date)`.

**Typecheck:** PASS ✓

---

## 2026-07-12 — Add Journal Templates sidebar page

**What was built:**
New left-sidebar page, "Journal Templates," letting the user design their own custom journal templates (name + arbitrary ordered fields, each with a label and a type: short text, long text, number, date, or a 1–5 rating), then fill one out repeatedly with entries saved to Neon Postgres.

- `lib/db.ts` — added `journal_templates(id, name, fields JSONB, created_at)` and `journal_entries(id, template_id, data JSONB, created_at)` tables to `ensureSchema()`. Entry payload column is named `data` (not `values`) to avoid the SQL reserved keyword.
- `app/api/journal-templates/route.ts` + `[id]/route.ts` — list/create/delete templates.
- `app/api/journal-entries/route.ts` + `[id]/route.ts` — list entries for a template (`?template_id=`), create, delete.
- `app/_components/journal-templates-panel.tsx` — new self-contained panel (mirrors `scheduled-tasks-panel.tsx`'s pattern of owning its own fetch/state): a builder dialog for creating templates with dynamically added/removed fields, a template list, and a detail view that renders the fill-out form plus a history of past entries for that template.
- `app/_components/dashboard.tsx` — added `journal-templates` to `NAV_ITEMS` and the `activeTab` type union; renders `<JournalTemplatesPanel />` in its own tab panel.
- `app/page.tsx` — added `journal-templates` to `MobileTab`, wired into the mobile bottom-nav bar and the `Dashboard` `activeTab` prop mapping.

**Verification:** started a temp dev server, authenticated via the `cael_session` cookie (matches `BASIC_AUTH_PASSWORD`), and round-tripped a real template + entry through the new API routes against the Neon DB (create template → create entry → list back both → delete template), then cleaned up the test rows.

**Decisions:**
- Kept the panel fully self-contained (own state/fetching) rather than threading its state through `dashboard.tsx`, matching the existing `ScheduledTasksPanel` pattern — keeps the already-1300-line `dashboard.tsx` from growing further.
- Field values are keyed by a generated field id (not the label), so renaming a field label later doesn't orphan previously saved entry data.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-12 — Todos didn't show as crossed off when completed

**What was built:**
Berto reported that checking off a todo didn't visibly show as completed. The DB/API path (`app/api/todos/[id]/complete/route.ts`) was already correct — one-off todos get `completed = TRUE` + `completed_at = NOW()`, recurring todos get `due_date` bumped forward. The bug was purely visual: the todo `<li>` in `dashboard.tsx` had no completed-state styling at all (no checkmark, no strikethrough) — unlike the Content Ideas list, which already renders a check + `line-through` on completion. So the click had no visible feedback until the row silently disappeared/reset ~600ms later.

Added a `completingIds: Set<number>` state to `Dashboard`. `handleComplete` now adds the id to this set immediately; the todo row reads `isCompleting = completingIds.has(todo.id)` to show a filled checkmark circle, `line-through` + muted title text, and reduced row opacity — then the id is removed from the set (and the row filtered out or reset for recurring todos) once the API call settles, matching the existing Content Ideas UX pattern.

**Files changed:**
- `app/_components/dashboard.tsx` — added `completingIds` state; `handleComplete` tracks/clears it around the existing complete/recurring/error branches; todo `<li>` renders checkmark + strikethrough while `isCompleting`.

**Also:** created `/Users/bertomill/.claude/CLAUDE.md` (global, didn't exist before) per Berto's request — instructs future sessions to quiz him before non-trivial decisions rather than assuming silently.

**Typecheck:** PASS ✓

---

## 2026-07-12 — Show today's crossed-off Daily tasks

**What was built:**
Follow-up to the earlier Daily-section date filter: recurring daily todos previously had no persisted signal that they'd been completed *today* — the complete route only bumped `due_date` to tomorrow, never touching `completed`/`completed_at`. So a crossed-off daily task would just vanish from view instead of showing as done for the rest of the day.

- `app/api/todos/[id]/complete/route.ts` — the recurring branch now also sets `completed_at = NOW()` alongside bumping `due_date`, so there's a durable record of "done today" even though `completed` itself stays `false` for recurring tasks.
- `app/_components/dashboard.tsx`:
  - `Todo` interface gained `completed_at`; `isToday()` now accepts `null | undefined`.
  - Daily section filter now also matches todos whose `completed_at` is today (in addition to `due_date` being today), so completed-today items stay visible instead of disappearing the instant `due_date` rolls forward.
  - Added an `isDoneToday` flag per row (daily section, not currently mid-animation, `completed_at` is today) driving a persistent struck-through/checked visual + a "Done today" label in place of the due-date line, distinct from the transient `isCompleting` fade used for one-off task completion.
  - `handleComplete` now guards against re-completing an already-done-today recurring task (would otherwise bump `due_date` again), and optimistically sets `completed_at` on click so the UI updates immediately rather than waiting on the response.

**Verification:** used the already-running dev server on :3000 (didn't start a competing one — Next's dev lock correctly refused a second instance) to create a test daily todo, hit `/complete`, and confirmed via `/api/todos` that `completed_at` was set to now while `due_date` rolled to tomorrow. Cleaned up the test row after.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-12 — Fix: Daily section went empty (missed the agent's duplicate complete-todo logic)

**What happened:**
After the previous fix, the Daily section disappeared entirely for the user. Root cause: there are two separate places that mark a recurring todo complete — the REST route `app/api/todos/[id]/complete/route.ts` (used by the dashboard UI's checkbox) and `agent/tools/complete_todo.ts` (used when Cael marks a todo done via chat). The previous fix only updated the REST route to set `completed_at = NOW()`; the agent tool still only bumped `due_date` forward with no `completed_at`. The user had been checking off daily todos via chat with Cael, so all 7 daily todos had already rolled to tomorrow (`due_date` = 07-13) with `completed_at` still null — which matched neither "due today" nor "done today" in the new filter, so the whole Daily section rendered empty.

**Fix:**
- `agent/tools/complete_todo.ts` — recurring branch now also sets `completed_at = NOW()`, mirroring the REST route.
- Backfilled the 7 affected daily todos' `due_date` back to today (2026-07-12) via the REST PATCH endpoint so they reappear as active/uncompleted for today — there was no way to recover their true completion timestamp since the old code never recorded one, so they're restored to "not yet done today" rather than faked as "done today."

**Next steps:** none — both completion paths are now consistent.

**Typecheck:** PASS ✓

---

## 2026-07-12 — Fix: Daily task flickered/disappeared for a split-second when checked off

**What happened:**
User reported checking off a Daily task made it disappear for a split second before reappearing crossed-out — poor UX even though the end state was correct. Root cause: `handleComplete` optimistically set `completed: true` on click for *all* todos, including recurring ones. `activeTodos` filters on `!completed`, so for that ~600ms animation window the recurring todo was excluded from `activeTodos` (and therefore from the Daily section) entirely, then reappeared once the timeout flipped `completed` back to `false`.

**Fix:**
- `app/_components/dashboard.tsx` — `handleComplete` no longer flips `completed` for recurring todos at all; it only ever sets `completed_at`. Recurring todos stay in `activeTodos` continuously through the click, so the `isCompleting` fade (0–600ms) hands off directly to the persistent `isDoneToday` crossed-out state with no gap where the row disappears. Non-recurring (Once/Weekly/Monthly) todos are unaffected — they still flip `completed: true` and get removed after the fade, as intended.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-12 — Show everything crossed off today, not just Daily tasks

**What was built:**
Extended the "stays visible when checked off today" behavior from just the Daily section to Once/Weekly/Monthly too, since the user had checked off other (non-daily) tasks earlier the same day and couldn't see them anywhere.

- `app/api/todos/route.ts` — `GET` now supports `include_completed=today`, returning rows where `completed = FALSE OR completed_at::date = CURRENT_DATE` (in addition to the existing `true`/default modes). Keeps the payload small instead of pulling full completed history.
- `app/_components/dashboard.tsx`:
  - Dashboard now fetches `/api/todos?include_completed=today&limit=200` instead of the completed-excluded default, so today's completions survive the 15s poll instead of vanishing on the next refetch.
  - Added `visibleTodos`: active todos plus anything (any recurrence) completed today. Once/Weekly/Monthly sections now use this instead of only `activeTodos`, and the "All done" empty state check moved to `visibleTodos` too so a fully-checked-off-today list still renders its sections.
  - `isDoneToday` is no longer restricted to the Daily section — any todo with `completed_at` today shows the persistent crossed-out/"Done today" styling.
  - `handleComplete` simplified: guards on "already completed today" generally (not just for recurring); Once/Weekly/Monthly todos still flip `completed: true` on completion (matches backend), but are no longer removed from state immediately — they stay visible (crossed out) until `completed_at` is no longer today, at which point the next fetch naturally excludes them.

**Verification:** created a `recurrence: "none"` test todo against the running dev server, hit `/complete`, confirmed `?include_completed=today` returns it (crossed-off-today) while the plain `/api/todos` correctly excludes it. Cleaned up the test row after.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-12 — Allow un-checking a task crossed off today

**What was built:**
Tasks crossed off today (any recurrence) can now be un-checked, instead of the checkbox being permanently disabled once done.

- `app/api/todos/[id]/uncomplete/route.ts` — new route: for recurring todos, resets `due_date` to `CURRENT_DATE` and clears `completed_at` (undoing the forward roll from `/complete`); for once todos, sets `completed = FALSE` and clears `completed_at`.
- `app/_components/dashboard.tsx` — added `handleUncomplete` (optimistic update + revert-on-error, matching the pattern of the other todo handlers). The checkbox button is no longer `disabled` once done-today; instead its `onClick` branches to `handleUncomplete` when `isDoneToday` is true, `handleComplete` otherwise. Button `disabled` now only guards the transient `isCompleting` animation window.

**Verification:** exercised complete → uncomplete against the real DB for both a daily and a once-off test todo; confirmed due_date/completed_at revert correctly in both cases. Cleaned up test rows.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-13 — Add "Measures" page

**What was built:**
New nav tab for logging point-in-time personal metrics: monthly savings snapshot, monthly spend report, monthly free-time audit, and a daily check-in (energy, sleep quality, body feel, mood — each 1–10).

- `lib/db.ts` — new `measures` table: `category` (text), `recorded_date` (date), `data` (jsonb, category-specific numeric fields), `notes`, `created_at`. One flexible table rather than one per category, since each category just needs a handful of numeric fields plus a date and optional notes.
- `app/api/measures/route.ts` — `GET` (optional `?category=` filter), `POST` (create).
- `app/api/measures/[id]/route.ts` — `PATCH`, `DELETE`.
- `app/_components/dashboard.tsx` — added "Measures" to `NAV_ITEMS`; `MEASURE_CATEGORIES` (4 category badges) and `MEASURE_FIELDS` (per-category field defs: label, optional `$`/`hrs` suffix or 1–10 `max`) drive a single generic form + entry list, so adding a 5th category later is just a data-table edit, no new JSX. Entries list shows all logged fields per entry with a delete action.
- `app/page.tsx` — added `"measures"` to the `MobileTab` union and a bottom-nav button (mobile) / it flows through the existing sidebar-takeover-on-desktop pattern automatically.
- Ran `scripts/migrate.ts` against the real Neon DB to create the `measures` table now (it will also auto-create via `instrumentation.ts` → `ensureSchema()` on next server start, but this got it live immediately for testing).

**Typecheck:** PASS ✓

---

## 2026-07-13 — Desktop nav-rail-plus-content split + mobile bottom bar overflow

**What was built:**
Two layout requests from screenshots: on desktop, clicking a left nav item was showing that section's content stacked *below* the nav list in the same narrow column instead of beside it; on mobile, the bottom nav bar had 9 crowded items and the desktop nav-rail change was leaking into narrow viewports as a persistent sidebar.

- `app/_components/dashboard.tsx` — when `isExpanded` (a section other than chat is active), the nav + content wrapper is `flex-col` by default and only becomes `lg:flex-row` at the `lg` breakpoint, with the nav rendering as a fixed `lg:w-[220px]` left rail (`border-r`, own scroll) and the selected section's content filling the remaining width to its right. Below `lg`, the nav is `hidden` entirely when expanded — the mobile bottom bar already covers navigation there, so showing both was redundant. The narrow-sidebar case (`!isExpanded`, chat visible) is untouched — nav still stacks above content since there isn't room for two columns in a 380px rail.
- `app/page.tsx` — mobile bottom bar cut from 9 buttons down to 5: Chat, Tasks, Notes, Ideas, plus a "More" button (`DropdownMenu`, opens upward via `side="top"`) covering Journal, Dreams, Schedule, Media, Measures. Added `MORE_TABS` array driving the dropdown so adding another overflow tab later is a one-line data change.

**Verification:** resized the browser to a phone-width viewport against the running dev server and confirmed: desktop-width still shows the rail-left/content-right split, mobile-width shows only full-width content with no persistent sidebar, and the 5-button bottom bar's "More" dropdown opens and switches tabs correctly. Owner confirmed both look right visually.

**Typecheck:** PASS ✓
