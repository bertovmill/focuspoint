# Cael — Working Log

A personal guide with memory. Built with Vercel Eve + Next.js + Neon Postgres.

---

## 2026-08-15 — Tasks is now an Excalidraw notebook

**Ask:** *"for my task list page - i have a bit of a radical idea - lets make it
excalidraw - but with a little bit of support, like the daily tasks are added each
day, the checked off boxes get stored, but I can add anything ... more of a free
flowing notebook rather than a rigid list."*

**Decisions (asked Berto):** the canvas **replaces** the Tasks tab (not a new tab
alongside it), and tasks render as **React cards floating over the canvas** rather
than as native Excalidraw shapes — so a checkbox is a real checkbox writing to the
`todos` table, while the ink around it is a real Excalidraw scene.

**How it fits together.** Two independent layers over one viewport:

- *Ink* — a single, never-ending Excalidraw scene, row `id = 1` of the new
  `task_canvas` table, autosaved 1.5s after the last edit (same debounce idiom as
  the Sketches tab). Task cards are deliberately **not** in this scene.
- *Cards* — `todos` rows positioned by two new columns, `canvas_x` / `canvas_y`, in
  Excalidraw **scene** coordinates so they survive pan and zoom. Written by
  `POST /api/todos/[id]/position`, its own sub-route (like `/timer`, `/complete`) so
  a drag doesn't round-trip the big COALESCE update in `PATCH /api/todos/[id]`.

The card layer is **portaled into the `.excalidraw` container**, not mounted as a
sibling. That one decision buys two things: Excalidraw's own z-index scale puts its
canvases at 1–2 and its toolbar UI at 4, so the layer at **3** sits above the drawing
and below the controls; and because the layer lives inside Excalidraw's DOM, wheel
events over a card still bubble to Excalidraw, so scrolling and zooming work over a
card instead of dead-zoning on it. The layer's transform is written imperatively from
`onChange` (`translate(scrollX*zoom, scrollY*zoom) scale(zoom)`) rather than through
React state, so panning doesn't re-render 37 cards a frame.

**Gotchas worth knowing:**
- The card layer spans the whole canvas, so it **must** stay `pointer-events: none`;
  only the cards opt back in. Giving the layer `auto` (the first cut) silently ate
  every click on empty canvas — Excalidraw never saw a pointerdown and nothing could
  be drawn at all. Caught only because the persistence test found 0 elements.
- Cards also go inert while a drawing tool is active (`activeTool.type !== "selection"`),
  so you can drag an arrow straight across a card.
- Auto-placement runs *before* cards render, so card height is estimated from title
  length (`estimateCardHeight`) rather than measured. A fixed height guess overlapped
  every card with a wrapped title.
- The inbox column wraps every 8 cards (`INBOX_COL_MAX`) and starts at scene
  (24, 120) — a fresh canvas opens at scene (0,0), which is exactly where our toolbar
  and Excalidraw's both sit, so cards placed on the origin open underneath them.

**Nothing was dropped in the swap.** The old list's features moved onto the cards:
checkbox, inline title edit, timer play/pause with live countdown, working-on-now
(still capped at `WORKING_LIMIT`), waiting, and a priority dot that cycles on click.
Recurrence, category and estimate moved to a **right-click context menu** on the card.
The one genuine casualty is `task_number` — the manual "do this next" queue — which
has no meaning on a canvas where position *is* the ordering.

**Files:**
- `app/_components/task-canvas.tsx` — new, the whole surface.
- `lib/todo.ts` — new; the `Todo` interface plus the few helpers both the dashboard
  and the canvas need, so the type isn't declared twice.
- `app/api/task-canvas/route.ts`, `app/api/todos/[id]/position/route.ts` — new.
- `lib/db.ts` — `todos.canvas_x` / `canvas_y`, `task_canvas` table (applied to Neon).
- `app/_components/dashboard.tsx` — **-852 lines**: the whole old Tasks UI is gone
  (`renderTodoSection`, the create form, every edit/numbering state field). What's left
  is the shared handlers the canvas calls, plus new `handleUpdateTodo` /
  `handleTodoCreated` / `handleLocalTodoPatch`.
- `app/_components/goal-flow-hero.tsx` — dropped `-mx-5 -mt-4 mb-5`; it's naturally
  full-bleed now that the Tasks tab is an unpadded flex column.
- `components/ui/checkbox.tsx` — added from the shadcn registry (not hand-rolled).

**Verified:** `npm run typecheck` and `npm run build` clean; a `--noUnusedLocals` pass
confirms no dead code left behind. Playwright against the dev server: 37 cards portaled
inside `.excalidraw` at z-index 3 with no console errors, a card dragged 260×40px
persisted to the DB at exactly the expected scene coords, a freehand stroke survived a
full page reload (and renders *under* the cards), and a checkbox click came back
`completed: true` from `/api/todos`. Mobile at 390px renders too. Test task and test
stroke were cleaned up afterwards.

**Next:** the goal hero eats ~500px on a 390px phone, which squeezes the canvas hard —
worth making it collapsible on mobile if it annoys him. Cards are also placed but never
auto-grouped; a "tidy up" action that re-flows everything back into inbox columns would
be a cheap escape hatch once the canvas gets messy.

---

## 2026-08-15 — Tasks: recurring and one-off in separate columns

**Ask:** "For the daily recurring tasks and the more one-off tasks, should have different columns."

**Decisions (asked Berto):** left column = everything recurring (dailies first under a "Recurring" header, then Weekly and Monthly sections); right column = one-off tasks. Columns stay side-by-side at every width — no stacking on mobile. "Working on now" is unchanged and still spans full width above both columns.

**Built:** the section-rendering closure was inline in the Tasks JSX as a `.map` callback, so it could only produce one vertical stack. Extracted it to `renderTodoSection({ key, label, working })` in the component body (~410 lines moved verbatim, no behaviour change) and composed the two columns around it. Each section now owns exactly one recurrence value — dailies used to be merged into the "none" section and floated to its top with an `isDaily` sort tiebreak; both that special case and the tiebreak are gone.

**Files:** `app/_components/dashboard.tsx` — `TODO_SECTIONS` → `RECURRING_TODO_SECTIONS` (daily/weekly/monthly), new `renderTodoSection`, two-column `grid grid-cols-2` wrapper.

**Verified:** `npm run typecheck` clean; Playwright screenshot against the running dev server shows Recurring (Daily → Weekly) on the left and One-off on the right.

**Next:** the one-off column is much taller than the recurring one, so there's dead space at the bottom left. If that bugs him, a masonry/`columns-2` flow or per-column scrolling would fill it.

---

## 2026-08-13 — Added "Content" task category

**Ask:** Add a fourth tag chip, Content, alongside Events / Calls / AI Agents.

**Built:** `content` appended to `TASK_CATEGORIES` with label "Content" and an amber outline badge (violet/sky/emerald were taken). Category column is plain `TEXT`, so no migration. Agent tool descriptions (`add_todo`, `update_todo`) and `agent/instructions.md` updated so Cael knows to label writing/recording/editing/publishing work as `content`.

**Files:** `lib/task-categories.ts`, `app/_components/dashboard.tsx`, `agent/tools/add_todo.ts`, `agent/tools/update_todo.ts`, `agent/instructions.md`.

---

## 2026-08-13 — Task categories: Events / Calls / AI Agents

**Ask:** Berto wanted tasks taggable with Events, Calls, or AI Agents — "because nothing else I do should be those things."

**Decisions (asked Berto):** one category per task, optional (NULL is the normal case) rather than multi-tag or required; surfaced in all four places he picked — the create form, a chip on each task row, filter buttons above the list, and the agent tools so Cael can set it in chat.

**Files changed:**
- `lib/task-categories.ts` (new) — shared `TASK_CATEGORIES` / `TASK_CATEGORY_LABELS` / `normalizeCategory()`. No db import, so both the client dashboard and the agent tools import it (same pattern as `lib/working-now.ts`). `normalizeCategory` accepts loose input ("AI Agents", "calls") and returns null for anything unknown — a mislabelled category shouldn't block saving a task.
- `lib/db.ts` — `ALTER TABLE todos ADD COLUMN IF NOT EXISTS category TEXT` (also run directly against the dev DB, since `ensureSchema()` isn't called per request).
- `app/api/todos/route.ts` — `category` in every SELECT list; POST normalizes and stores it.
- `app/api/todos/[id]/route.ts` — PATCH treats `category` as explicitly nullable (`hasOwnProperty` + `CASE WHEN`), same idiom as `task_number`/`estimated_minutes`, so `{category: null}` clears it.
- `agent/tools/add_todo.ts`, `agent/tools/update_todo.ts` — optional `category` enum; `update_todo` accepts `null` to clear. `list_todos` is `SELECT *` so it picked it up for free.
- `agent/instructions.md` — tells Cael what the three categories mean and to leave it off when unsure.
- `app/_components/dashboard.tsx` — `Todo.category`, a per-category badge colour map (violet/sky/emerald, matching the amber "Waiting" idiom), category chips in the create form and the edit form, a chip on each task row (click clears it), a Category radio group in the right-click menu, and a filter row above the list that only offers categories actually in use. The filter hides rows only — the working-now slot count stays honest about what's really in progress, and the "Nothing active" prompt is suppressed while a filter is on (it would otherwise claim nothing is active when the active task is simply a different category).

**Verified:** Playwright against a dev server on :3789 — seeded one task per category plus an uncategorized one (confirmed `"Calls"` normalizes to `calls`, and no category stores as `null`), filtered to Calls (only that task shown), cleared a chip by clicking it (server confirmed `category: null`), reassigned via the right-click menu (server confirmed `calls`), and screenshotted the create-form picker. All test rows deleted afterward; Berto's real tasks untouched.

**Typecheck:** PASS ✓

---

## 2026-08-11 — Replace focus mode with "Working on now" (max 3)

**Ask:** Berto wanted the focus feature gone — the dark overlay that spotlit a single timing task — and replaced with a "Working on now" section holding at most 3 tasks, with the rest of the list greyed out. Three is his stated human limit.

**Decisions (asked Berto):** reuse the existing `in_progress` flag rather than adding a `working_now` column (no schema change, and the existing "In progress" concept was already this idea without a cap); working-now tasks get their own pinned section at the top rather than staying inline; the rest of the list is always dimmed (~50%, brightening on hover), not only when the limit is hit.

**Changes:**
- `lib/working-now.ts` (new) — `WORKING_LIMIT = 3`, a shared `WORKING_LIMIT_MESSAGE`, and `hasWorkingSlot(sql, excludeId?)`. Takes the sql client as an argument so the file has no db import and the client dashboard can import the constants.
- `app/_components/dashboard.tsx` — deleted focus mode entirely (`spotlightRect` state, the measure-on-scroll/resize effect, and the `box-shadow: 0 0 0 9999px` overlay). Tasks list now renders a synthetic "Working on now · N/3" section ahead of `TODO_SECTIONS`, holding the in-progress tasks (excluded from the sections below); it renders even when empty, as a dashed prompt. Working rows sit in a bordered primary-tinted card; every other section's `<ul>` is `opacity-50 hover:opacity-100`. Each row gained a hover play/pause button ("Work on this now" / "Stop working on this") next to edit/delete; the now-redundant "In progress" badge was dropped and the context-menu item reworded. New-task pill renamed "Working on now" and blocked when full. `handleToggleInProgress` and `handleToggleTimer` (which marks in progress) both toast and bail when there's no slot.
- `app/api/todos/[id]/route.ts` — `PATCH in_progress: true` returns 409 when three are already active.
- `app/api/todos/[id]/timer/route.ts` — starting a timer 409s when full (it sets `in_progress = TRUE`).
- `app/api/todos/route.ts` — `POST` clamps `in_progress` to false when there's no free slot.
- `agent/tools/update_todo.ts` — same 3-task check, so Cael gets `success: false` with the reason instead of silently creating a 4th.

**Verified:** Playwright against a local dev server on :3789 with Berto's real data (3 tasks already in progress). Screenshotted the new layout — "WORKING ON NOW · 3/3" card at top, dimmed list below, no dark overlay. Seeded a test task: `POST` with `in_progress: true` came back `false` (no slot), `PATCH in_progress` → 409, timer start → 409, and clicking the row's play button showed the "You can only work on 3 things at once" toast. Then freed a slot by pausing one task, confirmed the test task moved into the section, restored the original three, and deleted the test task. Typecheck clean.

---

## 2026-08-10 — Set task "in progress" at creation time

**Ask:** Berto wanted to mark a new task as "in progress" right when creating it, instead of having to create it and then toggle it separately.

**Changes:**
- `app/_components/dashboard.tsx`: added `newTodoInProgress` state and an "In progress" pill (using the existing `PlayIcon`) below the Priority/Duration/Repeat rows in the new-task form; included in the `handleAddTodo` POST body and reset on submit/error.
- `app/api/todos/route.ts`: `POST` now accepts an optional `in_progress` field (defaults `false`) and inserts it into the `todos` row.

Verified end-to-end with Playwright against a local dev server (port 3789): created a task with the toggle on, confirmed `in_progress: true` came back from `/api/todos`, then deleted the test task.

---

## 2026-08-09 — Circular timer progress ring + completed tasks sink to bottom

**Ask:** Berto liked the timer celebration/dimming work and asked for two more things: (1) a "pretty sizable" circular/oval progress indicator for the running timer, for gamification — he specifically asked to use a UI kit rather than build from scratch; (2) completed tasks currently sort into the middle of the list (grouped by "Done today" but still above other active tasks) — he wants them to sink to the very bottom once checked off, since he doesn't need to see them again.

**Decisions:** installed Magic UI's `animated-circular-progress-bar` via the shadcn registry (`npx shadcn add @magicui/animated-circular-progress-bar`) rather than hand-rolling an SVG ring — `components.json` already had the `@magicui` registry configured (from an earlier partial attempt), and the component file was already present untracked in the working tree, so this just completed that setup. Added a `children` override prop to the generated component (it only shipped a hardcoded percent label) so the ring can show the mm:ss countdown instead of a bare percentage — a small, expected local customization per the magic-ui skill's guidance ("prefer prop-level customization" once you own the generated file).

**Changes:**
- `components/ui/animated-circular-progress-bar.tsx` (new, via shadcn add) — added optional `children` prop to override the centered percent label.
- `app/_components/dashboard.tsx`:
  - Replaced the small pill badge for a running timer with a `size-16` `AnimatedCircularProgressBar` showing elapsed-time fill (primary color, or destructive red once over the estimate) with the mm:ss countdown centered inside. Falls back to the old "Timing" badge when a task has no time estimate (no percentage to show). That fallback path is unreachable in practice today (every timer requires an estimate to start), kept for type-safety/future-proofing.
  - Added `isDoneTodayForSort()` and made it the first tiebreaker in each section's sort comparator, so a task marked done — including the optimistic "just checked off" state via `completingIds`, not just the server-confirmed `completed_at` — immediately drops to the bottom of its section instead of sitting above still-active tasks.

**Verified:** `npm run typecheck` clean. Ran the app on an isolated port (3789) and drove it with Playwright against Berto's real (read-only) task data — confirmed the ring renders in place of the badge with the correct countdown and fill, and confirmed scrolling to the bottom of the Tasks section shows all "Done today" items now sit right above the next section ("Weekly"), below every active task. No test data created/needed this round since verification was read-only against existing tasks.

---

## 2026-08-09 — Task timer: celebration on completion + focus-mode dimming while running

**Ask:** Berto wanted two things for the task timer: (1) when a timer hits zero, play a sound, show a celebration animation, and bring the app window to the front; (2) while actively doing a timed task, dim the rest of the app so it's easier to lock in.

**Decisions (confirmed with Berto first):** sound is a synthesized "ta-da" arpeggio via Web Audio API (no audio asset — he asked for "more fun than a beep"), not a plain tone. Dimming triggers specifically on a *running timer* (not just "in progress") and dims the whole app, not just other rows in the task list.

**Changes:**
- `lib/celebration-sound.ts` (new) — `playCelebrationSound()`: a short ascending arpeggio + landing chord via oscillators, shared `AudioContext`.
- `app/_components/timer-complete-celebration.tsx` (new) — confetti + modal, same visual pattern as `goal-celebration.tsx` (reused the `confetti-piece`/`chat-modal-*` CSS already in `globals.css`), shows the completed task's title.
- `lib/desktop.ts` — added `focusAppWindow()`: calls the new Tauri `focus_window` command (desktop shell) and falls back to `window.focus()` (browser tab, best-effort — browsers often block this outside a user gesture).
- `desktop/src-tauri/src/main.rs` — added `focus_window` Tauri command (`unminimize` + `show` + `set_focus`), registered in the invoke handler.
- `app/_components/dashboard.tsx`:
  - New effect watches `nowTick`/`todos`, tracks each running timer's previous "seconds remaining" in a ref, and fires the celebration (sound + `focusAppWindow()` + modal) exactly on the tick a countdown crosses from positive to zero/negative — not on every render, and not for a timer that was already over when the page loaded.
  - New effect tracks the actively-timed task row's `getBoundingClientRect()` (via a `data-todo-id` attribute) and renders a fixed, full-viewport dark overlay with a "spotlight hole" (box-shadow trick: `0 0 0 9999px rgba(0,0,0,0.72)` on a div sized/positioned to the row) so everything else — other tasks, sidebar, chat — visually dims while a timer runs. Position-fixed, so it covers the whole app regardless of which panel Dashboard is nested in.

**Verified:** `npm run typecheck` clean. Ran the app locally on a separate port (3789, since Berto's own dev session owns 3000) and drove it with Playwright: confirmed the spotlight overlay dims everything except the running task's row (screenshotted), and confirmed that seeding a test task with a timer a few seconds from completion produces the confetti modal with the correct task title within the same session. Cleaned up all test todos afterward and confirmed Berto's real running timer (task 246) was untouched throughout. Did not verify `focus_window` inside an actual built desktop app (no Tauri runtime in this loop) — logic mirrors the existing `set_pin_mode` command pattern.

**Next steps:** none outstanding; desktop build not rebuilt/tested end-to-end (would need `npm run tauri build` or a dev run of the shell to confirm `focus_window` actually raises the window on macOS).

---

## 2026-08-09 — Community wealth-form: live MakersLounge subscriber count via Luma API

**Ask:** Berto wanted the Community card (one of the 8 forms of wealth) to track real MakersLounge Luma subscriber growth instead of the placeholder "count of thoughts tagged #community" signal.

**Decision:** Luma has no dedicated "subscribers" endpoint — used `/v1/calendars/contacts/list` (sorted by `created_at` asc, paginated via `next_cursor`/`has_more`) as the subscriber-join signal, since calendar contacts are effectively MakersLounge's Luma audience. Server-side only: `lib/luma.ts` does the paginated fetch (reads `LUMA_API_KEY`, a calendar-scoped Luma Plus key, from env; `next: { revalidate: 300 }` on the fetch), `app/api/community/route.ts` exposes just `created_at` timestamps to the client so the API key never reaches the browser. Community's sparkline now uses `mode: "sum"` over those per-contact timestamps — cumulative growth curve, same pattern as Growth's pages-read chart.

**Files changed:**
- `lib/luma.ts` (new) — `fetchLumaContacts()`, paginated Luma contacts fetch.
- `app/api/community/route.ts` (new) — GET route, returns `[{created_at}]`, empty array on any failure.
- `app/_components/home-screen.tsx` — added `communityContacts` state + fetch, swapped `community`'s `wealthSeries` entry from `taggedCount("community")` to real Luma points (unit `subscribers`).
- `.env.local` — added `LUMA_API_KEY`.

**Verified:** Confirmed the key directly against Luma's API via curl (real MakersLounge contacts returned). Tested `/api/community` against the already-running dev server on :3000 (1,174 contacts, correctly paginated). Playwright screenshot of the live dashboard confirms the Community card renders "1,174 subscribers" with a rising line chart. Typecheck clean for the changed files (an unrelated pre-existing syntax error in a concurrent session's in-progress `family-panel.tsx` was left as-is — not part of this change).

---

## 2026-08-09 — Family memories: optional photo, editable, date stamp

**Ask:** Berto wanted the Family memory form to not require a photo, wanted memories to be editable after creation, and wanted a date stamp shown on each memory.

**Changes:**
- `lib/db.ts`: `memories.image_url` is now nullable; added `memory_date DATE NOT NULL DEFAULT CURRENT_DATE` (the date the memory happened, distinct from `created_at` which is upload time). Migration is additive (`ALTER TABLE ... DROP NOT NULL` / `ADD COLUMN IF NOT EXISTS`), safe against the already-deployed table.
- `app/api/memories/route.ts`: `POST` now accepts memories with no `image_url` as long as a title or description is present; accepts `memory_date` (defaults to today).
- `app/api/memories/[id]/route.ts`: added `PATCH` to update title/description/image_url/memory_date.
- `agent/tools/add_family_memory.ts`: `image_url` is now optional on the tool schema too, and it takes an optional `memory_date`.
- `app/_components/family-panel.tsx`: photo dropzone is now labeled optional with a separate "Save memory without a photo" button; added a date picker to the add form (defaults to today); each memory card now shows its date stamp and has an edit (pencil) button alongside delete that switches the card into an inline edit form (title/description/date, save/cancel). Cards without a photo render as a plain card (icon placeholder + normal-contrast text) instead of the photo-gradient-overlay style.

**Bug caught during verification:** the neon driver serializes `DATE` columns as full ISO timestamps (e.g. `2026-07-15T04:00:00.000Z`), not bare `YYYY-MM-DD` — `formatMemoryDate` originally assumed the latter and produced "Invalid Date". Fixed by slicing to the first 10 chars before parsing (both for display and for seeding the edit form's date input).

**Verified:** `npm run typecheck` passes. Playwright against the live dev server (Berto's own `next dev` on :3000 — did not restart it): created a photo-less memory via the UI flow's API calls, confirmed it rendered as a placeholder card with correct date stamp, edited it via `PATCH` and confirmed the change persisted and re-rendered, opened the inline edit UI on the existing real "Call with David" memory to confirm it populates correctly (did not save, so it was left untouched), then deleted all test rows. Ran `scripts/migrate.ts` once against the dev DB to apply the new `memory_date` column ahead of testing.

---

## 2026-08-09 — Routines: fixed 4-slot daily template (Morning Routine / AM Workout / PM Workout / Daytime)

**Ask:** Berto wants the Routines section to be his literal "operating system for the week" — every day broken into the same 4 fixed slots (Morning Routine, AM Workout, PM Workout, Daytime), each independently editable, rather than the previous freeform per-entry periods.

**Decisions (asked Berto):** Confirmed a fixed 4-slot template shown for every day, even when empty (clickable "+ Add" placeholder), rather than only showing slots that already have content. For the existing "Weekly Workout Routine" data (one AM-run entry + one evening-lift entry per weekday, plus Sat/Sun's AM/PM entries), mapped AM → AM Workout and the evening/PM entries → PM Workout; Morning Routine and Daytime start empty for Berto to fill in.

**Files changed:**
- `app/_components/home-screen.tsx`:
  - New `ROUTINE_PERIODS` constant (`["Morning Routine", "AM Workout", "PM Workout", "Daytime"]`) — the canonical, ordered slot vocabulary.
  - Replaced the whole-day textarea editor with `rebuildDaySlot`, which edits exactly one day+slot at a time: reflows that day's lines into canonical slot order on save, preserving any legacy/unrecognized period text by appending it after the 4 canonical slots (defensive — shouldn't occur post-migration, but avoids silent data loss if it does).
  - `routineEditTarget`'s day-editing variant became `{ field: "slot", day, period }`; `startEditingRoutineSlot` seeds the textarea with just that slot's text (no period prefix needed — the slot itself is the period).
  - Each day column now always renders all 4 `ROUTINE_PERIODS` in order, each its own click-to-edit unit (auto-growing textarea, save-on-blur, Escape-to-cancel) — empty slots show a muted "+ Add".
- Data migration (one-off, not a code change): re-mapped the live "Weekly Workout Routine" row's existing periods — `AM` → `AM Workout`, `8pm`/`PM` → `PM Workout` — via a direct `PATCH /api/vision/[id]` call against the shared dev/prod DB, so the dashboard renders correctly under the new slot vocabulary without Berto having to retype anything that already existed.

**Verified:** `npm run typecheck` passes. Playwright against the live dashboard: confirmed all 7 days now show all 4 slots with the migrated content in the right places and empty slots showing "+ Add"; filled in Monday's previously-empty "Morning Routine" slot, confirmed it persisted via `GET /api/vision?kind=routine`, then restored the original content so no real data was left changed.

**Next steps:** Berto can now fill in Morning Routine and Daytime for each day as he defines them — no further code work needed for that.

## 2026-08-09 — Desktop nav: persistent left rail (ElevenLabs-style), Weekly Routine centered

**Ask:** Berto wanted the Weekly Workout Routine section centered like the rest of the home dashboard (it was full-bleed via `px-6 lg:px-12` while everything else uses `mx-auto max-w-6xl px-6`). Then, referencing ElevenLabs' left sidebar, he wanted all section nav (Chat/Tasks/Notes/Lists/Journal/Dreams/Schedule/Media/Measures/Vision/Sketches/Calendar) moved out of the "Go To" grid on the home screen and into a persistent left sidebar, since on desktop there previously was no always-visible nav — navigation only happened via that grid (home screen only) or keyboard shortcuts.

**Decisions (asked Berto):**
- Nav rail: leftmost, always visible on desktop, collapsible to icons-only (a toggle button, state persisted to `localStorage`) — not folded into the existing Dashboard sidebar.
- Mobile: unchanged — keeps its existing bottom tab bar + "More" dropdown.
- Home screen's "Go To" grid: removed (redundant now that the rail is always visible).
- Dashboard's own inner "ElevenLabs style" vertical nav (a pre-existing feature, only shown on desktop when viewing a non-home/non-chat section) was now a duplicate of the new global rail — removed it too, since Dashboard's `activeTab` is always externally controlled via the `activeTab` prop from the layout.

**Files changed:**
- `app/_components/home-screen.tsx` — Weekly Routine section's wrapper changed from `w-full px-6 lg:px-12` to `mx-auto max-w-6xl px-6` (matches the rest of the page). Removed the "Go To" grid section, the now-unused `openTasks` state, and the `/api/todos` fetch that only fed it (`SECTIONS` array kept — still drives the home screen's number/letter keyboard shortcuts).
- `app/(app)/layout.tsx` — new `NAV_ITEMS` (13 sections incl. Home) rendered as a `hidden lg:flex` leftmost `<aside>`, width `lg:w-52` open / `lg:w-14` collapsed with a `PanelLeftIcon` toggle; `navRailOpen` state persisted to `localStorage` (`focuspoint:nav-rail-open`) and hydrated on mount.
- `app/_components/dashboard.tsx` — removed the internal `NAV_ITEMS` array and the `<nav>` block that rendered it (both the "expanded" desktop-sidebar variant and the "chat-sidebar" horizontal variant); cleaned up now-unused icon imports (`HomeIcon`, `ListTodoIcon`, `FileTextIcon`, `ListChecksIcon`, `BookOpenIcon`, `MoonIcon`, `CalendarClockIcon`, `ImageIcon`, `BrushIcon`, `TelescopeIcon`).

**Verified:** `npm run typecheck` passes. Playwright against the already-running dev server (:3000, owned by another session — didn't kill it) at 1440×1000: rail renders open and collapsed, active-tab highlighting works, clicking "Tasks" and "Chat" navigates correctly with no duplicate nav visible. Mobile (390×844) bottom nav confirmed unchanged.

**Next steps (not done):** none flagged.

---

## 2026-08-09 — Routines: fixed day-box editor clipping long content

**Ask:** After the per-field inline editing landed, the Monday box's edit textarea (fixed `rows={6}`) clipped a routine with more lines than fit — the top of the text scrolled out of view within the small box.

**Files changed:**
- `app/_components/home-screen.tsx` — both the goal textarea and each day-box textarea now auto-grow to fit their content (a ref sets `height = scrollHeight` on mount, `onChange` recalculates it as the user types), instead of a fixed `rows` with internal scroll. Removed manual `resize-y` on the day box since height is now content-driven.

**Verified:** `npm run typecheck` passes. Screenshotted Monday's box (the longest entry, 2 periods) mid-edit on the live dashboard — box now grows to show all text with nothing clipped or scrolled.

## 2026-08-09 — Wealth-form sparklines: added an x-axis (day/month/year labels)

**Ask:** The 8 tile sparklines had no axis at all — just a bare line — making it unclear what each point along it represented. Add the x-axis.

**Files changed:**
- `app/_components/sparkline.tsx` — added a Recharts `XAxis` (`dataKey="label"`, using the labels `bucketAggregate` already produces — day-of-month, month abbreviation, or year depending on the active granularity). No axis line/tick marks (`axisLine={false}` `tickLine={false}`), `interval="preserveStartEnd"` + `minTickGap={20}` so Month view's 28-31 day labels thin out to a readable handful instead of overlapping, 9px muted-foreground text. Bumped the tile chart height from `h-7` to `h-11` to fit the label row.

**Verified:** `npm run typecheck` passes. Screenshotted Month, Year, and Decade views on the live dashboard — labels render evenly spaced and legible in all three (Jan/Mar/May/.../Dec, 1/5/9/.../31, 2017/2019/.../2026).

## 2026-08-09 — Wealth-form sparklines: switched to Recharts, removed the now-redundant Reading card

**Ask:** Two follow-ups on the 8 wealth-form tile sparklines: (1) drop the standalone Reading chart card, since Growth's tile sparkline already covers pages read; (2) the hand-rolled SVG sparklines had visibly misshapen peaks (asymmetric/kinked triangles instead of clean curves) — Berto asked to use a proper Next.js charting kit instead.

**Root cause of the misshapen lines:** The old `Sparkline` built raw SVG paths in a `100×28` `viewBox` with `preserveAspectRatio="none"`, stretched to fill each tile's actual box (~280×28px, a very different aspect ratio). That non-uniform x/y stretch distorted stroke width and turned symmetric peaks into lopsided shapes — not a data problem, a rendering-math one.

**Decision (asked Berto):** Added shadcn's `Chart` component (a themed wrapper around Recharts — `npx shadcn add chart`), since the project already standardizes on shadcn/ui. Scoped to just the 8 tile sparklines; left the Training (workout) chart as its hand-rolled SVG for now since it's a different shape of chart (multi-line, % indexed) and isn't broken.

**Files changed:**
- `components/ui/chart.tsx` — added via shadcn CLI (`ChartContainer`/`ChartTooltip`/`ChartTooltipContent`, wraps Recharts). Added `recharts` as a dependency.
- `app/_components/sparkline.tsx` — rebuilt on `recharts`' `LineChart` inside `ChartContainer` (`ResponsiveContainer` under the hood handles proper aspect scaling) instead of a hand-rolled SVG path; kept the same props (`data`, `unit`, `mode`) and the same sum/last caption logic from the previous fix, so `home-screen.tsx` didn't need to change its call sites.
- `app/_components/home-screen.tsx` — removed the "Reading" full-width chart card and its `readingLogs.length > 0` block; `readingLogs` state is still fetched and still feeds the Growth tile's sparkline in `wealthSparklines`, just no longer has its own card.
- `app/_components/reading-chart.tsx` — deleted (only consumer was the removed card); its `ReadingLog` interface moved inline into `home-screen.tsx` since it's still needed for the `readingLogs` state type.

**Verified:** `npm run typecheck` passes. Screenshotted the live dashboard (Berto's own :3000 dev server) in Year and Decade views and in dark mode — Reading card gone, all 8 tile sparklines now render smooth, correctly-proportioned peaks with no visible distortion.

**Next steps:** None outstanding. If Training gets visibly awkward at some point too, it's a candidate for the same Recharts treatment.

## 2026-08-09 — Routines: per-field inline editing (title/goal/each day separately) + larger type

**Ask:** Follow-up on the earlier full-bleed Routines redesign — Berto didn't want the whole routine editable as one big textarea blob; each piece (the title, the goal line, and each individual day) should be its own click-to-edit target. Also bump the font size across the section, which read too small at the new full-bleed width.

**Decisions:** Save-on-blur + Escape-to-cancel per field, no visible Save/Cancel buttons — clicking any other field (or elsewhere) commits the edit, matching the Notion/Apple-Notes inline-edit feel rather than the previous button-driven flow. Day boxes are edited as short, day-prefix-free lines (`(AM): text`) so the box only ever shows that one day's content; saving re-splices those lines back into the routine's single raw `content` string at the position where that day's lines used to live (backend still just has one `content` blob per routine — no schema change).

**Files changed:**
- `app/_components/home-screen.tsx`:
  - Replaced the single `editingRoutineId`/`editRoutineTitle`/`editRoutineContent` state with `routineEditTarget` (`{ routineId, field: "title" | "goal" }` or `{ routineId, field: "day", day }`) + one `routineEditValue` string, so exactly one field of one routine is ever mid-edit.
  - New helpers: `dayEntriesToLines` (entries → editable `(period): text` lines), `rebuildContentForDay` (splices edited lines for one day back into the routine's raw content, preserving every other line's position), `rebuildContentForGoal` (replaces/inserts the `Goal:` line).
  - `saveRoutineField` — single save path for all three field kinds; optimistic local update, `PATCH /api/vision/[id]` with just `{ title }` or `{ content }`, rolls back and toasts on failure.
  - Title, goal, and each day cell independently render as a button (click → inline `input`/`textarea`, `autoFocus`, `onBlur` saves, `Escape` cancels) or their read-only view.
  - Font sizes bumped: routine title `text-sm` → `text-lg`, goal/day-entry text `text-xs`/`text-[11px]` → `text-sm`, day-of-week label `text-[10px]` → `text-xs`.

**Verified:** `npm run typecheck` passes. Playwright round-trip against the live dashboard (Berto's own :3000 dev server) for all three field kinds — edited Tuesday's box in isolation (confirmed the rest of the week didn't re-render/reset), edited the title, and edited the goal line — confirmed each persisted via `GET /api/vision?kind=routine`, then restored the original title/content each time so no real data was left changed.

**Next steps:** None outstanding.

## 2026-08-09 — Home dashboard: sparkline on all 8 forms-of-wealth tiles, shared Month/Year/Decade toggle

**Ask:** Berto wants every one of the 8 forms-of-wealth tiles to show a small left-to-right line chart, all controlled by one shared Month/Year/Decade toggle (switching one switches all 8 at once).

**Decisions (asked Berto):** Month = one point per day (current month), Year = one point per month (current year), Decade = one point per year (last 10 years) — reusing the granularity levels from the timeline that was removed earlier this session. Layout: kept the compact 2×4 tile grid and embedded a small sparkline in each tile (not full-width chart cards like Training/Reading). For the metric: Growth reuses reading pages, Wellness reuses the existing workout log count, Money reuses the existing savings balance — Berto had me propose defaults for the other 5 (Family, Craft, Community, Adventure, Service) since they had no tracked data yet. I used a count of `thoughts` tagged with that form's lowercase name (`family`, `craft`, `community`, `adventure`, `service`) as the signal — cheap to wire up since `capture_thought` already supports arbitrary tags, and it turned out Berto already had real historical tags matching several of these (19 `community`, 10 `craft`, 2 each for `family`/`adventure`/`service`), so the charts aren't starting from zero.

**Files changed:**
- `lib/chart-buckets.ts` — new shared bucketing utility: `bucketAggregate(points, granularity, mode)` buckets `{t, value}` points into Month/Year/Decade buckets; `mode: "sum"` adds values per bucket (counts, pages), `mode: "last"` forward-fills the most recent value per bucket (running balances like savings).
- `app/_components/sparkline.tsx` — new minimal SVG line component for the tile-sized chart: no axes (too small for them), a hover-titled end-point marker, and a caption below — period total for `sum` metrics, current value for `last` metrics (the literal final bucket is misleading for a `sum` metric once that bucket is a not-yet-populated future one, e.g. December in Year view — caught this after a first screenshot showed "0 pages" as the Growth caption even though 4,800 pages were logged; fixed by summing all buckets for `sum` mode instead of reading only the last one).
- `app/_components/home-screen.tsx` — added the `wealthGranularity` state and the shared Month/Year/Decade segmented toggle above the 8-forms grid; a `wealthSparklines` memo builds each form's bucketed series (reusing already-fetched `readingLogs`/`workoutLogs`/`savingsHistory`, plus a new `thoughts` fetch); replaced the Money-only progress-bar block with a generic per-tile `<Sparkline>` (Money keeps its goal progress bar above the sparkline).
- `app/api/thoughts/route.ts` — raised the `limit` query param's cap from 100 to 1000 so the dashboard can pull enough history to bucket a full decade.
- `agent/instructions.md` — new bullet telling Cael to tag `capture_thought` calls with `family`/`craft`/`community`/`adventure`/`service` when a captured thought is clearly about that form, since those tags are what feed the 5 new sparklines.

**Verified:** `npm run typecheck` passes. Screenshotted the live dashboard (Berto's own dev server on :3000) in Month, Year, and Decade views, and in dark mode — toggle switches all 8 tiles at once, sparklines render correctly including the "No data yet" empty state (Wellness — its seed workout rows were deleted after an earlier session's verification), and the caption fix confirmed correct (Money shows the current $19,600 balance in every view; count-based tiles show the period's total, not a stray zero from an unpopulated future bucket).

**Note:** This work was mid-flight in this shared checkout when another concurrent session picked it up and committed it alongside an unrelated dashboard-width/Routines-editing change (see the entry directly below). This entry documents the sparkline feature specifically; the caption-mode fix above landed in a follow-up commit.

**Next steps:** No dedicated tracking exists yet for Family/Craft/Community/Adventure/Service beyond the thought-tag proxy — if Berto wants a more precise metric for any of them later (e.g. an explicit `log_*` tool), swap that form's entry in `wealthSparklines` in `home-screen.tsx`.

## 2026-08-09 — Home dashboard: wider main content, full-bleed Apple-style Routines, inline routine editing

**Ask:** Three follow-on requests against the home dashboard in one session: (1) the main content column read as too narrow/boxed-in on desktop; (2) the Routines card specifically should go full-bleed with no card border, referencing Apple's edge-to-edge product-page sections; (3) routines should be editable inline from the dashboard instead of only through chat.

**Decisions (asked Berto):** Widened content from `max-w-2xl` (672px) to `max-w-6xl` (1152px) — tried `max-w-4xl` first and Berto asked to go wider still. For the Routines section specifically, Berto wanted it to break out of that container entirely (own full-width wrapper, no `Card`/border) — Apple's "help is here" carousel on apple.com/store was the reference. For editing, chose whole-routine raw-text editing (title + the full `Goal: ...\nMonday (AM): ...` content block in one textarea) over per-day-cell or fully structured per-entry fields — simplest to build, matches exactly how it's stored and how Cael already writes it via `update_vision_item`.

**Files changed:**
- `app/_components/home-screen.tsx`:
  - All four `max-w-2xl` page-width wrappers → `max-w-6xl`.
  - Routines section pulled out of the shared `max-w-6xl` container into its own full-width wrapper (`w-full px-6 lg:px-12`); removed the `Card` wrapper and the `border border-border/60` boxes around each day — now plain columns separated by `divide-x divide-border/60`, no shadow/border chrome.
  - Routine list now carries `id` (added to `toRoutineList`) so individual routines can be targeted for a `PATCH`.
  - Click a routine (title or grid) → replaces the read view with an editable title `input` + a `textarea` holding the raw content, Save/Cancel buttons (Cmd/Ctrl+Enter to save, Escape to cancel). Save calls `PATCH /api/vision/[id]` (existing route, no backend changes needed) and replaces the routine in local state with the server's response on success; toasts on failure and leaves edit mode open.

**Verified:** `npm run typecheck` passes. Drove the live dashboard with Playwright (Berto's own :3000 dev server): confirmed the width change and full-bleed Routines rendering, then round-tripped a real edit — appended a marker line, saved, confirmed it persisted via `GET /api/vision?kind=routine`, then restored the original content via the same `PATCH` endpoint so no real data was left changed.

**Next steps:** None outstanding for this thread. If Berto later wants more granular editing (per-day or per-entry), the raw-textarea approach can be swapped without changing the `PATCH` contract.

## 2026-08-09 — Home dashboard: Reading chart (Growth) — cumulative pages this year + year-end projection

**Ask:** Berto wants to track pages read (X axis = months, Y axis = pages), for the Growth form of wealth. He's read ~15 books so far this year but hasn't been logging them — wants a projection for the year based on that pace. Going forward, he'll log by telling Cael in chat when he finishes a book, and Cael should use web search to find the page count rather than being asked for it.

**Decisions (asked Berto):** For the 15 already-read books, just estimate rather than looking up real titles — seeded as 15 generic "estimated" rows at a 320-page average (4,800 pages), spread evenly Jan 1–Aug 9 so the pace/projection isn't starting from zero. Chart lives as its own "Reading" card on the Home dashboard (same pattern as the Training/workout chart), not nested inside the Growth tile. Logging happens via chat ("finished reading X") — Cael looks up the page count with `web_search` and logs it automatically, no confirmation needed (matches the workout-logging pattern). Berto also said the long-term direction is for all 8 forms-of-wealth cards to become line charts — scoped down to just Growth/reading for this session; the other 7 need their own metrics defined first, one at a time in later sessions.

**Files changed:**
- `lib/db.ts` — new `reading_logs` table: `id, book_title TEXT, pages INTEGER, logged_date DATE, is_estimate BOOLEAN, created_at`. Append-only (like `thoughts`) rather than one-row-per-day, since finishing a book is a discrete event, not a mutable daily value. `is_estimate` flags the 15 seeded rows so they can be told apart from real logs later if needed.
- `agent/tools/log_reading.ts` — new tool: `book_title`, `pages`, optional `date`; inserts a row. Description tells the model to look up the page count with `web_search` first rather than asking the user.
- `agent/tools/list_reading.ts` — new tool: recent reading history, so Cael can answer pace questions.
- `agent/instructions.md` — new "Reading" bullet (mirrors the existing Workouts one); also updated the stale "you have no general web-search tool" line — `web_search` is a built-in eve tool and was actually available, just undocumented/unused. Narrowed its sanctioned use to concrete lookups (book page counts) rather than open-ended browsing.
- `app/api/reading/route.ts` — `GET`, full history oldest-first.
- `app/_components/reading-chart.tsx` — new component (loaded the `dataviz` skill first): single-series cumulative line, solid from Jan 1 through today, dashed continuation from today to Dec 31 at the current daily pace (`total pages / days elapsed * days in year`). Month labels on X, page counts on Y, direct-labeled legend instead of a hover-only tooltip (no legend box needed for a single series, but the actual-vs-projected distinction needed a label). Reused `--chart-series-1` (already validated) rather than adding a new color.
- `app/_components/home-screen.tsx` — fetches `/api/reading` alongside the existing calls; new "Reading" card directly under the Training card.
- DB (production): ran `scripts/migrate.ts` to create the table, then a one-off script seeded the 15 estimated rows.

**Verified:** `npm run typecheck` passes. Screenshotted the live dashboard (Berto's own dev server on :3000 — didn't start a second one) with the seeded data: solid line Jan→Aug reaching 4,800 pages, dashed projection Aug→Dec reaching ~7,941 pages, legend showing both numbers, month ticks Jan–Dec.

**Next steps:** No real book has been logged yet — next time Berto tells Cael he finished one, it should search for the page count and log it, starting to replace the estimated segment with real data. The other 7 forms-of-wealth cards (Wellness, Family, Craft, Money, Community, Adventure, Service) still need their own chart metrics defined — one at a time in future sessions, per Berto's steer.

## 2026-08-09 — Home dashboard: remove 2030 vision card and road-to-2030 timeline

**Ask:** Berto wanted the "2030" north-star vision statement card and the "The road to 2030" yearly-milestone timeline removed from the home dashboard.

**Files changed:**
- `app/_components/home-screen.tsx` — removed the `VISION_2030` card and the timeline section (year buttons, granularity toggle, milestone text). Cleaned up now-dead code that only existed to support the timeline: `TIMELINE_YEARS`, `TIMELINE_GRANULARITIES`/`TimelineGranularity`, `milestones` state, `timelineGranularity`/`focusedYear` state, and the `/api/vision?kind=milestone` fetch.

**Verified:** `npm run typecheck` passes.

**Next steps:** None — the "Growth"/"Family"/"Craft"/etc. per-form vision cards (unrelated to the removed overall 2030 statement) are untouched.

## 2026-08-07 — Home dashboard: workout progress chart (squat/deadlift/bench/chinups/10K), indexed to % from baseline

**Ask:** Berto wanted his 5 standard workouts (squat 5×5, deadlift 5×5, bench 5×5, chin-ups 5×5, 10K run) plotted on one line chart on the daily dashboard. Weight for the four lifts, time for the run — different units, so they can't share a y-axis as raw numbers. Clicking a legend entry should reveal that series' absolute number; unclicked, everything reads as % change from the first logged value (the baseline).

**Decisions (asked Berto):** Chin-ups tracks added weight in lbs (same unit family as the other lifts), not reps — Berto confirmed. Logging happens by telling Cael in chat (e.g. "squat was 235 today"), not a dashboard form — consistent with how todos/thoughts/vision items already work, and it's the option Berto picked over a manual-entry form.

**Design approach:** Per the dataviz skill's core rule — "one axis; two measures of different scale → index to a common base, never dual-axis" — the chart plots `% change from each series' own first logged value`, which is exactly the technique the skill prescribes for mixing lbs and minutes on one chart. Built as a small hand-rolled inline-SVG component rather than pulling in a chart library (no chart lib was in the project yet), specifically because the "click legend → show absolute value for that series only" interaction isn't something off-the-shelf chart libs expose — it needed direct control over legend click state. Colors are the first 5 slots of the app's own CVD-validated categorical palette (already in use for the Measures chart's `--chart-essential`/`--chart-discretionary` tokens) — extended as `--chart-series-1..5` in `globals.css` rather than picking new hex values.

**Files changed:**
- `lib/db.ts` — new `workout_logs` table: `id, exercise TEXT, value NUMERIC, logged_date DATE, created_at`, `UNIQUE(exercise, logged_date)` (re-logging the same day overwrites, like the meal table).
- `app/api/workouts/route.ts` — `GET`, full history ordered oldest-first (the chart needs the whole series, not a page).
- `agent/tools/log_workout.ts` — new tool: `exercise` (squat/deadlift/bench/chinups/10k_run), `value`, optional `date`; upserts.
- `agent/tools/list_workouts.ts` — new tool: recent history, optionally filtered to one exercise, so Cael can answer progress questions.
- `agent/instructions.md` — tells Cael to log immediately when Berto reports a number, no confirmation needed (unlike calendar events, which do ask first).
- `app/globals.css` — `--chart-series-1..5` (light + dark), the categorical palette's first 5 slots.
- `app/_components/workout-chart.tsx` — new component: computes per-exercise baseline (first point) and % change per point; renders 2px lines with round joins/caps, 3px hover-titled dots, and a larger end-marker with a card-color ring on the latest point per series (per the dataviz skill's mark spec); legend below the chart with click-to-toggle — clicked series bold + show `latest value + unit`, unclicked series dim to 25% opacity.
- `app/_components/home-screen.tsx` — fetches `/api/workouts` alongside the existing calls; new "Training" card (only rendered once there's at least one log) directly under the meal card.
- DB (production, via a one-off script): created the `workout_logs` table so the feature works immediately without waiting for the app to touch it.

**Verified:** Playwright on a dedicated dev server (:3789) against the same production DB, with 15 seeded rows spanning 3 dates across all 5 exercises — screenshotted the chart in light and dark mode (colors correct, gridlines/axis legible, legend readable in both), clicked the Squat legend entry and confirmed it bolds, shows "265 lbs," and dims the other 4 lines to 25% opacity. Typecheck passes. Seeded rows deleted afterward; dev server killed by PID. Noted a pre-existing React key warning in `Workspace` (`app/(app)/layout.tsx`, a file untouched by this change) surfaced in the dev overlay — not introduced by this work, left alone.

**Next steps (not done):** No real numbers logged yet — next time Berto reports a lift or run time to Cael in chat, it should log automatically and start populating the real chart.

## 2026-08-07 — Home dashboard: daily Mediterranean/Italian meal recommendation with photo + feedback loop

**Ask:** Berto wanted a photo of a meal recommendation for the day added to the daily dashboard — aiming for Mediterranean or Italian to start — with the ability to give thumbs up/down feedback that informs the next day's pick.

**Decisions (asked Berto):**
- Photo source: AI-generated (via the AI Gateway's `generateImage`, model `google/imagen-4.0-generate-001`), not a stock-photo API or emoji — keeps it self-contained, no new marketplace integration.
- Generation timing: a scheduled daily job (not an on-demand button), following the app's existing pattern — recurring jobs are rows in the `scheduled_tasks` table, fired once daily by the existing `agent/schedules/dispatcher.ts` (Vercel Hobby's cron-frequency cap means that dispatcher is the only real clock in this app; a native `defineSchedule` would need its own Vercel Cron slot).
- Feedback: thumbs up/down only (no free-text note) — stored on the day's row and read back by Cael the next morning via `list_meal_history`.

**Where it actually lives:** Initially built this into `Dashboard`'s internal "home" tab, then discovered that tab is dead code — `app/(app)/layout.tsx` hides the whole `Dashboard` panel and shows a completely separate `HomeScreen` component (`app/_components/home-screen.tsx`) whenever the app-level "Home" nav is active. That `HomeScreen` — daily hero photo, 2030 vision, 8 forms of wealth, timeline, routines — is the real daily dashboard, so the meal card was moved there (reverted the dead `Dashboard` changes) and placed right under the 2030 vision card.

**Files changed:**
- `lib/db.ts` — new `meal_recommendations` table: `id, meal_date DATE UNIQUE DEFAULT CURRENT_DATE, name, description, cuisine, image_url, feedback, feedback_at, created_at`. `meal_date UNIQUE` makes the day's row upsertable (re-running the job the same day overwrites it and clears feedback).
- `app/api/meals/route.ts` — `GET`, most recent N days.
- `app/api/meals/[id]/route.ts` — `PATCH { feedback: "up" | "down" | null }`; `null` clears it (toggle-off).
- `agent/tools/list_meal_history.ts` — new tool: recent meals + feedback, for Cael to review before picking today's.
- `agent/tools/set_daily_meal.ts` — new tool: takes name/description/cuisine/image_prompt, generates the photo, uploads it to Vercel Blob (`meals/<ts>.png`), and upserts today's row.
- `agent/instructions.md` — documents the new scheduled job and tools.
- `app/_components/home-screen.tsx` — `Meal` interface + `todayMeal` state, fetched alongside the existing vision/todos/measures calls; only shown if the latest row's `meal_date` is actually today (an older leftover row from a day the job didn't fire isn't shown as "today's"); thumbs up/down card with optimistic update + rollback toast on failure.
- DB (production, via a one-off script — not a code change): seeded a `scheduled_tasks` row, "Daily Meal Recommendation," cron `0 12 * * *`, `notify = false` (silent — no text), telling Cael to call `list_meal_history` then `set_daily_meal`.

**Verified:** Playwright on a dedicated dev server (:3789) against the same production DB — confirmed the card renders on the Home screen with a seeded test row, thumbs up/down persists via `PATCH /api/meals/:id` (checked server-side, not just optimistic UI state), and toggling the same button off clears feedback. Typecheck passes. Test row deleted afterward; dev server killed by PID.

**Next steps (not done):** Haven't watched a real end-to-end run of the scheduled job (dispatcher fires once daily at 13:00 UTC and only checks day/month/weekday, not the task's own hour/minute, so the `0 12 * * *` cron just needs `*` fields to match — the actual time-of-day is whatever the dispatcher's tick is). Worth Berto checking the Home screen tomorrow morning to confirm a real AI-generated meal shows up, and using the Scheduled Tasks tab's "Run now" on "Daily Meal Recommendation" to test sooner without waiting for the next tick.

## 2026-08-02 — Tasks: oldest-first ordering + a "Created" date on every row

**Ask:** Berto: "can we please sort our todo list by oldest to newest unless they are marked more urgent or in progress? and also show date created" (with a screenshot of the Tasks list).

**Sort.** The per-section comparator in `app/_components/dashboard.tsx` previously only floated daily → in-progress → waiting to the top and otherwise inherited the API's `created_at DESC` (newest first). It now falls through to **priority rank, then `created_at` ascending**:

```
daily → in progress → waiting → priority (urgent > high > normal > low) → oldest created first
```

So the default is oldest-first — nothing quietly rots at the bottom of the list — but anything actively being worked on or flagged more urgent jumps that queue. Two new helpers: `priorityRank()` (a `PRIORITY_RANK` map, because the DB column is text and `ORDER BY priority DESC` sorts alphabetically — `urgent > normal > low > high` — which is wrong; the client re-sorts anyway) and `createdAtMs()` (missing/unparseable dates return `Infinity` so they sink to the bottom rather than jumping to the top).

**Created date.** The row's metadata line was a single `<p>` showing *one* of "Done today" / "Daily" / due date. It's now a wrapping flex row holding that same status chip **plus** a `CalendarDaysIcon` + "Created Jul 12" chip. New `formatCreated()` helper omits the year for the current year and includes it for anything older.

**Not changed:** `app/api/todos/route.ts` still orders `created_at DESC` with a limit. Harmless today (dashboard requests `limit=200`, there are ~59 todos), but worth knowing that if the list ever exceeds the limit the truncation drops the *oldest* rows — exactly the ones now sorted to the top.

**Verified:** Playwright screenshot of `/tasks` against the dev server on :3789 — every row carries a "Created" date, and the non-daily run reads Jul 13 → Jul 14 → Jul 15 ascending with the urgent item floated above it. **Typecheck:** PASS ✓

**Note:** these edits landed in commit `dbfa155` ("pin daily recurring tasks to the top") rather than their own — a concurrent session sharing this checkout committed the whole working tree while this change was in flight.

---

## 2026-08-02 — Real URLs for every section + a Select tool on the sketch canvas

**Ask:** Berto: "can we have a selector option for the sketches section of the app? and can we add to the url /sketches?" Quizzed on both: he picked a **canvas select tool** (arrow/marquee — drag a box, then move/delete what's inside) over a saved-sketch picker dropdown, and **real routes for every section** over query-param URL sync.

**Routing — every section is now a real URL.** The whole app used to be one client component (`app/page.tsx`) holding a `mobileTab` state, so there was only ever `/`.
- `app/page.tsx` → `app/(app)/layout.tsx`. The shell (dashboard sidebar, chat panel, chat modal, mobile bottom nav) lives in the **layout**, not a page, so it persists across navigation — no remount, no lost chat/thread state when switching sections.
- `mobileTab` state is replaced by `PATH_TABS[usePathname()]`, and `setMobileTab` is now `router.push(TAB_PATHS[tab])`. Every existing caller (sidebar nav, home-screen entries + hotkeys, mobile bottom nav + More menu, chat-modal expand, "run job with chat") went through that one function, so they all became real navigations for free.
- Added stub `page.tsx` files (each returns `null`) for `/chat /tasks /notes /lists /calendar /journal /dreams /schedule /media /sketches /measures /vision` plus `/` — they exist to make the routes real; the layout shell renders the UI.
- The layout prefetches all section routes on mount so tab switching stays instant.
- Route names map to the tab ids, with one rename: the `journal-templates` tab lives at `/journal`. `/explore`, `/traces`, `/login` are outside the `(app)` group and unaffected.

**Select tool** (`app/_components/sketches-panel.tsx`) — first tool in the toolbar (`MousePointer2` icon):
- Drag a marquee → dashed outline + a floating duplicate/delete toolbar (flips below the box when there's no room above). Drags under ~6 logical px count as a click and just clear the selection.
- Drag from *inside* the selection to move it: the pixels are lifted onto a detached canvas, the source rect is filled white, and each pointermove repaints `base` + the bitmap at the new spot. One undo step per move, taken at lift time.
- Duplicate stamps a copy at +24/+24 and makes the copy the selection (so it can be dragged straight off the original). Delete fills the region white. Both are one undo step. **Delete/Backspace** deletes, **Escape** clears the selection.
- Selection clears on undo, tool switch, new sketch, and loading a sketch for edit. Because the canvas is a raster, the tool moves *pixels* in the region, not vector objects — text elements are still handled by the existing click-to-edit overlay.
- Zoom/pan needed no special handling: the marquee overlay maps logical→CSS through the canvas's `getBoundingClientRect()`, which already reflects the CSS transform.

**Verified:** 22/22 Playwright checks against the dev server on :3000 — home entry and sidebar both land on `/sketches`, `/tasks` navigation, browser **back** returns to `/sketches` with the panel intact, deep links to `/notes /calendar /measures /vision /journal` all 200. For the select tool, pixel-level assertions: stroke drawn → marquee → move (source reads `[255,255,255]`, destination `[26,26,26]`), duplicate lands at +24/+24, undo removes it, delete wipes the region, undo restores it, switching to Pen clears the selection, and a plain click leaves no mark. `GET /api/sketches` confirmed no stray rows left behind.

**Typecheck:** PASS ✓ · **Build:** PASS ✓ (all 13 section routes prerendered)

---

## 2026-08-02 — Sketches: replaced the custom canvas with Excalidraw

**Ask:** Berto: "is there a kit online to make this robust? look for whiteboard kits for next js, i want it to be on par with miro."

**Research + decision.** Two real contenders:
- **tldraw** (v5.2.5) — closest to Miro (infinite canvas, frames, sticky notes, bound arrows, multiplayer sync built in; used by ClickUp/Google/Autodesk). **Not open source.** A license key is mandatory in production ("the tldraw SDK will not work in production without a valid license key"); the free hobby tier is discretionary, non-commercial only, and **requires a "made with tldraw" watermark on the canvas**; commercial is ~$6k/yr. Since Berto records this app for podcast/YouTube content, that watermark would appear in every video and monetized content is arguably not "non-commercial."
- **Excalidraw** (v0.18.1, **MIT**) — no key, no watermark, no cost. peerDeps allow React 19 (we're on 19.2.6 / Next 16.2.6).

Quizzed him with both plus a "keep what we built" option; he chose **Excalidraw**.

**Schema change — the big one.** Sketches were stored as a flattened PNG, which is why text baked in permanently and nothing was editable on reopen. Added `sketches.scene JSONB` (idempotent `ADD COLUMN IF NOT EXISTS`, also applied to the live Neon DB) holding `{elements, appState, files}`. `image_data` is demoted to a gallery thumbnail (exported at `maxWidthOrHeight: 640`). `GET /api/sketches` now returns `has_scene` instead of the scene body (scenes are large); a new `GET /api/sketches/[id]` returns the full record for opening.

**Panel rewrite** (`app/_components/sketches-panel.tsx`): the hand-rolled canvas — custom toolbar, raster drawing, undo stack, pinch/pan math, the Figma-style shortcut layer, the text overlay — is **gone**, replaced by the `<Excalidraw>` component, which brings its own toolbar, shortcuts (V/R/O/A/L/P/T — near-identical muscle memory), infinite canvas, zoom/pan, undo, shape editing, images and libraries. Kept: the title field, the ~1.5s debounced autosave, the saved-sketch gallery with thumbnail/download/delete, and the full-bleed layout. Excalidraw is loaded via `next/dynamic` with `ssr: false` (it touches `window` at module scope) and themed off `next-themes`' `resolvedTheme`.

**Two traps worth remembering:**
1. `onChange` fires for *viewport* changes too (pan, zoom, selection), so a naive handler marks the sketch dirty constantly. It now diffs element identity against the previous array and ignores no-op changes — without this, merely *opening* a sketch would re-save it.
2. `appState` is persisted as a small whitelist (`viewBackgroundColor`, `gridSize`). The full appState carries transient junk and a `collaborators` Map that doesn't survive a JSON round-trip.

**Legacy sketches** (Berto's 10 existing ones, all `scene = NULL`) open by importing their PNG as an Excalidraw image element — visible, movable, drawable-over, just not un-flattened. Verified they are *not* rewritten on open.

**Verified:** typecheck clean, `npm run build` compiles successfully (`/sketches` builds). Against a dev server on :3789 — Excalidraw mounts with its toolbar; drew rectangle + ellipse + freedraw, autosave produced `has_scene=true` with `scene.elements` = `[rectangle, ellipse, freedraw]` (real objects, not pixels) plus a PNG thumbnail; reloaded the page, reopened from the gallery, shapes returned as editable objects. Synthetic legacy row (image_data, no scene): opening it imports the PNG onto the canvas and leaves `updated_at` and `scene = NULL` untouched. All `zzz-*` test rows deleted; Berto's 10 sketches confirmed intact and untouched.

**Note:** `@excalidraw/excalidraw` is a heavy dependency (it bundles its own fonts/assets). It's client-only and lazily imported, so it doesn't affect other routes.

---

## 2026-08-02 — Sketches: full-bleed canvas sized to the viewport

**Ask:** Berto: "can we make it a bigger canvas? so there are no boarders?" — screenshot showed the page inset inside a rounded/bordered 4:3 frame with grey margin. Quizzed him on which "bigger" he meant (full-bleed drawing area / bigger fixed page / infinite Miro canvas); he chose **full-bleed drawing area**.

**The core change — the page is no longer a fixed 1200×900.** A fixed-aspect page can't fill a variable-aspect viewport without letterboxing, so `CANVAS_W`/`CANVAS_H` constants were replaced by `canvasSize` state measured from the container (1 canvas px per CSS px at 100% zoom, capped at 2400×1600 because undo snapshots are full-canvas `ImageData`). `DEFAULT_CANVAS_W/H` remain as the pre-measurement fallback.

**Sizing rules:**
- While the canvas is *pristine* (`!dirty && editingId === null`) a `ResizeObserver` keeps the raster matched to the viewport, so the page always starts edge-to-edge and follows window resizes.
- Once there's artwork, the size **locks** — assigning `width`/`height` to a `<canvas>` wipes its bitmap, and the undo snapshots are size-specific. Resizing the window mid-sketch must not destroy the drawing.
- Opening a saved sketch resizes the raster to that image's *own* natural dimensions and draws it 1:1, so old sketches are never rescaled or re-encoded at a new aspect. Since a 4:3 page is taller than a wide viewport, a new `zoomToFit()` runs after every raster resize so it opens fully visible rather than cropped. `⇧1` is now "zoom to fit" (was a duplicate of `⇧0` = 100%).

**Layout:** viewport div lost `aspect-[4/3] rounded-xl border border-border`, gained `-mx-4 w-[calc(100%+2rem)]` to cancel the panel's padding and `h-[calc(100%-6.5rem)] min-h-[22rem]` to claim the height the title+toolbar rows leave. Panel is `h-full`, and dashboard.tsx's sketches wrapper gained `h-full`. Gallery sits below the fold.

**Also fixed:** `clampPan` assumed content size == `viewport × zoom`, which is only true when the page exactly fills the viewport. It now measures the canvas element, so a differently-shaped page can still be panned to its hidden edge.

**Files:** `app/_components/sketches-panel.tsx`, `app/_components/dashboard.tsx`.

**Verified:** typecheck clean. Playwright at 1440×900 — canvas box is pixel-identical to its viewport box (L/T/R/B gaps all 0) and reaches the window edge; raster 1219×699. Drawing maps 1:1 (a stroke dragged from x=300 lands at canvas x=296). Undo works at the new size. Opening legacy "2026 goals" resizes the raster to its own 1200×900, renders (23240 ink px) and auto-fits at 76% with nothing cropped. Full create→autosave→reopen cycle on a throwaway sketch: saved PNG is 1219×699, round-trips with content intact — test row deleted afterwards. 390×844 and 820×1180 viewports are full-bleed with no page errors.

**Housekeeping:** my tests left one blank "Untitled" sketch (id 13, 1219×699 = the headless viewport) which I deleted. A second blank "Untitled" (id 14, 1293×403) came from Berto's own live browser session during the work and was left alone — it's empty and safe to delete if he wants.

---

## 2026-08-02 — Sketches: Figma/Miro keyboard shortcuts

**Ask:** Berto wanted keyboard shortcuts on /sketches "similar to figma or miro". Quizzed him on scope; he picked the full set (tools + edit + view + space-to-pan + cheat sheet) over the smaller options.

**Shortcuts:** `V` select, `P` pen, `E` eraser, `R` rectangle, `O` ellipse, `L` line, `A` arrow, `T` text; `⌘Z` undo, `⌘D` duplicate selection, `Delete`/`Backspace` delete selection, `Esc` deselect; `⌘+`/`⌘−` zoom, `⌘0`/`⇧0`/`⇧1` reset to 100%, hold `Space` + drag to pan; `?` opens a cheat-sheet dialog (also reachable from a keyboard icon in the toolbar). Tool buttons now show their key in the tooltip/aria-label ("Pen (P)").

**Key decision — the canvas owns the keyboard.** `layout.tsx` binds app-wide letter hotkeys on window (`t` = Tasks, `n` = new task, `c` = chat), and Figma's `T` is the text tool, so they collided. The sketch handler is registered in the **capture** phase and calls `stopPropagation()` for keys it owns, which beats the layout's bubble-phase listener without touching `layout.tsx`. Since `T` is now a tool, `n` and `c` are swallowed too (`SUPPRESSED_GLOBAL_KEYS`) — otherwise a stray keystroke navigates away from a half-finished sketch. Leave the canvas via the sidebar.

**Two traps worth remembering:** (1) capture-phase `stopPropagation` would also swallow `Escape` before Radix sees it, so the handler bails out entirely when `[role="dialog"]`/`[role="alertdialog"]` is in the DOM — without that, the cheat sheet and the delete-confirm dialog can't be dismissed with Escape. (2) Space is grabbed for panning, which would break Space-to-activate on a focused button, so the space branch returns early when the event target is inside a `button`.

**Also:** the shortcuts `useEffect` had to be placed *after* `handleUndo`/`resetCanvas` in the component body — referencing them in the dependency array from an earlier position is a TDZ ReferenceError at render time, not a lint nit.

**Files:** `app/_components/sketches-panel.tsx` only (hotkeys on `TOOLS`, `TOOL_BY_HOTKEY`, `SHORTCUT_GROUPS`, `SUPPRESSED_GLOBAL_KEYS`, the capture-phase key effect, space-pan wiring in the three pointer handlers, `?` toolbar button + `Dialog` cheat sheet).

**Verified:** typecheck clean. Playwright against the dev server on :3000 — all 8 tool keys switch the active tool and `t` stays on /sketches instead of navigating to Tasks; `n`/`c` likewise no longer navigate; `⌘=`/`⌘−`/`⇧0` step zoom 100→125→156→125→100%; space+drag moves the pan transform while leaving the canvas pixels untouched (nothing drawn) and applies `cursor-grab`; a stroke draws 3888 ink px and `⌘Z` returns it to 0; `⌘D` offsets the selection box by the expected +24 logical px; `Delete` clears the selection's pixels; `Esc` removes the marquee; `?` opens the cheat sheet and `Escape` closes it. No page errors, and `GET /api/sketches` confirmed the tests left no stray rows.

---

## 2026-08-02 — Sketches: usable pinch zoom (damped + zoom out past 100%)

**Ask:** Berto: "i need to pinch scroll to zoom in and out of the /sketches page."

**Diagnosis:** pinch-to-zoom already existed (ctrl/cmd+wheel handler on the canvas viewport), but it was effectively unusable for two reasons. (1) The zoom factor was `Math.exp(-deltaY * 0.01)` — Chrome sends `deltaY ≈ ±120` per trackpad pinch tick, so a *single* tick jumped 100% → 332% and a second hit 547%, i.e. the tiniest pinch slammed to `MAX_ZOOM`. (2) `MIN_ZOOM` was `1`, so there was no zooming *out* at all — only back to fit.

**What changed** (`app/_components/sketches-panel.tsx`):
- Damped the wheel zoom: `WHEEL_ZOOM_SENSITIVITY = 0.0025` plus a per-event cap of `MAX_WHEEL_STEP = 1.25`, so no single wheel/pinch event can change zoom by more than 1.25× either direction regardless of how big the device's delta is.
- `MIN_ZOOM: 1 → 0.25`, so you can zoom out to 25% and see the whole page small.
- `clampPan` now centres the canvas on each axis when the scaled content is smaller than the viewport (previously it pinned to top-left, which would have parked the zoomed-out canvas in the corner).
- Canvas viewport background `bg-white → bg-muted`, because at <100% the white "paper" was invisible against a white viewport.

**Verified:** `npm run typecheck` clean. Live in Playwright against the running dev server on :3000 — one pinch tick 100% → 125% (was 332%), climbs to 800% max over repeated ticks, pinch-out reaches 25% min, canvas measured centred at 25% (left gap 385.4px == right gap 385.4px), Reset zoom returns to 100%. Also drew a stroke at 51% zoom and read back the pixel at logical canvas centre (600,450) → ink, confirming pointer→canvas coord mapping still holds below 100%. Confirmed via `GET /api/sketches` that the tests created no stray rows.

**Note:** committed as a single-file change while two other sessions had unrelated in-flight work in the same checkout (an `app/(app)/` routing refactor and a new select/marquee tool in this same file); only the four zoom hunks were staged, the other sessions' working-tree changes were left untouched.

---

## 2026-07-31 — Sketches: autosave + title moved to top

**Ask:** Berto wanted the canvas to autosave instead of a manual Save button, and the title field moved near the top of the panel.

**Decisions (owner chose via quiz):** debounce ~1.5s after the last edit (stroke, shape, text change, or undo) rather than gating on title-first or save-on-blur-only; title defaults to "Untitled" if left blank when a save fires. The manual Save button was removed in favor of a small status indicator next to the title (`Saving…` / `Unsaved` / `Saved`).

**What was built:** `app/_components/sketches-panel.tsx` — title `Input` moved above the toolbar with the autosave status label beside it. `handleSave` became `autoSave`: no longer resets the canvas or requires an explicit click — on first save it POSTs and adopts the returned id (so subsequent edits PATCH the same row); it reads `editingId`/`title`/`texts` via refs so the debounce timer isn't re-armed by unrelated re-renders. Added a `markDirty()` helper (bumps an `editVersion` counter alongside `dirty`) so the debounce effect — keyed on `editVersion`, not `dirty`/`texts` — resets on every discrete edit even when `dirty` was already `true` (e.g. consecutive pen strokes). `handleUndo` now also calls `markDirty()` so undo triggers a save. Renaming the title while an existing sketch is loaded (`editingId` set) also triggers autosave; typing a title on a still-blank canvas does not create a sketch. `resetCanvas`/`handleEdit` cancel any pending autosave timer first, so clicking "New sketch" or switching to edit a different sketch can't let a stale debounced save leak a stray/blank row.

**Verified:** typecheck clean. Live in Playwright against `PORT=3789`: drew a stroke with a title set → confirmed "Unsaved" status → waited past the debounce → confirmed "Saved" status and the row existed via `GET /api/sketches` → cleaned up. Second run: drew + immediately clicked "New sketch" before the debounce fired → confirmed no stray/blank sketch was created after waiting out the debounce window.

---

## 2026-07-31 — Sketches: click-to-edit/duplicate/delete text elements

**Ask:** Berto wanted to click a piece of placed text on the Sketches canvas to edit, delete, or duplicate it — previously text was rasterized straight into the canvas pixels on commit, so it was permanent and unselectable.

**What was built:** `app/_components/sketches-panel.tsx` — text placed with the Text tool is now kept as an editable object (`{id, x, y, value, color, size}` in a `texts` array) instead of being drawn onto the raster canvas immediately. Each text element renders as a DOM overlay positioned over the canvas (converted via a `canvasToCss` helper that accounts for the current zoom/pan). Clicking a text string selects it and shows a small floating toolbar (Edit / Duplicate / Delete icons). Edit reopens the same floating input used for placing new text; Duplicate offsets a copy by 24 canvas px; Delete removes it. On Save, all text elements are composited onto an offscreen copy of the canvas (drawImage + fillText per element) before `toDataURL`, so the saved PNG looks identical to before — only the in-progress editing experience changed.

**Trade-off:** text add/edit/delete/duplicate are not tracked in the pen/shape undo stack — Escape or the toolbar buttons are the way to reverse a text action. Sketches loaded for editing start with an empty `texts` array (their prior text is already baked into the loaded PNG pixels), so this only helps for text placed in the current editing session going forward.

**Verified:** typecheck clean. Live in Playwright against `PORT=3789` dev server: placed text → selected it → toolbar appeared → duplicated → edited the duplicate's value → deleted the original → confirmed via page text; saved a sketch with placed text and confirmed via `GET /api/sketches` that the returned image_data was non-trivial (composited), then deleted the test sketch to clean up.

---

## 2026-07-30 — Calendar page: Google Calendar view/edit via FullCalendar

**Ask:** Berto wanted a calendar page in the app, backed by his Google Calendar, with add/edit from the app.

**Decisions (owner chose via quiz):** FullCalendar as the calendar kit (over Schedule-X / react-big-calendar); auth via our **own Google OAuth app** with a one-time consent flow + stored refresh token (over eve/Vercel connections or pasted raw tokens). Pinned FullCalendar to **v6** (`^6.1.21` for core/react/daygrid/timegrid/interaction) — v7 shipped mid-build with a totally different plugin/theming API; v6 is the stable, documented line.

**What was built:**
- `lib/google.ts` — OAuth helpers: consent URL, code→token exchange, `getAccessToken()` (auto-refreshes with 60s slack, deletes the row on `invalid_grant` to force reconnect), `gcalFetch()` against the Calendar v3 REST API (no googleapis SDK). Tokens live in a new single-row `google_auth` table (id=1) in Neon — env vars can't be written at runtime on Vercel. **Bonus:** `.env.local` already had `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` from a prior setup, and that refresh token already carries full `calendar` scope — so `getAccessToken()`/`getGoogleConnection()` fall back to `GOOGLE_REFRESH_TOKEN` when no DB row exists (validated + cached into the DB on first use). The calendar worked with zero consent clicks; the `/api/google/connect` flow remains for re-auth or a future account switch.
- `app/api/google/{connect,callback,status}/route.ts` — consent redirect (CSRF state cookie, 10 min), callback (exchange + store + fetch account email, redirects to `/?google=connected|error`), status (GET: configured/connected/email; DELETE: revoke + disconnect). No middleware change needed — Berto is logged in when clicking Connect, so the session cookie rides along on Google's redirect.
- `app/api/calendar/events/route.ts` + `[id]/route.ts` — proxy the **primary** calendar: GET (timeMin/timeMax, `singleEvents=true`), POST, PATCH (clears the unused date/dateTime variant so all-day↔timed flips stick), DELETE (410 = already gone = ok). Google↔FullCalendar mapping is direct: both use exclusive end dates for all-day events. Not-connected surfaces as HTTP 409 `not_connected`, which the panel turns into the Connect screen.
- `app/_components/calendar-panel.tsx` — FullCalendar month/week/day with drag-to-move, drag-to-resize, select-to-create, click-to-edit; shadcn Dialog for create/edit/delete (title, all-day toggle, start/end, description — the form shows the *inclusive* all-day end date, ±1 day converted at the API boundary); connected-account row with Disconnect; states for unconfigured (env vars missing) / disconnected (Connect button) / connected; OAuth redirect result toasted once then stripped from the URL.
- Wiring: new "Calendar" tab in `dashboard.tsx` NAV_ITEMS + `page.tsx` MobileTab/MORE_TABS + `home-screen.tsx` HomeTarget/SECTIONS (hotkey `g`). `lib/db.ts` — `google_auth` in `ensureSchema()`. `globals.css` — `--fc-*` vars mapped to the app theme (orange primary, muted borders, today tint).

**Verified:** typecheck clean. Live against dev server on :3789 with Berto's real Google account: full CRUD round-trip via the API (create → rename+move → confirm → delete → confirm gone, nothing left behind); Playwright screenshots — month view desktop (real events, themed), week view, event-click edit dialog, mobile month via More→Calendar (246 events rendered; first mobile shot was blank from screenshot timing only). Dev server killed by PID after.

**Next steps (open):** prod needs `GOOGLE_CLIENT_ID/SECRET` (and optionally `GOOGLE_REFRESH_TOKEN`) in Vercel env — likely already there since `.env.local` was pulled from Vercel; if prod shows "not configured", add them in the dashboard and add `https://cael-agent.vercel.app/api/google/callback` as an authorized redirect URI on the Google OAuth client. Possible follow-ups: agent tools so Cael can read/create events, multi-calendar support (currently primary only), event colors per calendar.

---

## 2026-07-18 — Home screen: 8 forms of wealth replace hero title + pillars

**Ask:** Berto reframed his philosophy — instead of "Freedom, Happiness, Health" + 3 pillars, the home screen should show his **8 forms of wealth**: Growth, Wellness, Family, Craft, Money, Community, Adventure, Service — with icons from a nice shadcn-adjacent library.

**Decisions (owner chose via quiz):** Phosphor icons (`@phosphor-icons/react`, duotone weight) over Tabler/Lucide; the 8 forms are **hardcoded in the UI** (like `SECTIONS`), not stored in vision_items; the grid **replaces** the big hero headline + pillars (greeting kicker stays, big type goes).

**What was built:**
- `app/_components/home-screen.tsx` — new `WEALTH_FORMS` constant (label + Phosphor duotone icon + nav target). Renders as a 4×2 grid (2-col mobile) of cards under the "{greeting}, Berto — your 8 forms of wealth" kicker. The Money card keeps the savings meter (from `measures` savings_snapshot) and opens Measures; Wellness → Measures; Adventure → Dreams; the rest → Vision. Removed: hero title block, pillars section, `pillarMeta()`, the `/api/vision?kind=statement` fetch, `VisionStatement` interface, and now-unused lucide icons/Skeleton. Vision tab and DB untouched.
- `package.json` — added `@phosphor-icons/react` ^2.1.10.

**Verified:** typecheck clean; Playwright screenshots (1440×900, 390×844) confirm grid, duotone icons, Money meter, and intact hero/mantra/Go-To sections. Gotcha hit: `.env.local` was re-pulled by a concurrent session and `BASIC_AUTH_PASSWORD` is now double-quoted — cookie scripts must strip quotes.

**Follow-up (same day): all 8 visions seeded + Cael wired to the philosophy.**
- Seeded the remaining 7 vision statements via the API in Berto's words (ids 8–14): Wellness (calm/energized state of being, vegetarian, 8h sleep, daily workouts), Family (loved ones weekly, belonging, family dinners), Craft (agents millions rave over; passion not money), Money (specific knowledge + accountability + leverage → $10M+ net across businesses), Community (MakersLounge self-owned at 100k+, 1M members total), Adventure (travel every quarter, awe and wonder), Service (everything in service of the world). The 4 pre-2026-07-18 statements still exist alongside.
- **Agent wiring (owner chose via quiz: instructions + Daily Note, no weekly review):** `agent/instructions.md` gained a "The 8 forms of wealth" section — forms are the values, vision per form = newest statement titled with the form name, read via `list_vision`, frame guidance/tasks by form, name drift warmly, keep statements in sync via `update_vision_item`. The Vision purpose bullet cross-references it. **Daily Note (scheduled_tasks id 6) prompt rewritten** via PATCH: calls `list_vision` live each morning (edits flow through with no further prompt changes), spotlights 1–2 rotating forms, ties TODAY items to the forms they serve, keeps the daily-behaviors close and SMS formatting; cron (0 12 * * * UTC) and notify untouched. Old prompt preserved in git history of this file only — it was: goal hierarchy freedom/happiness/health → investments/fitness/relationships → daily behaviors.
- **Verification note:** a live chat test confirmed the new instructions load (Cael reached for `list_vision` unprompted) but the tool failed with a serialization error in the **dev** eve runtime — the DB query + rows verified clean/serializable directly, and a concurrent session had just restarted the dev server (stale eve snapshot suspected, see memory `manual-trigger-morning-digest` gotchas) and was mid-refactor on the chat UI, so live re-test was abandoned rather than `rm -rf .eve` under their server. Re-verify in chat once that session settles; prod compiles fresh on deploy.

**Follow-up (same day): Methods section (daily practices per form).** After values (grid) and Vision, home gains a **Methods** section — the concrete daily/weekly practices per form. Stored as a new `vision_items` kind **`method`** (title = form name, content = practices; newest per title wins). Changes: `app/api/vision/route.ts` accepts kind `method` (requires title + content); agent tools `list_vision` + `add_vision_item` enums extended (update/delete already kind-agnostic); `agent/instructions.md` 8-forms section teaches methods as the day-to-day yardstick; home screen fetches `?kind=method` and renders Vision + Methods from one shared section renderer (same 8-form list, placeholders "Add your methods for X…"). All 8 methods seeded (ids 15–22, via direct DB insert because the shared dev server was down mid-task): Growth (sweaty workout/reading/meditation/yoga/fasting daily), Wellness (yoga, sweaty workout, 8h sleep, vegetarian, loved ones, alcohol-free, sunlight daily + farmers market weekly), Family (see/call weekly, serve weekly, all holidays, care/trust/laugh/play — normalized from Berto's question phrasing to declaratives), Craft (learn frontier/build/teach/work for & with others daily; obsessive flywheel until "Anthropic comes calling"), Money (keep improving craft; own with full control; scale via content/code/community/charisma), Community (contribute; surround with high achievers sharing values), Adventure (plan it; try something new daily; feel the awe), Service (wake up every day to serve others). Note: the Vision tab UI doesn't yet show/edit kind `method` items — edit via Cael or ask Claude. Daily Note prompt not yet methods-aware (deliberate; offer later).

**Next steps (open):** per-card destinations are a first guess — adjust `WEALTH_FORMS[].target` as desired; could later swap remaining generic daily-art photos for real destinations with `place` links.

**Follow-up (2026-07-26): eye icon expands the card inline to show Vision + Methods.** Berto wanted a quick way to peek at a form's vision without navigating away from home. Each of the 8 wealth-form cards has a small eye icon (top-right) that toggles that card's Vision and Methods text inline (falls back to an italic "not written yet" placeholder), instead of a separate popup. First pass used a shadcn `Dialog` modal; Berto asked to expand the card itself instead, so it was swapped for an inline expand. Clicking the eye icon stops propagation so it doesn't also trigger the card's normal `onNavigate` click. Implementation: `app/_components/home-screen.tsx` — card markup restructured so the `Card` is the outer element (was previously wrapped in a nav `<button>`); the nav button is now `display:contents` so the existing icon/label/savings-meter layout is unchanged, with the eye button absolutely positioned as a sibling. New `expandedForm` state (single form open at a time) drives a conditional `col-span-2 sm:col-span-4` on the expanded card plus a bordered Vision/Methods block appended below the label — reusing the already-fetched `formVisions`/`formMethods` maps (no new fetch, no Dialog import needed). Verified: typecheck clean; Playwright against the running dev server confirmed the card grows full-width and shows correct per-form content, and other cards (incl. Money's progress bar) reflow correctly around it.

**Follow-up (same day): Vision section per form of wealth.** The 8 forms are now framed as *values*; below the grid a new **Vision** section lists all 8 forms with each one's ideal-state text. Decisions (owner via quiz): vision text lives in the DB as vision **statements whose Area/title = form name** (vision changes every few years; editable in the Vision tab or via Cael — no code change per edit); all 8 forms always render, unfilled ones show a muted italic "Write your vision for X…" placeholder; section sits on home between the values grid and the mantra. Implementation: home screen re-fetches `/api/vision?kind=statement`, builds a lowercased title→content map (rows are newest-first, first match per form wins), rows are buttons → Vision tab. Seeded statement id 7 "Growth" ("I am doing hard things every day — cold showers, waking up early, meditating, reading, working out, teaching myself to do hard things."). The four pre-existing statements (old hero + pillars) were left in the DB untouched. Berto still to fill in the other 7 forms' visions.

**Follow-up (2026-07-26): new "Routines" section — Weekly Workout Routine.** Home gains a **Routines** section (between the timeline and the daily-behaviors mantra) for named, recurring schedules — reference-only, no daily check-off (owner chose via quiz: reference text over a trackable habit tracker, home-screen section over a new tab). Decisions: stored as a new `vision_items` kind **`routine`** (title = routine name, content = one line per day/period, same pattern as `method`/`milestone` — newest per title wins if edited). Implementation: `app/api/vision/route.ts` — `routine` added to `KINDS` + validation (title + content required); `agent/tools/list_vision.ts` / `add_vision_item.ts` — `routine` added to the kind enum, descriptions, `toModelOutput`; `agent/instructions.md` — new "Routines" subsection teaching Cael to check the day's routine when the user reports on training; `app/_components/home-screen.tsx` — fetches `?kind=routine`, dedupes to one card per routine name, renders each schedule line with its day/period bolded (split on first `:`). Seeded id 25, "Weekly Workout Routine" — Berto's own words: goal is optimizing for Hyrox Worlds while staying excellent at work; Sat/Sun mornings are a big Hyrox workout with a long 10K walk in the evenings; weekdays are a no-music, light 5:00/km 10K run in the morning (deliberate flow-state/efficiency play before work) and heavy, easy-paced lifts at 8pm with long rests between sets (push hard, feel good, set up for sleep). Verified: typecheck clean; Playwright screenshot against Berto's own running dev server (port 3001 — port 3000 was a different project, `frontier-walkthroughs`) confirms the card renders with correct goal/schedule text.

**Follow-up (same day): Routines rendered as a horizontal week box.** Owner wanted the Weekly Workout Routine to look like a horizontal week box rather than stacked lines. Reworked the storage format to one line per single day (`"Monday (AM): ..."`, `"Monday (8pm): ..."`, etc. — Mon–Fri now each have their own two lines instead of a shared "Monday–Friday" range) and added `parseRoutine()` in `app/_components/home-screen.tsx`, which splits a routine's content into an optional `Goal:` line plus a day→entries map. The card now renders a horizontal, per-day scroll strip (`ROUTINE_DAYS`, fixed `w-[108px]` columns so long entry text wraps instead of stretching the column) — Mon–Fri (or Mon–Thu on narrower viewports) visible at a glance, Sat/Sun a short scroll away; empty days show a muted "—". Updated `vision_items` id 25's content via `PATCH /api/vision/25` to the new per-day format. Verified: typecheck clean; Playwright screenshots at 1280×900 (desktop, scrolled to confirm Sat/Sun render with their shorter Hyrox/walk entries) and 390×844 (mobile) against Berto's running dev server. Gotcha: a concurrent session was mid-flight on a timeline zoom feature (`TIMELINE_GRANULARITIES`) in the same file — left untouched/uncommitted-by-me but present in the working tree per this project's shared-checkout convention.

**Follow-up (2026-07-26): "The road to 2030" timeline.** After the 8-forms grid, home now shows a vertical roadmap for the years 2026–2030 — one milestone per year, with a dot-and-line timeline (filled orange dot = milestone written, muted dot + italic "Add your {year} milestone…" placeholder otherwise). Decisions (owner via quiz): content is a simple year-by-year milestone (not derived from the 8 forms' vision text); stored as a new `vision_items` kind **`milestone`** (title = year e.g. "2027", content = the milestone text) — same pattern as `statement`/`method`, no new table; vertical timeline with a connecting line was chosen over a horizontal scroll strip (revised same day — see follow-up below). Implementation: `app/api/vision/route.ts` — `milestone` added to `KINDS` + validation (title + content both required); `agent/tools/list_vision.ts` and `add_vision_item.ts` — `milestone` added to the kind enum, descriptions, and `toModelOutput` formatting; `agent/instructions.md` — new "The road to 2030" subsection under the 8-forms section teaching Cael to read/add/update milestones and connect current pacing to the year's milestone, without inventing one if it's blank; `app/_components/home-screen.tsx` — new `TIMELINE_YEARS` constant (`["2026".."2030"]`), fetches `/api/vision?kind=milestone` alongside the existing vision/method fetches (reuses `toFormMap`), renders as a new section between the wealth-forms grid and the daily-behaviors mantra. Verified: typecheck clean; seeded two test milestones (2026, 2028) via the API against a correctly-isolated dev server on port 3789, confirmed filled vs. placeholder dot states and the connecting line via Playwright screenshot, then deleted the test rows. Gotcha hit: port 3000 was NOT focuspoint this session (it was a different local project, `frontier-walkthroughs`, coincidentally also serving 200s) — always verify a dev server's cwd with `lsof` before trusting a port.

**Follow-up (same day): timeline flipped to left-to-right.** Berto looked at the vertical roadmap and asked for it to run left to right instead of top to bottom. `home-screen.tsx` — the timeline is now a horizontal `flex` row (`overflow-x-auto` for narrow screens), each year an equal-width column with the dot + connecting line running horizontally above the year label and milestone/placeholder text; same data (`TIMELINE_YEARS`, `milestones` map) and empty/filled dot styling, no other logic changes. Verified: typecheck clean; Playwright confirmed the horizontal layout at 1280px and that the row scrolls horizontally on a 390px mobile viewport to reveal 2029/2030.

**Follow-up (same day): 2027 milestone content + granularity zoom, full-bleed width.** Berto gave the actual 2027 content (10K LinkedIn followers via daily posts, daily Frontier Walkthroughs content, Aucctus sold for $100M via daily Venice-system/demo/pipeline effort, Hyrox Hong Kong via daily training) — saved as `vision_items` id 26, kind `milestone`, title "2027", combining all four into one entry (owner's choice via quiz, over splitting the daily practices into the relevant forms' Methods too). Then Berto asked for a granularity toggle (3 Years / 1 Year / 1 Quarter) and for the timeline to run full viewport width, side-scrollable. Decisions (owner via quiz): all three zoom levels reuse the same 5 yearly milestones — no new quarter/month data — "1 Year" and "1 Quarter" just make the clicked/focused year's column wide (showing its full text) while the rest compress to thin dot+year markers, with "1 Quarter" zooming further than "1 Year"; the timeline breaks out to full browser width like the hero photo, independent of the centered `max-w-2xl` content column above and below it. Implementation: `app/_components/home-screen.tsx` — new `TIMELINE_GRANULARITIES` constant (`full`/`year`/`quarter` with labels "3 Years"/"1 Year"/"1 Quarter") and `timelineGranularity` + `focusedYear` state (`focusedYear` defaults to the current calendar year if it's in `TIMELINE_YEARS`, else the first year); the single `mx-auto max-w-2xl px-6` content wrapper was split into three siblings — one for the vision card + 8-forms grid, a full-width middle section for the timeline (heading + granularity toggle still centered at `max-w-2xl`, but the scrollable year row spans the full flex container), and one for routines/mantra/Go-To — so only the timeline row is edge-to-edge; each year column is now a `<button>` (disabled when granularity is `full`) that sets `focusedYear` on click, with width driven by `cn()` (`flex-1` when full; a fixed wide px width when focused in year/quarter mode; a fixed narrow px width when unfocused), and unfocused/compact columns hide the milestone text, showing only the year label. Verified: typecheck clean; Playwright confirmed all three granularities at 1440px (full-width row spanning past the centered card column), clicking a compact year re-focuses it in year/quarter mode, and the row scrolls horizontally on a 390px mobile viewport when the focused column pushes others off-screen.

## 2026-07-18 — Home screen: daily artwork is now a full-bleed hero

**Ask:** Berto wanted the daily art on the home screen to be the full hero section instead of a rounded, bounded box.

**Decision (owner chose via quiz):** full-bleed image edge-to-edge at the top with the Cael header overlaid on the image; the greeting + "Freedom, Happiness, Health" vision text stays below on the page background (not overlaid magazine-style).

**What was built:**
- `app/_components/home-screen.tsx` — the `DAILY_ART` image moved out of the `max-w-2xl` content column to the top of the scroll container: full viewport width, taller (`h-52 sm:h-72 lg:h-80`), no rounded corners. Header (Cael avatar/date, pin button, theme toggle) is absolutely positioned over the image in white with a top dark gradient for legibility; caption sits over a bottom gradient, both aligned to the `max-w-2xl` content column. Header is extracted into a `header(onImage)` helper — if the Unsplash image fails to load (`artFailed`), the header falls back into the normal page flow exactly as before.
- `app/_components/mode-toggle.tsx` — `ModeToggle` now accepts a `className` prop (merged via `cn`) so the home hero can render it white-on-image.

**Verified:** typecheck clean; Playwright screenshots at 1440×900 and 390×844 against the running dev server (localhost:3000) confirm the full-bleed hero, overlaid header, and content below on both.

**Follow-up (same day):** hero caption can now link to Google Maps. Owner chose (via quiz) "real places only": `DAILY_ART` entries gain an optional `place` field (a maps query); captions with `place` render as an `<a>` (new tab, `https://www.google.com/maps/search/?api=1&query=…`) with an ↗ icon + hover underline; mood captions ("Confetti night", …) stay plain text. Only the Lago di Braies entry has a verifiable location today — add `place` to future entries as they're identified; don't guess locations for generic stock photos. Verified with Playwright: link click opens the maps URL in a popup tab.

---

## 2026-07-18 — Floating semi-transparent new-chat modal

**Ask:** Starting a chat (C shortcut, "New chat" buttons) navigated to the full chat page. Berto wanted a fleeting, semi-transparent chat modal instead, still built on the assistant-ui components.

**What was built:**
- `app/_components/chat-modal.tsx` — new. Floating glass dialog (centered, `bg-background/75` + `backdrop-blur-2xl`, rounded, animated in via new keyframes in `globals.css`) containing the full assistant-ui `<Thread>` + `CalendarToolUI` on a fresh eve agent. Header: Cael avatar + status dot, an expand button ("Open full chat"), and close. Esc or backdrop click dismisses. Exports `NEW_CHAT_EVENT`/`requestNewChat()` so any new-chat control can open it (same window-event idiom as pin mode). Thread/composer backgrounds overridden to transparent inside the modal (`[&_.aui-thread-root]:bg-transparent`, `[&_.aui-thread-viewport-footer]:bg-transparent`) so the glass shows through.
- `hooks/use-thread-agent.ts` — new. Extracted the thread↔agent wiring that lived in `AgentChat` (restore snapshot, save on finish, optimistic title from first user message) so the modal and the full page share it. `AgentChat` refactored to use it; behavior unchanged.
- `app/_components/threads-provider.tsx` — new `createThread()` (persists a thread WITHOUT switching the main chat view to it; `newThread()` now wraps it). `remove()` now waits for that thread's create POST before firing DELETE, so dismissing a just-opened modal can't race the insert and orphan the row.
- `app/page.tsx` — `modalThreadId` state; C shortcut and `NEW_CHAT_EVENT` open the modal (C is inert while it's open); closing a modal with no messages deletes the empty thread (no more "New chat" clutter in history); expand promotes the thread to the full chat page (`switchTo` + chat tab). Note: `createThread()` is called *outside* the state updater — inside it, React StrictMode's double-invoke created two threads and leaked one (caught live in verification).
- `app/_components/chat-sidebar.tsx` + `AgentChat`'s mobile history overlay — their "New chat" buttons now `requestNewChat()` instead of `newThread()`.

**Behavior decisions (assumed, flag if wrong):** all *new chat* entry points open the modal (existing threads from history still open the full chat page); a modal chat lands in thread history like any other; expanding mid-turn shows only what's already snapshotted (per-turn onFinish), so expand right after a reply is lossless.

**Verification (Playwright vs Berto's running dev server on :3000 — my own :3789 instance was refused since Next 16 allows one dev server per dir):** 16/16 checks — C opens modal without navigating, panel computed style is 75% alpha + blur(40px), thread persisted server-side, Esc closes + deletes empty thread, real message send streams in modal, title derived, thread with messages survives close, "New chat" pill opens modal, expand lands on full chat page, typing 'c' in a composer doesn't trigger, all test threads cleaned up, zero page errors. Screenshot-verified the glass look over the home hero. Typecheck PASS ✓.

**Gotcha:** a concurrent session was mid-flight on `home-screen.tsx` (hero maps links) — left uncommitted, excluded from this commit.

---

## 2026-07-16 — Pin mode (always-on-top top-3 focus window) + task timers

**Ask:** Berto wanted a "pin mode" button in the top-right that pins the Cael desktop app to the top-left corner — above every other window, slightly transparent, no bottom nav — as a daily reference, plus a Start button on tasks that times work on them ("I need to always be getting my top 3 things done").

**Decisions (owner chose via quiz):** one timer at a time (starting a task stops the previous one); accumulated time saved to DB (`timer_started_at` + `time_spent_seconds` on todos); pinned window shows only the top 3 tasks; Start also marks the task in-progress (Stop leaves in-progress alone).

**What was built:**

*Data + API*
- `lib/db.ts` — `todos.timer_started_at TIMESTAMPTZ`, `todos.time_spent_seconds INTEGER NOT NULL DEFAULT 0` (migrated live via `scripts/migrate.ts`).
- `app/api/todos/[id]/timer/route.ts` — new. `POST {action: "start"|"stop"}`. Start banks + clears every other running timer (`time_spent_seconds += EXTRACT(EPOCH FROM NOW()-timer_started_at)`), then sets `timer_started_at = COALESCE(timer_started_at, NOW())` (idempotent) and `in_progress = TRUE`. Stop banks + clears that task only.
- `app/api/todos/route.ts`, `[id]/route.ts` — timer fields added to all SELECT/RETURNING lists.
- `[id]/complete/route.ts` + `agent/tools/complete_todo.ts` — completing a task banks any running timer first (both recurring and normal branches).

*Web UI*
- `app/_components/pin-button.tsx` — new. Pin icon button; renders **only inside the Tauri shell** (`window.__TAURI__` present), dispatches `cael:pin` on window. Placed in three headers: agent-chat (top-right), dashboard, home screen.
- `app/_components/pin-view.tsx` — new compact view: header (Cael + date + unpin), top 3 open tasks sorted running → in-progress → priority (urgent>high>normal>low) → due date → newest. Each row: complete-checkbox, title in priority color, Start/Stop pill, live ticking timer (banked + elapsed, mono font) when running, "Xm tracked" when banked. Polls /api/todos every 60s + on window focus. Recurring tasks completed today are filtered out (treated as done for the day).
- `app/page.tsx` — `pinned` state; listens for `cael:pin`; pinned renders `<PinView>` **only** (no bottom nav, no other panels) and calls `setNativePinMode(true)`; unpin restores. T/N/C global shortcuts disabled while pinned.
- `lib/desktop.ts` — new. `isDesktopApp()` + `setNativePinMode()` (invokes Tauri `set_pin_mode`, no-op in browser / old shells).
- `app/_components/dashboard.tsx` — Todo type gains timer fields; right-click context menu gains "Start timer"/"Stop timer" (above the in-progress toggle); a "Timing" badge (TimerIcon) replaces the "In progress" badge while a timer runs.

*Desktop shell (needs one-time rebuild + reinstall — done today)*
- `desktop/src-tauri/src/main.rs` — `set_pin_mode` command: pinned → always-on-top, 360×480 at (12, 40) top-left, NSWindow `alphaValue 0.92` (via `objc` msg_send on main thread); unpinned → restore 1280×860 centered, opaque. Registered via `invoke_handler`.
- `desktop/src-tauri/tauri.conf.json` — `withGlobalTauri: true` so the remote web app gets `window.__TAURI__`.
- `desktop/src-tauri/capabilities/main.json` — new. Grants IPC (`core:default`) to the `main` window for the **remote** prod origin `https://cael-agent.vercel.app` + `http://localhost:*` (Tauri v2 disables IPC for remote URLs unless a capability allows it).
- `desktop/src-tauri/Cargo.toml` — `objc` dep (macOS only) for the window-alpha call.

**Verification (Playwright, dev on :3789, Tauri stubbed via addInitScript):** 20/20 checks pass — pin button only in shell, `set_pin_mode(true/false)` invoked, nav hidden/restored, running task ranks first in top 3, max 3 rows, timer ticks live, start persists + sets in_progress, stop banks seconds, starting B stops A (one-at-a-time), tracked label, complete banks + leaves pin view, context-menu Start/Stop timer + Timing badge, seeds cleaned up. **Note:** the dev server was killed externally mid-run once (concurrent-session hazard) leaving seeds 71/72 in Neon — cleaned up directly via SQL. Typecheck PASS ✓.

**Gotcha:** Berto's real in-progress tasks legitimately hold the top-3 slots, so test seeds only surface once running — that ranking is by design.

---

## 2026-07-15 — Native macOS desktop app (Tauri shell)

**Update (same day):** renamed the app to **Cael** (`productName`, window title). Bundle identifier kept as `com.bertomill.focuspoint` so the WebView data dir (login cookie) survives. Installed as `/Applications/Cael.app`, old Focuspoint.app removed.

**Ask:** Berto wanted a native desktop app so he doesn't have to run Focuspoint through Chrome.

**What was built:** `desktop/` — a Tauri v2 macOS app that loads the production site (`https://cael-agent.vercel.app`) in the system WKWebView. Because it wraps the deployed URL, every `vercel --prod` deploy updates the desktop app automatically; the shell only needs rebuilding to change window/icon/native behavior.

- `desktop/src-tauri/src/main.rs` — window built in `setup()` so `on_navigation` can keep navigation on the app host (plus localhost) and hand external links to the default browser. An init script rewrites `target="_blank"` clicks and `window.open()` into same-window navigations (WKWebView silently drops them otherwise). 1280×860, centered, 400×500 minimum.
- `desktop/src-tauri/tauri.conf.json` — `build.frontendDist` set to the prod URL (remote-app pattern); bundles `.app` + `.dmg`; identifier `com.bertomill.focuspoint`.
- Icon: `public/icon.svg` rasterized to `desktop/app-icon.png` (qlmanage, 1024px, alpha intact) → full icon set via `npx tauri icon`.
- `desktop/README.md` — rebuild instructions (needs Rust toolchain, installed today via rustup minimal profile).

**Decisions (owner chose):** Tauri over Electron/Safari-Add-to-Dock; target production URL rather than localhost.

**Key discovery:** the old prod alias `focuspoint-sigma.vercel.app` is DEAD (DEPLOYMENT_NOT_FOUND) and `focuspoint-*-bertmill19s-projects.vercel.app` URLs sit behind Vercel SSO. The live public domain — confirmed via Chrome history + curl — is **`cael-agent.vercel.app`** (app's own cookie login, no SSO).

**Gotchas hit:** window ignored `inner_size` when `min_inner_size` was chained after it — reordering (min first) + `.center()` fixed it, opens 1280×860 now. Berto couldn't drag the app out of the DMG window; installed by copying the bundle to `/Applications` directly.

**Installed & verified:** `/Applications/Focuspoint.app` launches, loads Tasks with real data, window sized correctly (screenshot-verified). Build output stays untracked (`desktop/src-tauri/target` gitignored).

**Next steps (if wanted):** code-sign/notarize for distribution beyond this Mac; global shortcut or menu-bar quick-add; a prod/localhost toggle in a native menu.

---

## 2026-07-14 — "In progress" task state (right-click → highlight + pin to top)

**Ask:** Berto usually works ~2 tasks at once and wanted to right-click a task, mark it "in progress", and have it highlighted.

**What was built:**
- `lib/db.ts` — `todos.in_progress BOOLEAN DEFAULT FALSE` (ALTER … IF NOT EXISTS; migration run against the live DB via `npx tsx --env-file=.env.local scripts/migrate.ts`).
- `app/api/todos/route.ts` — `in_progress` in all SELECTs/RETURNING; ORDER BY puts `in_progress DESC` first (after `completed ASC`), so in-progress tasks sort to the top server-side too.
- `app/api/todos/[id]/route.ts` — PATCH accepts `in_progress` (COALESCE pattern, booleans work since only null falls through).
- `app/api/todos/[id]/complete/route.ts` + `agent/tools/complete_todo.ts` — completing a task (either branch, recurring or not) clears `in_progress`.
- `app/_components/dashboard.tsx` — `in_progress` on the `Todo` interface; "Mark in progress" / "Clear in progress" toggle in the existing task context menu (Play/Pause icons, sits between the priority radio group and Edit); highlight = left accent bar (`border-l-2 border-l-primary`) + `bg-primary/5` tint + an outline "In progress" badge (all suppressed once the task is done/completing); `isInProgressActive()` helper sorts active in-progress tasks to the top of their recurrence section (stable sort, so priority order is preserved below them).
- `agent/tools/update_todo.ts` — new optional `in_progress` boolean, so Berto can also tell Cael "I'm working on X now".

**Decisions (owner chose):** highlight style = accent bar + tinted row (with badge, per the mock); in-progress tasks pin to the top of the list.

**Verification (Playwright, dev on :3789):** 11 checks all pass — menu item appears, row gets bar/tint/badge, pinned above a sibling (and above an Urgent task, per screenshot), `in_progress` persisted in DB, API sorts it first, Clear reverts UI + DB, completing clears the flag, seeded `zzz-test-*` rows deleted. Server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-07-14 — Global C keyboard shortcut (new chat)

**Ask:** Berto asked for a `C` shortcut that starts a *new* chat.

**What was built:**
- `app/page.tsx` — added a `c` case to the existing global shortcut handler in `Workspace`: `newThread()` (from `useThreads`) + `setMobileTab("chat")`. Same guards as T/N: ignores Cmd/Ctrl/Alt combos (so Cmd+C copy is untouched) and does nothing while typing in an input/textarea/contenteditable. `newThread` added to the effect deps (it's a stable useCallback).

**Verification (Playwright, dev on :3789):** 9 checks all pass — C from Home opens chat and creates a new thread (confirmed server-side via `/api/threads` count), C again from chat creates another, typing "cool cat" in the composer just types (no navigation, no thread), Cmd+C ignored, T→C from Tasks opens chat with a new thread. The 3 test threads were deleted via `DELETE /api/threads/[id]`, restoring the original count (68). Server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Right-click context menu on tasks (set priority / edit / delete)

**Ask:** Berto asked if a task could be made urgent by right-clicking it on the Tasks page. It couldn't — priority was only reachable through the pencil-icon edit form. He chose (via quiz) a full context menu: priority radio group plus Edit and Delete actions.

**What was built:**
- `components/ui/context-menu.tsx` — new shadcn-style wrapper around the Radix ContextMenu primitive (already available via the installed `radix-ui` umbrella package — no new dependency). Includes Root/Trigger/Content/Item/RadioGroup/RadioItem/Label/Separator, styled to match the existing `dropdown-menu.tsx`.
- `app/_components/dashboard.tsx` — each non-editing task row is wrapped in a `<ContextMenu>`. Right-click shows: "Priority" label + Low/Normal/High/Urgent radio group (current priority checked; High/Urgent tinted with their priority colors), then Edit… (opens the existing inline edit form) and Delete (destructive styling). New `handleSetPriority()` PATCHes `/api/todos/[id]` with just `{priority}`, optimistic update with rollback on failure. Existing PATCH route already supported partial updates — no API changes.

**Verification (Playwright, real browser):** seeded a test task via the API, right-clicked the row → menu opened with all items; clicked Urgent → title turned red, Urgent badge appeared, header count incremented, and the server confirmed `priority: "urgent"`; reopened the menu → Urgent radio was checked; set back to Normal → persisted; deleted via the menu → task gone server-side. Screenshots captured. Cleaned up the seed task via the menu's own Delete.

**Gotcha discovered:** port 3000 was another project (`~/venice`), not focuspoint — the first verification pass silently ran against the wrong app and got 401s. Started focuspoint on `PORT=3789` instead. Wrote `.claude/skills/verify/SKILL.md` capturing the launch/auth/Playwright recipe so future sessions skip this cold start.

**Typecheck:** PASS ✓

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

---

## 2026-07-13 — Add "Vision" page (statements, long-term goals, vision board) + Cael tools

**What was built:**
New "Vision" nav tab holding the user's big picture, in three sub-views (badge-switched, same pattern as Measures): written **vision statements** (optional life-area label + body), **long-term goals** grouped by horizon (This year / 5 years / 10 years / Someday, with achieve/un-achieve toggle), and a **vision board** of images (2-col grid, caption overlay, uploads reuse the existing `/api/upload` Vercel Blob route). Cael is vision-aware via four new agent tools.

- `lib/db.ts` — new `vision_items` table: one flexible table with `kind` ('statement' | 'goal' | 'image'), `title`, `content`, `image_url`, `horizon`, `achieved`/`achieved_at`, timestamps. Ran `scripts/migrate.ts` (needs `--env-file=.env.local` with tsx) against Neon to create it live.
- `app/api/vision/route.ts` — GET (optional `?kind=`), POST with per-kind validation (statement needs content, goal needs title, image needs image_url).
- `app/api/vision/[id]/route.ts` — PATCH (COALESCE partial update; `achieved: true/false` sets/clears `achieved_at`), DELETE.
- `app/_components/vision-panel.tsx` — new self-contained panel component (dashboard.tsx is already ~1600 lines, so this follows the JournalTemplatesPanel/ScheduledTasksPanel extraction pattern). Fetches `/api/vision` on mount + 15s poll so Cael's chat-side edits show up. Optimistic updates with revert-on-error throughout.
- `app/_components/dashboard.tsx` — "Vision" in `NAV_ITEMS` (TelescopeIcon), `DashboardTab` union, renders `<VisionPanel />`.
- `app/page.tsx` — `"vision"` in `MobileTab`, added to the mobile "More" dropdown, activeTab mapping.
- `agent/tools/list_vision.ts`, `add_vision_item.ts`, `update_vision_item.ts`, `delete_vision_item.ts` — CRUD tools mirroring the API validation; compact text `toModelOutput`s.
- `agent/instructions.md` — new Vision bullet: check `list_vision` when conversations touch the big picture; offer to capture uncaptured ambitions; confirm before deleting.

**Decisions:**
- Owner picked the scope (asked via question): statements + goals + image board + Cael-aware, all four.
- Horizon buckets are `1yr`/`5yr`/`10yr`/`someday` — a data-table edit in `HORIZONS` (panel) + enum in tools/API if we ever change them.
- Focuspoint's dev server currently runs on **:3001** (a different project, ~/venice, holds :3000).

**Verification:** full CRUD exercised against the running dev server on :3001 with a real session cookie — create statement/goal, invalid-image 400, achieve → `achieved_at` set, un-achieve + re-horizon → cleared/changed, `?kind=goal` filter, delete both, GET returns []. Test rows cleaned up.

**Concurrent-session note:** another session was concurrently adding `MeasuresOverview` to dashboard.tsx/globals.css; committed only the vision hunks of dashboard.tsx (via `git apply --cached`) and left their uncommitted work in the working tree untouched.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Measures visual dashboard (overview charts)

**What was built:**
A `MeasuresOverview` section at the top of the Measures tab that turns logged measures into visuals:

- `app/_components/measures-overview.tsx` (new) — savings hero figure + progress meter toward a goal (reads optional `goal` from the latest `savings_snapshot`'s data jsonb; row id 2 updated with `goal: 20000`); monthly spend as stacked horizontal bars (essential/discretionary/unallocated segments, 2px surface gaps, rounded data-end, legend, exact values in tooltips, compact total at bar end); daily check-in and free-time stat tiles with 12-point sparklines (rendered only once entries exist); a nudge line when there are no check-ins yet.
- `app/globals.css` — added `--chart-essential/discretionary/neutral/track/spark` tokens for light and dark (categorical pair validated with the dataviz palette validator against the app's actual surfaces: light `#2a78d6`/`#1baf7a`, dark `#3987e5`/`#199e70`).
- `app/_components/dashboard.tsx` — renders `<MeasuresOverview measures={measures} />` above the category picker.

**Decisions:** hand-rolled SVG/div marks instead of adding a chart lib (narrow panel, tiny datasets); entries list below serves as the accessibility table view; chart colors read via CSS vars so dark mode is a token swap, not a repaint.

**Verification:** screenshotted light + dark at 1440px via Playwright against the running dev server on :3001 (logged in with the session cookie) — hero, meter (77% of $20K), stacked Jun/Jul bars, legend, and empty-state nudge all render in both modes.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Merge `worktree-add-lists-feature` (Lists replaces Content Ideas)

**What was done:**
Merged the Lists feature branch into main at the owner's request ("merge everything and push to main"). The branch predated the Measures/Vision/nav-rail work on main, so `dashboard.tsx` and `page.tsx` conflicted throughout.

**Conflict resolution (take-both):** kept main's structure — Measures + Vision tabs, `DashboardTab` type, expanded-view props (`onTabChange`/`isExpanded`/`onBackToChat`), mobile "More" dropdown — and adopted the branch's Lists feature in place of Content Ideas: `"lists"` in both tab unions and the activeTab mappings, `ListChecksIcon` imports, ContentIdea interface/state/fetch removed (branch had deleted the handlers; auto-merge took those).

**DB migration:** ran `scripts/migrate.ts` — the branch's one-time migration folded `content_ideas` (2 items) into a seeded "Content Ideas" list, seeded "Groceries", and dropped the old table.

**Cleanup note:** stale `.next` type validators referenced the deleted content-ideas routes and failed typecheck; removed `.next` and did a full `npm run build` to regenerate.

**Typecheck:** PASS ✓
**Build:** PASS ✓

---

## 2026-07-13 — Daily Note rebuilt around Berto's goal hierarchy (DB-only change)

**What was changed:**
`scheduled_tasks` id 6 (was "Morning Digest", now **"Daily Note"**) — prompt rewritten around Berto's goal chain: ultimate goal (freedom, happiness, health) ← pillars (investments, fitness, relationships) ← daily behaviors (save, improve his service, go above and beyond for others, don't worry about AI news). The AI-news sections (latest_ai_news TOP STORY + ai_reading_list AI READS) were **removed** — they'd contradict the note's own "don't worry about AI news" line. TODAY section (todos + calendar, 1-3 pillar-serving focus items) and the SMS formatting rules kept. Prompt instructs Cael to vary wording daily so it doesn't go stale. No code changed — this is a DB row update; cron/notify/enabled untouched (fires via the daily dispatcher tick).

---

## 2026-07-13 — Vision-first Home screen (new default landing view)

**What was built:**
The app now opens on a Home screen that leads with Berto's truest vision and fans out into every section.

- `app/_components/home-screen.tsx` (new) — header (Cael avatar + date, tap → chat; ModeToggle), hero: the truest-vision statement pulled live from `/api/vision?kind=statement` (the one whose title contains "freedom", falls back to newest, then to static text; tap → Vision); pillar cards from the remaining statements with keyword-matched icons/targets (investments card embeds the live savings-goal meter from `/api/measures`); the daily-behaviors mantra line (save · improve the service · go above and beyond · skip the AI noise); a Go-to grid of all 10 sections with a live open-task count on Tasks.
- `app/page.tsx` — `"home"` added to `MobileTab` and made the **default** view; the dashboard aside hides entirely on home; `<HomeScreen onNavigate={setMobileTab}>` renders full-bleed; Home button added first in the mobile bottom nav (6 items now).
- `app/_components/dashboard.tsx` — "Home" added at the top of the desktop nav rail (`NAV_ITEMS` + `DashboardTab`), so every expanded section view can navigate home.
- Seeded vision_items id 6: statement "Freedom, Happiness, Health" (the hero). Berto's three existing statements map to the pillars: $1M investments by 2030 (+ live meter), mood/body 9/10, loved ones weekly.

**Decisions (owner chose via questions):** Home is the default landing view (not chat); vision content is pulled live from the Vision page rather than hardcoded, so editing Vision (or telling Cael) updates Home.

**Verification:** Playwright screenshots against a dev server on :3001 — desktop light (1440px) and mobile dark (390px): hero, pillars with savings meter ($15,345 of $20K), mantra, Go-to grid with task badge, and the new Home nav slot all render. Server killed by PID after.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Home screen keyboard shortcuts (1–9, 0)

**What was built:**
Digit hotkeys on the Home screen: keys 1–9 and 0 jump to the ten sections in grid order (1 Chat, 2 Tasks, 3 Notes, 4 Lists, 5 Journal, 6 Dreams, 7 Schedule, 8 Media, 9 Measures, 0 Vision). Digits over letter mnemonics because Media/Measures collide on "M" and the numbered grid is self-documenting.

- `app/_components/home-screen.tsx` — `hotkey` on each `SECTIONS` entry; a window keydown listener (active only while Home is mounted; ignores modifier combos and input/textarea/contenteditable targets); a small `<kbd>` badge on each Go-to card, hidden on mobile (`hidden sm:inline-flex`).

**Verification:** Playwright against dev on :3001 — hints render on all ten cards; pressing "9" navigated to Measures (asserted "Monthly spend" visible). Server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Daily rotating artwork on the Home screen

**What was built:**
A full-width art banner at the top of Home (between header and the vision hero) celebrating "what it's all for" — nature, places, restaurants, people laughing, dancing, sports. One image per day, rotating deterministically by day-of-year.

- `app/_components/home-screen.tsx` — `DAILY_ART`: 15 curated Unsplash photos (each downloaded and visually verified before inclusion — mountains above clouds, ocean morning, starry peak, Lago di Braies, rowboat bow, two restaurant scenes, friends seaside + golden-hour hilltop, dancer, confetti concert, cycling peloton, track start, butterfly swimmer, dock at Königssee), each with a short caption; `dayOfYear % 15` picks the day's image; rounded-2xl banner (h-44/sm:h-60, object-cover) with a bottom gradient + caption; `onError` hides the banner gracefully if the image ever 404s offline.

**Decisions:** hotlinked Unsplash CDN URLs (per their guidelines) rather than bundling ~15 images into the repo; plain `<img>` (not next/image) to avoid remote-domain config, matching the Media tab's pattern.

**Verification:** all 16 candidate URLs curl-checked (200s), every image opened and eyeballed (one dropped for vibe), then Playwright screenshots desktop-light + mobile-dark showing the banner, caption, and layout intact.

**Typecheck:** PASS ✓

---

## 2026-07-13 — Global T / N keyboard shortcuts (Tasks + new task)

**What was built:**
App-wide keyboard shortcuts: **T** opens the Tasks view from anywhere; **N** opens Tasks *and* focuses the "Add a task…" input so you can type immediately. Unlike the Home digit hotkeys (which only work while Home is mounted), these are global — wired in `Workspace` so they work from chat, Notes, or any other view. Both are suppressed while typing (input/textarea/contenteditable guard, same as the digit hotkeys) and ignore modifier combos (Cmd/Ctrl/Alt), so Cmd+T/browser shortcuts are untouched.

- `app/page.tsx` — window keydown listener in `Workspace`: `t` → `setMobileTab("tasks")`; `n` → same + bump a `focusNewTaskSignal` counter passed into `<Dashboard>`.
- `app/_components/dashboard.tsx` — new `focusNewTaskSignal` prop; `newTodoRef` on the new-task `Input`; an effect focuses it when the signal changes *and* `activeTab === "todos"` (the activeTab dependency handles the one-render lag when navigating from another view), with a handled-signal ref so it never re-fires on later tab switches.

**Decisions:** global rather than Home-only — Tasks already has "2" on Home, so a Home-only T would be redundant; digit hotkeys left untouched (still Home-only, "2" still works).

**Verification:** Playwright against dev on :3001 (session cookie) — 11 checks all pass: T from Home/Notes opens Tasks (without stealing focus), N opens Tasks with input focused and typed text (incl. t/n chars) lands in the input, N while typing just types "n", Ctrl+T ignored, digit "2" regression ok, typing "thinking now" in the chat composer doesn't navigate. No test rows created. Server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-07-18 — Key lesson added to Cael's knowledge framework (Money)

**What was changed:**
`agent/instructions.md` — new **"Key lessons"** subsection under "The 8 forms of wealth": hard-won principles Berto has adopted, treated as canon and woven into guidance proactively. First entry (Money): **difference and retention of total control are core to success in money creation** — be different (don't compete on sameness) and own the outcomes (keep ownership/control of the work, assets, and upside). Cael is told to test ventures/deals/career moves against two questions: is it genuinely different, and does he keep control of the outcome?

**Decisions:** placed in instructions.md rather than the DB Money vision statement — vision statements are Berto's own written visions; principles/lessons belong in Cael's instructions. Section is structured as a list so future lessons slot in per form.

**Typecheck:** not applicable (markdown-only change).

---

## 2026-07-26 — Home screen: dropped the standalone Vision/Methods list section

**What was changed:** `app/_components/home-screen.tsx` — removed the "Vision" and "Methods" list section that used to render below the 8-forms-of-wealth grid (a heading + list of all 8 forms with their vision/method text, each linking to the Vision tab). This was made redundant by an in-progress change (already uncommitted going into this session) that moved vision/method text inline into each wealth-form card via an expand/collapse "eye" button. Also dropped the now-unused `Skeleton` import.

**Decisions:** kept the "Vision" entry in the `Go to` section and `SECTIONS`/hotkey list untouched — the dedicated Vision tab still exists for editing; only the redundant duplicate list on Home was removed.

**Typecheck:** PASS ✓

---

## 2026-07-26 — Home screen: added a "2030" overall vision above the 8 forms

**What was built:** `app/_components/home-screen.tsx` — a `VISION_2030` constant (hardcoded, in Berto's words) rendered as a card directly above the 8-forms-of-wealth grid: "Insane aura, extremely kind, calm and happy. A world championship competitor in Hyrox. On a team building the absolute best AI products in the world. Seeing my family every month — they feel good, they feel secure. My team feels secure."

**Decisions:** hardcoded like `WEALTH_FORMS` rather than stored in `vision_items` — it's a single one-off north-star statement, not per-form content that needs editing through the Vision tab flow.

**Verified:** Playwright screenshots (1440×900 desktop, 390×844 mobile) against a scratch dev server on :3789 — card renders cleanly above the grid on both breakpoints; dev server killed by specific PID.

**Typecheck:** PASS ✓

---

## 2026-07-26 — Home screen: rewrote the "2030" vision text

**What changed:** `app/_components/home-screen.tsx` — `VISION_2030` rewritten per Berto's updated wording: "Incredible health, fitness, energy, grit. Tight relationships with family and friends and people I do business with. My craft is incredibly good — I'm building AI products so good it's jaw-dropping, one of the best in the world, people tangibly feel it. I'm making a ton of money, millions per year. I'm travelling and enjoying the world." Replaces the prior Hyrox/aura draft.

**Typecheck:** PASS ✓

---

## 2026-07-26 — Fix: texts to Cael stopped getting replies (silent `input.requested` pause)

**Ask:** Berto asked why his texts weren't working. Investigated via the Twilio REST API (Messages + Alerts) since the Vercel project lives under an SSO-gated scope the CLI can't reach: inbound SMS arrived fine and Twilio logged clean 200s from the webhook, but no outbound reply had gone out since **2026-07-18 ~14:24 UTC** — including a text sent the morning of this session, over a week later.

**Root cause:** `agent/channels/twilio.ts` only wired `message.completed` / `turn.failed` / `session.failed` handlers. eve's twilio channel has no default renderer for the `input.requested` event — the event fired when a tool needs approval (`add_calendar_event` is gated with `approval: once()`) or when the model calls the built-in `ask_question` tool. Some point in the 2026-07-18 SMS conversation triggered one of those, the session parked at `session.waiting`, and — per eve's docs — every subsequent message to that session just gets silently held pending an answer nobody knew to give, since nothing ever texted the prompt. No error, no approval request visible, nothing — matching the symptom exactly.

**Fix:** `agent/channels/twilio.ts` — added an `events["input.requested"]` handler that formats each pending request's `prompt` plus its `options` (or an "reply to answer" hint for freeform questions) and sends it as a plain-text SMS via `channel.twilio.sendMessage(...)`.

**Immediate unstick:** told Berto to text the literal word "approve" (or "deny") to the Cael number — eve resolves a follow-up matching an approval option automatically even without ever having rendered the original prompt, per its resume protocol (a message matching an option ID/label/index answers a pending request regardless of channel).

**Files changed:** `agent/channels/twilio.ts`

**Typecheck:** PASS ✓ · **Build:** PASS ✓

---

## 2026-07-28 — New "Sketches" section: canvas drawing tool with DB-backed gallery

**Ask:** Berto wanted a new app section called "Sketches" — a canvas drawing tool. Chose via quiz: save to DB with a gallery (over ephemeral/localStorage), and the "simple kit" toolset.

**What was built:**
- `lib/db.ts` — new `sketches` table (id, title, image_data TEXT [PNG data URL], created_at, updated_at). Migrated the live DB via `scripts/migrate.ts`; `instrumentation.ts` also creates it on boot.
- `app/api/sketches/route.ts` — GET (all, newest-updated first) + POST (title + image_data, validated as a `data:image/` URL).
- `app/api/sketches/[id]/route.ts` — PATCH (title and/or image_data via COALESCE, bumps updated_at) + DELETE.
- `app/_components/sketches-panel.tsx` — the drawing surface. Fixed 1200×900 logical canvas scaled by CSS (pointer coords mapped back), white "paper" background so exports read in dark mode. Tools: 6 pen colors, S/M/L stroke sizes, eraser (2.5× wide white pen), undo (ImageData snapshot stack, cap 30), clear, save-with-title. Pointer events + `touch-none` so mouse/touch/stylus all work. Gallery grid below: thumbnail, title, date, download-PNG, delete (AlertDialog confirm). Clicking a thumbnail loads it into the canvas for editing — Save becomes Update (PATCH, no duplicate row).
- Wiring: `dashboard.tsx` (NAV_ITEMS + DashboardTab + render block), `page.tsx` (MobileTab, MORE_TABS so mobile reaches it via More menu, activeTab mapping), `home-screen.tsx` (HomeTarget + SECTIONS "Go to" entry with hotkey **s** — digits 1–0 were all taken).

**Verified:** Playwright against a scratch dev server on :3789 — 10/10 checks pass: home entry + `s` hotkey, drawing, undo enablement, save persists via API (PNG data URL), gallery render, edit mode + update persists without duplicating, mobile More→Sketches renders, test sketch deleted (no data left behind). A separate pixel test confirmed strokes are gap-free along the drawn row (the dashed look in one screenshot was Playwright's coarse 30px mouse steps, not a code bug). Dev server killed by specific PID.

**Typecheck:** PASS ✓

---

## 2026-07-28 — Sketches: shapes (rect/ellipse/line/arrow) + text tool

**Ask:** Berto wanted shapes and text on the Sketches canvas. Chose via quiz: all four shapes (rectangle, ellipse, line, arrow), outline-only (no fill).

**What was built** (`app/_components/sketches-panel.tsx`):
- Replaced the `erasing` boolean with a `tool` state (`pen | eraser | rect | ellipse | line | arrow | text`) and an icon toolbar row ahead of the color swatches.
- Shapes rubber-band while dragging: pointerdown snapshots the canvas (same ImageData pushed for undo), each move restores it and redraws start→cursor, so previews don't stack. Arrow = line + two 30° head strokes (head length `max(14, size*3.5)`).
- Text tool: click places a floating input overlaid at the click point (styled with the current color and an S/M/L-mapped font size: 28/48/80 logical px); Enter or blur commits via `ctx.fillText`, Escape cancels, clicking elsewhere commits then opens a new box. Committed text is one undo step.
- Picking a color while on eraser hops back to pen.

**Bug found & fixed during verification:** the floating text input would sometimes mount and instantly vanish — the browser's default mousedown action moved focus to the unfocusable canvas right after the effect focused the input, and `onBlur={commitText}` closed the empty box. Fix: `e.preventDefault()` on the text-tool pointerdown (suppresses the compat mousedown focus steal). Timing-dependent, so it looked flaky under Playwright but was a real product bug.

**Verified:** 13/13 Playwright checks against the already-running dev server on :3001 — per-shape pixel assertions (edges inked, interiors empty, arrowhead present, no preview ghosts), text commit/cancel/undo. Side effect cleaned up: two earlier failing runs leaked keystrokes ("t" tab-nav, "c" chat modal) and sent three junk "h" chats to Cael — those threads were deleted via the API. No sketches or todos left behind.

**Typecheck:** PASS ✓

---

## 2026-07-28 — Sketches: line-weight slider + pinch/scroll zoom

**Ask:** Berto wanted adjustable line weight and pinch-zoom in/out of the canvas. Chose via quiz: slider replacing S/M/L (1–30px), and full zoom support (pinch + trackpad + toolbar buttons).

**What was built** (`app/_components/sketches-panel.tsx`):
- **Line weight**: native `<input type="range">` (1–30px, live "Npx" label) replaces the S/M/L buttons; eraser stays 2.5× the pen width; text font maps as `clamp(20, size*6, 180)` logical px.
- **Zoom/pan**: canvas now sits absolutely in an `overflow-hidden` 4:3 viewport div and zooms via CSS `translate+scale` (origin 0 0), 1×–8×, pan clamped to bounds. Pointer→logical-coordinate mapping needed no changes because it reads `getBoundingClientRect()`, which reflects the transform.
- **Gestures**: two-finger pinch (active-pointer map; zoom anchored at the gesture midpoint, midpoint drift = two-finger pan). A second finger landing mid-stroke pops the undo snapshot to erase the accidental mark before the gesture takes over. Trackpad/ctrl+wheel zooms at the cursor (native non-passive `wheel` listener — React's synthetic one can't `preventDefault`); plain scroll pans when zoomed in. Toolbar +/− buttons and a % button that resets to 100%. Zoom resets on save/clear/load-for-edit.
- Robustness: `setPointerCapture` wrapped in try/catch (throws for already-released/synthetic pointers, which killed the whole handler).

**Verified:** 12/12 new Playwright checks on :3001 (slider thickness measured at ~21px logical for a 20px setting, zoom button scaling, drawing-while-zoomed coordinate mapping, wheel pan, ctrl+wheel zoom, reset, synthetic two-finger pinch → 4.75×, pinch-cancel of partial strokes) + 13/13 shapes/text regression suite. Toolbar renders in one row on desktop.

**Also:** documented the keystroke-leak hazard in `.claude/skills/verify/SKILL.md` (leaked test keystrokes hit global hotkeys and can send junk chats to Cael / create todos).

**Typecheck:** PASS ✓

---

## 2026-07-29 — Tasks: "waiting" status (waiting on someone/something)

**Ask:** Berto wanted "waiting" as an option on the todo list. Chose via quiz: amber badge sorted right after in-progress (visible so he chases things up), and Cael's tools learn it too.

**What was built:**
- `lib/db.ts` — `todos.waiting BOOLEAN NOT NULL DEFAULT FALSE` (migrated live).
- `app/api/todos/route.ts` — `waiting` in all SELECT/RETURNING lists; ORDER BY slots `waiting DESC` right after `in_progress DESC`.
- `app/api/todos/[id]/route.ts` — PATCH accepts `waiting`; in_progress and waiting are mutually exclusive (setting either clears the other, in_progress wins if both sent).
- `app/_components/dashboard.tsx` — context-menu item "Mark waiting"/"Clear waiting" (hourglass icon) under "Mark in progress"; waiting rows get an amber left border + tint + "Waiting" hourglass badge (in-progress styling wins when both somehow set); section sort is in-progress → waiting → rest; optimistic toggles mirror the mutual exclusion.
- `agent/tools/update_todo.ts` — `waiting` in the schema (described as "blocked waiting on someone or something") with the same exclusivity; `list_todos` already returns it via `SELECT *`, so Cael can see and set it from chat/SMS.

**Verified:** 12/12 Playwright checks on :3001 — seed via API, mark waiting via context menu (badge + API persistence), in-progress clears waiting and vice versa (both directions), clear waiting, seeded todo deleted in a `finally` block even on failure. Close-up screenshot confirms the amber treatment. Test gotcha: seed todos BEFORE `page.goto` — the dashboard fetches on mount, so a post-load seed races the fetch and may not render.

**Typecheck:** PASS ✓

---

## 2026-08-02 — Tasks: dailies pinned to the top instead of their own section

**Ask:** Berto didn't want a separate DAILY section — daily recurring tasks should ride at the top of the regular task list and keep coming back each day until they're actually done. Chose via quiz: drop the section entirely (no duplication), and dailies stay visible until completed rather than being gated on due_date.

**What was built** (`app/_components/dashboard.tsx`):
- `TODO_SECTIONS` no longer has a `daily` entry; the `none` section is relabelled **"Tasks"** and its filter now takes `none` + `daily`.
- Section sort gains a leading `isDaily` key (new helper next to `isInProgressActive`/`isWaitingActive`), so dailies pin above one-off tasks; in-progress/waiting ordering is preserved within each group.
- `visibleTodos` dropped the `isToday(t.due_date)` gate for dailies — an unfinished daily carries over and stays on the list every day. Safe because `/api/todos/[id]/complete` never sets `completed = TRUE` for recurring rows; it just rolls `due_date` forward, so a done-today daily still renders struck-through and disappears at midnight.
- Daily rows show a repeat-icon "Daily" line instead of a due date (the date is just tomorrow-bookkeeping and read as noise).
- Weekly/Monthly sections and the Scheduled Tasks tab's "Recurring Tasks" list are unchanged.

**Verified:** 9/9 Playwright checks on a dedicated dev server (:3789) — no DAILY header, WEEKLY header intact, a daily seeded with yesterday's due date still listed, dailies sorting above the one-off seed, "Daily" marker present, completing a daily rolls due_date to tomorrow without setting `completed`, stays struck-through today, and is still listed after a reload. Seeds deleted; server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-08-04 — Tasks: pick a priority when adding a task

**Ask:** Berto wanted the option to set priority at add-time instead of having to add the task first and then set priority from the context menu.

**What was built** (`app/_components/dashboard.tsx`):
- New `newTodoPriority` state (defaults to `"normal"`), and a Low/Normal/High/Urgent badge row that appears above the existing recurrence row once the input has text — same badge pattern as the inline edit form, with the flag icon as its leading marker and the urgent/high tints on unselected badges.
- `handleAddTodo` sends `priority` in the POST body and resets the picker to `"normal"` after a successful add; the error path now restores title, recurrence *and* priority (previously recurrence was silently dropped on failure).

No API or schema changes needed — `POST /api/todos` already accepted `priority` (defaulting to `"normal"`) and the column has existed since the original schema. The UI was simply never passing it.

**Verified:** 14/14 Playwright checks on a dedicated dev server (:3789) — all four badges render, recurrence row unaffected, urgent selection persists to the DB, the new row renders its Urgent badge, picker resets to Normal after add, no-click default is `normal`, selection moves between badges, row hides when the input is emptied. Seeds deleted; server killed by PID.

**Typecheck:** PASS ✓

---

## 2026-08-04 — Tasks: manual queue numbers ("do this next" order)

**Ask:** Berto can't do tasks in parallel — he wanted an easy way to put a number on each task so the list itself tells him what to do next, one at a time.

**Decisions (asked Berto):**
- Input: click a small number badge on the row, type the number, Enter. No drag-and-drop (fiddly at 49 tasks, unreliable on mobile). Numbers can be sparse — assign #5 without numbering 1–4.
- Sort: numbered tasks float to the very top in ascending order, ahead of dailies/in-progress/urgent. Unnumbered tasks keep the existing sort (daily pin → in progress → waiting → priority → oldest first).
- Numbers behave as *slots*: giving #3 to a task clears #3 off whoever held it (enforced both optimistically in the client and server-side in the PATCH).

**Files changed:**
- `lib/db.ts` — `ALTER TABLE todos ADD COLUMN IF NOT EXISTS task_number INTEGER` (nullable; NULL = unnumbered).
- `app/api/todos/route.ts`, `app/api/todos/[id]/route.ts`, `app/api/todos/[id]/timer/route.ts` — `task_number` added to every SELECT/RETURNING list.
- `app/api/todos/[id]/route.ts` — PATCH accepts `task_number`, keyed on property *presence* (so `null`/`""` clears it) via `CASE WHEN ${hasTaskNumber}::boolean …`; clears the same number off other incomplete todos first.
- `app/api/todos/[id]/complete/route.ts` — completing a task releases its slot (`task_number = NULL`).
- `app/_components/dashboard.tsx` — `task_number` on the `Todo` interface; `queueRank`/`compareQueue` helpers (the compare guards against `Infinity - Infinity` → NaN); sort now leads with `compareQueue`; new `numberingTodoId` state + `cancelNumberRef` (Escape discards, Enter/blur saves); `handleSetTaskNumber` with optimistic update + rollback toast; a 24px badge left of the checkbox showing the number (primary tint) or a faint `#` on hover when unset, which swaps to a spinner-less number input in place.

**Verified:** Playwright on a dedicated dev server (:3789) — set #1 and #2, both rows jumped to the top of the list in order; reassigning #1 to another task stripped it from the previous holder (server-side check: `gamma=null, beta=1`); clearing via an empty input persisted as `null`. Seeds deleted; server killed by PID.

**Typecheck:** PASS ✓

**Next steps (not done):** agent tools (`add_todo`/`update_todo`) don't know about `task_number` yet — Cael can't number tasks by voice/chat.

---

## 2026-08-05 — Tasks: estimated time + live countdown while timing

**Ask:** Berto wanted to set an estimated time on a task when adding it, then have the existing timer count down against that estimate instead of just counting up.

**Decisions (asked Berto):**
- Input: preset chips (None/15m/30m/1h/2h) on the add form and edit form, same pattern as the priority/recurrence badge rows — no free-text entry.
- Countdown: replaces the existing orange "Timing" badge in place (rather than adding a second element) — ticks down live as "18:32 left", flips to a red "+2:14 over" once it passes the estimate. Tasks with no estimate keep the old static "Timing" badge.

**Files changed:**
- `lib/db.ts` — `ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER` (nullable; NULL = no estimate).
- `app/api/todos/route.ts` — `estimated_minutes` in GET's SELECT lists and POST's INSERT/RETURNING (validated to a positive integer or `null`).
- `app/api/todos/[id]/route.ts` — PATCH accepts `estimated_minutes`, keyed on property *presence* like `task_number` (so `null`/`""` clears it) via `CASE WHEN ${hasEstimatedMinutes}::boolean …`.
- `app/api/todos/[id]/timer/route.ts` — `estimated_minutes` added to both RETURNING lists.
- `app/_components/dashboard.tsx` — `estimated_minutes` on the `Todo` interface; `ESTIMATE_OPTIONS` (0/15/30/60/120) + `formatEstimateLabel`/`formatCountdown` helpers; `newTodoEstimatedMinutes`/`editTodoEstimatedMinutes` state wired into `handleAddTodo`/`saveEditTodo` and their chip rows on the add and edit forms; a `nowTick` state ticking every second via `setInterval` (only while some task's `timer_started_at` is set, so it's not running idle) drives the countdown badge's live remaining/over-time text and red styling.

**Verified:** Playwright + direct API checks on a dedicated dev server (:3789) — estimate chips render once the add-form input has text, "None" is the default, adding with 30m persists `estimated_minutes: 30`; starting the timer shows a live "…left" countdown within ~1s; editing the estimate to 1h persists `estimated_minutes: 60`; stopping the timer banks `time_spent_seconds` and clears `timer_started_at`. Seed task deleted; server killed by PID.

**Typecheck:** PASS ✓

**Next steps (not done):** agent tools (`add_todo`/`update_todo`) don't know about `estimated_minutes` yet.

---

## 2026-08-07 — Tasks: mandatory estimate on create + log worked time to Google Calendar

**Ask:** Berto wanted (1) the estimated-time field to be required when creating a task (no more skipping it), and (2) time spent on a task (from the existing start/stop timer) to retroactively show up as an event on his `rmill@aucctus.com` Google Calendar, so he can see where his time actually goes.

**Decisions:**
- Enforced "required" at both layers: the add-task UI blocks submit and shows a red "Required" hint + toast if no estimate chip is picked (the "None" option is simply not offered on the create form — `CREATE_ESTIMATE_OPTIONS` excludes it), and `POST /api/todos` independently 400s with `estimated_minutes required` if it's missing/non-positive. The edit form and agent's `update_todo` tool are untouched — estimate stays optional when editing an existing task.
- `agent/tools/add_todo.ts` now requires `estimated_minutes` too (was previously not wired to the column at all), so Cael can't create a task via chat without one either.
- Calendar logging hooks into the existing timer start/stop endpoint (`/api/todos/[id]/timer`) rather than a new mechanism — every timer stop (explicit stop, or the implicit stop-and-bank that happens when starting a different task's timer) posts an event to the connected Google account's primary calendar (`gcalFetch("/calendars/primary/events")`, same helper the Calendar tab already uses) spanning `timer_started_at` → now, titled with the task's title. Skips logging anything under 60s (avoids spamming the calendar with accidental start/stop blips) and is best-effort — a Google API failure is caught and logged, never blocks the timer stop response.

**Files changed:**
- `app/api/todos/route.ts` — POST now rejects (400) when `estimated_minutes` is missing or ≤ 0, instead of silently defaulting to `null`.
- `agent/tools/add_todo.ts` — added required `estimated_minutes` to the input schema and the INSERT/RETURNING.
- `app/_components/dashboard.tsx` — new `CREATE_ESTIMATE_OPTIONS` (drops the "None" chip for the create form only); `handleAddTodo` blocks and toasts if no estimate is chosen; estimate chip row on the add form turns red with a "Required" label until one is picked.
- `app/api/todos/[id]/timer/route.ts` — new `logTimeToCalendar()` helper (best-effort, <60s skipped); both the "stop" branch and the "start" branch's implicit bump-other-timers query now capture the prior `timer_started_at` and title (via `RETURNING`/a preceding `SELECT`) and log the worked interval to the primary Google Calendar.

**Verified:** Playwright + direct API checks on a dedicated dev server (:3789) — create form blocks submit and shows the toast with no estimate selected, succeeds once a chip (30m) is picked and persists `estimated_minutes: 30`; `POST /api/todos` without `estimated_minutes` returns 400 with the expected error body; timer start→stop within a few seconds returns 200 with `time_spent_seconds` banked and no errors in the dev log (calendar call correctly skipped under the 60s threshold — didn't want to write a real test event to Berto's live calendar just to verify wiring). Seeds deleted; server killed by PID. Assumes the already-connected Google account (used by the existing Calendar tab) is `rmill@aucctus.com` — didn't re-verify this since it wasn't queryable without touching the DB directly.

**Typecheck:** PASS ✓

**Next steps (not done):** Haven't done a live end-to-end check that a >60s timer run actually creates a real Google Calendar event (only verified the code path is wired and errors are swallowed safely) — worth Berto confirming on his next real timed task.

---

## 2026-08-09 — 8 forms of wealth: per-form goals + full-screen celebration (Growth first)

**Ask:** Berto wants each of the 8 wealth-form cards to have a goal, starting with Growth at 10,000 pages, with a big celebration when he hits it — then move on to the next form's goal one at a time.

**Decisions (asked Berto):**
- Goal storage: reuse the existing `vision_items` table's `kind="goal"` row type (same table Money's vision/method cards already use) rather than a new column/table — `title` = the form label (e.g. "Growth"), `content` = the numeric target as a string, and the already-existing `achieved`/`achieved_at` columns double as the one-time-celebration flag. This means adding a goal for the next form later is just a DB insert (one `POST /api/vision`), no code change needed.
- Celebration: one-time full-screen confetti + modal, not a replay-every-visit or quiet-badge version. Confetti is hand-rolled CSS (no new dependency) via a `.confetti-piece` keyframe in `globals.css`.

**Files changed:**
- `app/_components/goal-celebration.tsx` (new) — `GoalCelebration` component: full-screen modal (styled like the existing chat modal) with ~90 randomly-placed/colored/timed confetti pieces falling via CSS animation, a "🎉 {form} goal reached — You hit {target}!" message, and a dismiss button (click backdrop, Escape, or the button).
- `app/globals.css` — `confetti-fall` keyframe + `.confetti-piece` base class.
- `app/_components/home-screen.tsx`:
  - Fetches `vision_items?kind=goal` alongside the existing statement/method/routine fetches; builds a `formGoals` map (`{ [formLabel]: { id, target, achieved } }`), keeping only the newest goal row per form.
  - Split the old `wealthSparklines` memo into `wealthSeries` (raw per-form point series, form data only) → `wealthSparklines` (bucketed by the Month/Year/Decade toggle, unchanged behavior) and a new `wealthTotals` memo (all-time total per form, independent of the granularity toggle — this is what a goal progress bar needs, not a bucketed window).
  - New effect: for any form with an unachieved goal whose `wealthTotals` total has crossed `target`, pushes it onto a `celebrationQueue`, optimistically flips `formGoals[key].achieved` to `true` (so it can't refire), and `PATCH`es `/api/vision/{id}` with `achieved: true` (persists the one-time flag server-side, sets `achieved_at`).
  - Card grid: added a generic goal progress bar (bar + "`{total} / {target} {unit}`" caption, 🎉 prefix once achieved) for any non-Money form that has a goal row — Money keeps its pre-existing goal bar (sourced from `measures`, untouched).
  - Renders `<GoalCelebration>` for `celebrationQueue[0]` when present; closing pops the queue (so multiple simultaneous goal-hits, if that ever happens, celebrate one at a time).
- Seeded Growth's goal directly in the DB (`vision_items`: `kind=goal, title=Growth, content=10000`) via a one-off script — id 28.

**Verified:** Playwright against the already-running dev server on :3000 (didn't kill it — it's a concurrent session's server per usual multi-session convention) — Growth card renders "4,800 / 10,000 pages" with a partial progress bar; temporarily PATCHed the goal target down to 100 to confirm the full-screen confetti celebration fires with the correct "Growth goal reached — You hit 100 pages!" copy and persists `achieved: true` server-side; then restored the real target (10000) and reset `achieved: false` so Growth's actual 10K crossing celebrates for real later. Reloaded after restoring — confirmed no false celebration and the progress bar reads correctly.

**Typecheck:** PASS ✓

**Next steps (not done):** Only Growth has a goal row so far — Wellness/Family/Craft/Money(custom)/Community/Adventure/Service still need their targets picked with Berto, one at a time, then a `POST /api/vision` insert each (same mechanism, no code change required). Note: `lib/chart-buckets.ts` and `app/_components/sparkline.tsx` had uncommitted changes from a concurrent session at the time of this work (bucket-window and sparkline-caption changes) — left untouched/uncommitted here for that session to commit itself.

---

## 2026-08-09 — Wealth-form charts: month/year/decade-over-decade trends; Family memories feature

**Ask (two follow-ups from Berto in one session):**
1. The Month/Year/Decade toggle on the 8-forms-of-wealth grid was drilling *into* one period (days of the current month, months of the current year, years of the current decade) instead of comparing *across* periods. Berto wanted Month to show month-to-month, Year to show year-over-year, Decade to show decade-over-decade — and each series to read as a cumulative running total, not a per-period bump.
2. Family's tracking signal (previously a proxy: count of `thoughts` tagged "family") should become real: memories are photos Berto uploads with a title + description, and the Family goal is 100 memories.

**Part 1 — chart bucketing (`lib/chart-buckets.ts`):**
- `bucketDefs` rewritten so `month` = trailing 12 months (one bucket per month), `year` = trailing 10 years (one bucket per year), `decade` = trailing 6 decades labeled "1980s" etc (one bucket per decade) — each granularity now compares across that unit instead of drilling into it.
- `bucketAggregate`'s `"sum"` mode now accumulates a running total across buckets (was: each bucket independently summed its own window) so pages/notes/memories read as a rising cumulative line, matching Money's always-rising `"last"` mode. `sparkline.tsx`'s caption simplified to just the final bucket's value for both modes.
- Note: a concurrent session was mid-flight adding a goal reference-line to `sparkline.tsx` (dashed line + `goal`/`goalAchieved` props) while this work landed — that file's diff was left uncommitted for that session to commit as a whole; the cumulative-caption fix is folded into their version.

**Part 2 — Family memories (photo + title + description, goal 100):**
- **Decisions (asked Berto):** memories addable from three places — Cael chat, the Family dashboard widget (quick-add), and a new dedicated `/family` page in the sidebar.
- New `memories` table (`lib/db.ts`): `id, title, description, image_url NOT NULL, created_at`.
- New `app/api/memories/route.ts` (GET list / POST create) and `app/api/memories/[id]/route.ts` (DELETE), modeled on the existing `vision_items` routes.
- New `agent/tools/add_family_memory.ts` — Cael can log a memory given an `image_url` (the established convention: user uploads via `/api/upload`, gets a URL, tells Cael about it in chat text; the tool just persists the URL + optional title/description), same pattern as `post_linkedin`/`add_vision_item`.
- New `app/_components/family-panel.tsx` — full memories grid + drag-drop/click upload with title+description fields, modeled on `vision-panel.tsx`'s board section; wired into `dashboard.tsx` as a new `"family"` tab and a new `/family` route (`app/(app)/family/page.tsx`, empty stub per the existing per-section-route pattern) reachable from both the desktop nav rail and the mobile "More" menu (`app/(app)/layout.tsx`).
- `home-screen.tsx`: Family's `WEALTH_FORMS` target changed from `"vision"` to `"family"`; `wealthSeries.family` now sources from real `/api/memories` data (cumulative count) instead of tagged-thoughts proxy, unit `"memories"`; added a compact quick-add (title input + photo button) inside the expanded Family card, reusing the same upload → `/api/memories` POST flow.
- Seeded Family's goal via a one-off DB script (`vision_items`: `kind=goal, title=Family, content=100`) — id 29, using the existing generic goal/progress-bar/celebration mechanism from the prior Growth-goal work (no code change needed for the goal itself).

**Verified:** Playwright + curl against the already-running dev server on :3000 (concurrent session's — not killed). `/api/memories` GET/POST/DELETE round-trip confirmed server-side; `/family` page renders the upload UI and empty state; clicking the Family card from Home navigates to `/family`; expanded Family card shows Vision/Methods text plus the new "Add a memory" quick-add row; seeded a test memory and confirmed the Family sparkline switches from "No data yet" to a cumulative chart with goal reference line and "1 memories / 100 memories" caption (pluralization matches the app's existing static-unit-suffix convention, e.g. "4,800 pages"); deleted all test rows afterward. Typecheck clean.

**Files changed:** `lib/chart-buckets.ts`, `lib/db.ts`, `app/api/memories/route.ts` (new), `app/api/memories/[id]/route.ts` (new), `agent/tools/add_family_memory.ts` (new), `app/_components/family-panel.tsx` (new), `app/(app)/family/page.tsx` (new), `app/(app)/layout.tsx`, `app/_components/dashboard.tsx`, `app/_components/home-screen.tsx`. `app/_components/sparkline.tsx` left uncommitted (concurrent session's goal reference-line work in progress).

**Typecheck:** PASS ✓

**Next steps (not done):** Craft/Money(custom)/Community/Adventure/Service still need goal targets picked with Berto. Family currently only counts memories added after this feature shipped (0 to start) — no historical backfill was requested or done.

---

## 2026-08-09 — Wealth-form goals: reference line on the chart instead of a separate progress bar

**Ask:** Berto wanted the goal shown as a bar/line on the sparkline chart itself, not the standalone filled progress-bar element added earlier today.

**Decisions:** Replaced the two hand-built filled-bar elements (Money's measures-sourced one, and the generic vision-goal one) with a single mechanism inside `Sparkline`: an optional `goal` prop renders as a dashed horizontal Recharts `ReferenceLine` at the target value, and the chart's Y-domain is padded 15% above `max(data, goal)` (via an explicit hidden `YAxis`) so the line/peak is never clipped. The caption line under the chart now reads `"{current} {unit} / {target} {unit}"` (🎉-prefixed once achieved) instead of a separate line of text below a bar.

**Files changed:**
- `app/_components/sparkline.tsx` — `Sparkline` takes new optional `goal`/`goalAchieved` props; renders `<YAxis hide domain={[0, domainMax]}>` and `<ReferenceLine y={goal} strokeDasharray="3 3">` (color flips to the achieved-green once hit); caption logic folded the goal target into the existing value string.
- `app/_components/home-screen.tsx` — removed both manual filled-bar blocks from the wealth-form card grid; now computes `goalTarget`/`goalAchieved` per form (Money still reads from `savings.goal`/`savings.total`; every other form reads from the `formGoals` vision-item map built in the previous entry) and passes them straight to `<Sparkline>`.

**Verified:** Playwright against the already-running dev server on :3000 — Growth's card now shows a dashed reference line across the chart with "4,800 pages / 10,000 pages" beneath it; temporarily dropped the goal to 100 to re-confirm the full-screen celebration still fires correctly with the new caption format, then restored the real 10,000 target and `achieved: false`.

**Typecheck:** PASS ✓ (a `family`-tab MobileTab typecheck error present earlier from a concurrent session's in-flight Family-memories feature was resolved by that session merging its own work to main before this commit — not something fixed here).

**Note:** `app/api/community/` and `lib/luma.ts` are untracked, in-progress work from a concurrent session (Community/Luma subscriber tracking) present in the working tree at commit time — left uncommitted here for that session to commit itself.

---

## 2026-08-09 — Vision: "Chapters" section for pasting reference text verbatim

**Ask:** Berto wanted to discuss what measure/proxy fits Craft (the 4th form of wealth) and planned to paste in the "Craft" chapter from Robin's book as context. He flagged that models often don't reproduce exact text faithfully when asked to insert it into a doc — wanted a UI spot to paste it directly instead, so the text lands verbatim without going through the model.

**Decision:** Reused the existing `vision_items` table/API rather than a new table — added a `"chapter"` kind alongside `statement`/`goal`/`image`/`method`/`milestone`/`routine` (`title` = source/label, `content` = full pasted text, no length limit). Added a "Chapters" tab to the Vision page: a title input + large `Textarea` for pasting, and a list of saved chapters that collapse to just the title (click to expand) so long pasted text doesn't dominate the page. This is a general-purpose "paste reference text verbatim" spot, not Craft-specific — reusable for any future book chapter/essay/note the same way.

**Files changed:**
- `app/api/vision/route.ts` — added `"chapter"` to `KINDS` and its title+content validation.
- `app/_components/vision-panel.tsx` — new `chapters` derived list, `newChapterTitle`/`newChapterContent`/`expandedChapterId` state, `handleAddChapter`, and a new "Chapters" section (form + expandable list, reusing the existing edit/delete plumbing).

**Not done:** No agent tool for creating chapters — this is meant for direct paste, not going through Cael/chat, per the stated reason for building it. The actual Craft measure/proxy discussion is still open, pending Berto pasting the chapter content in.

**Verified:** Playwright against the already-running dev server on :3000 (Berto's own session) — Chapters tab renders, saved a test chapter, confirmed it round-tripped through `/api/vision?kind=chapter` server-side, expand/collapse works, deleted the test row afterward. Typecheck clean.

**Next steps:** Once Berto pastes the Craft chapter into the new Chapters tab, read it and continue the discussion on what the right measure/proxy for Craft is.

---

## 2026-08-09 — Moved the paste-verbatim spot out of Vision into its own "Manual" section

**Ask:** Berto pushed back on putting the paste-in-chapter feature under Vision — he sees it as a distinct thing: "a manual for how to [live]," not part of the vision-setting flow. Wanted a new top-level nav item called "Manual".

**Decision:** Pulled the "chapter" kind's UI out of `vision-panel.tsx` entirely (reverted that file to its pre-Chapters state) and gave it its own top-level nav section, `Manual`, positioned after Family in both the desktop nav rail and the mobile "More" menu. Backend is unchanged — still `vision_items` with `kind="chapter"` (title = source, content = full pasted text); only the UI moved. New standalone `ManualPanel` component fetches only `kind=chapter` directly (no shared state/tab-switching with Vision's statements/goals/board).

**Files changed:**
- `app/_components/vision-panel.tsx` — reverted to original (Chapters section/state removed).
- `app/_components/manual-panel.tsx` (new) — standalone paste-and-save UI: title + large textarea, expandable list of saved entries, edit/delete. Modeled on the removed Vision Chapters section.
- `app/(app)/manual/page.tsx` (new) — empty route stub, same pattern as every other section.
- `app/(app)/layout.tsx` — added `"manual"` to `MobileTab`, `TAB_PATHS`, `MORE_TABS`, and `NAV_ITEMS` (using `BookMarkedIcon`).
- `app/_components/dashboard.tsx` — added `"manual"` to `DashboardTab`, renders `<ManualPanel>`.

**Verified:** Playwright against the already-running dev server on :3000 — `/manual` renders as its own sidebar item (between Family and Sketches), save/expand/delete round-trips through `/api/vision?kind=chapter` server-side; test row deleted afterward. Typecheck clean.

**Note:** `agent/tools/add_family_memory.ts`, `app/_components/family-panel.tsx`, `app/api/memories/*`, `lib/db.ts`, `app/api/community/`, `lib/luma.ts` were modified/untracked in the working tree from a concurrent session's in-progress Family/Community work — left untouched and uncommitted here for that session to commit itself.

---

## 2026-08-09 — Manual: render pasted text as Markdown (headings, bold, lists)

**Ask:** Berto wants to be able to add headings and bold text to Manual entries — both for readability and so Cael can parse the structure more easily later.

**Decision:** Content is stored as plain Markdown source (no schema change — same `vision_items.content` text column), rendered with `react-markdown` + `remark-gfm` (already a dependency, used by the chat UI) when a saved entry is expanded. Kept the component list intentionally small — headings (h1-h3), bold/italic, lists, blockquote, hr — since pasted chapters won't need code blocks or tables. Edit mode stays a plain textarea on the raw markdown source. Placeholder/empty-state copy updated to mention markdown support.

**Files changed:** `app/_components/manual-panel.tsx` — added `ReactMarkdown`/`remarkGfm` import, a small `markdownComponents` map, swapped the expanded-entry `<p>` for `<ReactMarkdown>`.

**Verified:** Playwright against the already-running dev server on :3000 — saved an entry with `# Craft`, `**bold**`, and a bullet list; expanded view renders as a real heading/bold/list, not literal `#`/`**` characters. Typecheck clean. Test row deleted afterward.

---

## 2026-08-09 — Family memories: fix edit-view overlap, add remove-photo action

**Ask:** Berto flagged the memory edit view — title/description/date fields were overlapping the photo — and wanted a way to delete just the photo (not the whole memory).

**Root cause:** Editing a memory rendered the form fields in an `absolute inset-0` dark-backdrop layer directly on top of the small (aspect-square) photo thumbnail inside the 2-col grid card — cramped, clipped inputs and a save/cancel row pushed off the bottom edge.

**Fix (`app/_components/family-panel.tsx`):**
- Editing a memory now breaks that card out of the 2-col grid (`col-span-2`) into a normal top-to-bottom flow: photo (if present) as a plain `h-40` thumbnail up top, then title/description/date/save/cancel below it in document flow — no more overlap.
- New `editImageUrl` state (seeded from the memory on `startEdit`) decouples the edit-in-progress photo from the saved one; a trash-icon button on the thumbnail clears it locally, swapping to an "Add a photo" dropzone (wired to a new `handleEditPhotoChange` uploader) so a photo can be removed or replaced before saving. `saveEdit` now PATCHes `image_url: editImageUrl` (including explicit `null` for "removed") instead of always re-sending the original `m.image_url`.

**Verified:** Playwright against the already-running dev server on :3000 — seeded a test memory with a photo, opened its edit view (screenshotted: fields no longer overlap the photo), clicked the photo's trash icon (screenshotted: swaps to an "Add a photo" dropzone, fields still clean), never clicked Save so no write happened; separately confirmed Berto's real "Call with David" memory (photo, title, description) was untouched by API check before/after. Typecheck clean. Test memory deleted via the API afterward.

**Note:** the concurrent session's Family/Community work referenced in the note above (2026-08-09, "Manual: render pasted text") landed on `main` between that entry and this one (`memory_date`, optional/nullable photo, edit UI, live MakersLounge count, etc.) — this fix builds on that already-merged version, not the older uncommitted snapshot.

---

## 2026-08-09 — Wealth-form goals: Money + Community targets, taller sparklines

**Ask:** Berto set Money's goal (100K in investments) and Community's goal (10K Luma subscribers), then asked for the wealth-form charts to be taller/roughly square instead of thin horizontal slivers.

**Data (no code change):**
- Money: `PATCH /api/measures/4` — set `data.goal = 100000` on the latest `savings_snapshot` row (existing `total_savings: 19600` preserved). Money's goal has always read from this field (see the 2026-08-09 goal-line entry), so no new code was needed.
- Community: `POST /api/vision` — new `kind=goal, title=Community, content=10000` row (id 34), same mechanism as Growth/Family.

**Code change:**
- `app/_components/sparkline.tsx` — chart height (`ChartContainer` + the "No data yet" placeholder) bumped from `h-11` (44px) to `h-32` (128px) so each form's card reads as a roughly square chart instead of a thin rectangle.

**Verified:** Playwright against the running dev server on :3000 — Money card shows "$19,600 / $100,000" with its dashed goal line; Community shows "1,174 subscribers / 10,000 subscribers"; all 8 cards screenshotted at the new taller height.

**Typecheck:** PASS ✓

**Next steps (not done):** Wellness, Craft, Adventure, Service still need goal targets picked with Berto.

---

## 2026-08-09 — Adventure: dedicated trip tracking (was a tagged-thoughts proxy) + goal

**Ask:** Berto wanted Adventure tracked like Family (a real count, not the tagged-thoughts proxy) — trips taken, with 10 trips over the last 12 months and a goal of 100.

**Decisions:** No new table needed — reused the existing generic `measures` table with a new `category: "trips"` (one row per trip, `data: {}`), the same pattern Money's `savings_snapshot` and the goal system already use. This keeps Adventure consistent with the "generic mechanism, DB-only additions" approach from the earlier goal work, rather than building a dedicated trips table/UI (Family's memories feature has photo/title/description — Berto didn't ask for that level of detail here, just a count).

**Files changed:**
- `app/_components/home-screen.tsx` — new `trips` state fetched from `/api/measures?category=trips&limit=500` alongside the other dashboard fetches; `adventure`'s entry in `wealthSeries` switched from `taggedCount("adventure")` (thoughts tagged "adventure", unit "notes") to one point per trip row (unit "trips").
- Seeded 10 `trips` rows spread across the last 12 months (Oct 2025 – Aug 2026) via `POST /api/measures`, and a `vision_items(kind=goal, title=Adventure, content=100)` row (id 35) via the same goal mechanism as Growth/Family/Community.

**Verified:** Playwright against the running dev server on :3000 — Adventure card reads "10 trips / 100 trips" with its dashed goal line, matching Family's card format.

**Typecheck:** PASS ✓

**Next steps (not done):** Wellness, Craft, Service still need goal targets/dedicated tracking picked with Berto. No UI exists yet to log a new trip (unlike Family's memories panel) — trips are only addable via the API today; worth asking Berto if he wants a proper log-a-trip flow later.

---

## 2026-08-09 — Service: chat-captured thank-yous (screenshot/photo) + goal

**Ask:** Berto wants Service tracked as the number of thank-yous he receives (DM, email, or written card), captured by sending a screenshot/photo to Cael in chat — goal of 100.

**Decisions (asked Berto):** Capture surface is chat-only for now (not a dedicated Family-style page) — he sends the screenshot/photo to Cael, who logs it. This reuses infrastructure that already exists for every chat image attachment: `hooks/use-eve-runtime.ts` already uploads any pasted/attached image to `/api/upload` and injects the public URL as text in the outgoing message (this is how `add_family_memory` already gets its photos) — no chat/upload-path changes were needed, only a new table + tool.

**Files changed:**
- `lib/db.ts` — new `thank_yous` table (`title`, `note`, `image_url`, `thanked_date`, `created_at`) — same shape as `memories`.
- `app/api/thanks/route.ts` + `app/api/thanks/[id]/route.ts` (new) — GET/POST/PATCH/DELETE, mirroring `app/api/memories/`.
- `agent/tools/log_thank_you.ts` (new) — mirrors `add_family_memory`; takes an optional `image_url`/`title`/`note`/`thanked_date`, requires at least one of the three.
- `agent/instructions.md` — added a line telling Cael to call `log_thank_you` when the user shares a thank-you screenshot/photo; also corrected the stale line about Family/Craft/Community/Adventure/Service all sharing the `capture_thought`-tag proxy — now only Craft still uses it (Family/Community/Adventure got dedicated tracking in earlier entries today).
- `app/_components/home-screen.tsx` — new `thankYous` state fetched from `/api/thanks?limit=500`; Service's `wealthSeries` entry switched from `taggedCount("service")` (unit "notes") to one point per thank-you row (unit "thank-yous").
- Set `vision_items(kind=goal, title=Service, content=100)` (id 36) via the same goal mechanism as the other forms. Zero thank-yous logged so far — this is real going-forward tracking, not backfilled (unlike Adventure's seeded trip history).

**Verified:** Manually created and deleted a test `thank_yous` row via the API to confirm the fetch → `wealthSeries` → `Sparkline` wiring updates the card correctly ("1 thank-yous / 100 thank-yous"), then deleted it — Service correctly shows "No data yet" at rest. Ran `ensureSchema`'s new `CREATE TABLE IF NOT EXISTS thank_yous` directly against the dev DB (the app doesn't call `ensureSchema` on every request, only specific routes do — same as the rest of the schema).

**Typecheck:** PASS ✓

**Note:** committed alongside a concurrent session's in-flight Wellness work (`agent/tools/log_workout.ts`, `list_workouts.ts` — a new `gym_hours` exercise powering a cumulative-hours Wellness goal) present in the working tree at commit time; typecheck was clean so it went in together rather than being separated out.

**Next steps (not done):** Craft still needs a goal/dedicated tracking picked with Berto (last form on the tagged-thoughts proxy).

---

## 2026-08-13 — Tasks: three-pillars goal banner at top of task list

**Ask:** Berto: "add to the top of the task list — your goal is more calls, more events, and better AI agents. Those are your three main pillars and keys to success."

**What was built:** A static banner card pinned above the add-task form on the Tasks tab (`activeTab === "todos"`): "Your goal" eyebrow, the sentence "More calls, more events, and better AI agents.", three secondary badges (More calls / More events / Better AI agents), and a footnote "Three main pillars — the keys to success." Purely presentational — no DB or API changes.

**Decision:** Kept it static/hardcoded rather than sourcing from `vision_items`, since it's a fixed framing statement and the ask was for it to simply sit at the top of the list. Placed above the form (not above only the task groups) so it's the first thing on the tab. Naturally pairs with the just-landed Events / Calls / AI Agents task categories (commit 99936a5).

**Files changed:** `app/_components/dashboard.tsx`.

**Typecheck:** PASS ✓

---

## 2026-08-14 — Completed tasks plot onto Google Calendar

**Ask:** Berto: "when a task gets done, can we plot it onto my calendar? This will help me audit what I did in weeks prior."

**Decisions (asked Berto):**
- **Destination: real Google Calendar events** on the primary calendar (not an app-only overlay, not a separate "Done" calendar) — so done-blocks show up on his phone and in any Google client.
- **Shape: a timed block from tracked time** (not an all-day chip) — the block *ends* at the completion moment and starts one duration earlier, so a week view reads as a real picture of where the hours went.
- Duration precedence: `time_spent_seconds` (tracked timer) → `estimated_minutes` → a flat 15m fallback. Clamped to [5m, 8h] so an estimate-less task still renders visibly and a timer left running overnight can't paint a multi-day bar across the week.
- Blocks are styled to sit *behind* real meetings: Google colorId 8 ("Graphite"), `transparency: "transparent"` (they're a record, not busy time), and a `✓ ` title prefix. Description carries the provenance ("Completed in focuspoint — 45m tracked." + category when set).
- Every calendar call is **best-effort** — a Google failure (not connected, revoked token, API blip) is logged and swallowed, never blocking task completion.
- Uncompleting a task **deletes** its block (`calendar_event_id` on the todo is the handle). Recurring tasks log a fresh block on each completion and the column holds the latest one — past occurrences intentionally stay on the calendar as history.

**Files changed:**
- `lib/done-block.ts` (new) — builds the Google event body from a completed task; duration precedence + clamping live here. **Deliberately import-free**: the web routes and the agent tool run under different module resolvers (Turbopack vs the eve runtime) which disagree on `.js` extensions in relative imports — Turbopack can't resolve `./task-categories.js`, while eve tools *require* the `.js` suffix. Rather than pick a side, this module takes the category *label* from its caller and imports nothing.
- `lib/task-calendar.ts` (new) — web-side `logCompletedTaskToCalendar` / `removeCompletedTaskFromCalendar` over `gcalFetch`.
- `lib/db.ts` — `todos.calendar_event_id TEXT` column (also applied directly to the dev/prod Neon DB, since `ensureSchema()` isn't run per-request).
- `app/api/todos/[id]/complete/route.ts` — reads the task back *after* banking the running timer (so the block reflects final tracked time), writes the block, stores the event id. Returns `calendar_event_id` in the response.
- `app/api/todos/[id]/uncomplete/route.ts` — deletes the block and clears the column.
- `agent/tools/complete_todo.ts` — same behaviour when Cael marks a task done, via the agent's own Google helper.
- `agent/lib/google-calendar.ts` — new `createRawCalendarEvent(token, body)` that POSTs an already-built event body (the existing `createCalendarEvent` only takes date/time/duration fields, which don't fit a done-block).

**Verified:** end-to-end against the real Google Calendar on a dev server on :3789 — (1) estimate path: a 25m-estimate task completed → `✓ ZZ calendar-plot test`, 17:08–17:33, description "Completed in focuspoint — 25m estimated. / Category: Calls"; (2) tracked path: a task with `time_spent_seconds = 2700` and a 10m estimate → a 45m block, confirming tracked time beats the estimate; (3) uncomplete removed the block from the calendar in both cases. All seed tasks deleted.

**Note:** the first e2e run returned `calendar_event_id: null` with "Google Calendar is not connected" — a stale `google_auth` row whose refresh token had gone invalid. `lib/google.ts` self-healed on the next call by re-seeding from `GOOGLE_REFRESH_TOKEN` in `.env.local`; no code change needed.

**Typecheck:** PASS ✓

**Next steps (not done):** nothing blocking. If the done-blocks turn out to clutter the real calendar, the natural follow-up is moving them to a dedicated secondary "Done" calendar (Berto weighed this option and chose the primary calendar for now) — only `lib/task-calendar.ts` and the agent tool's calendar id would change.

**Follow-up (same day):** deleting a *completed* task left its block orphaned on the calendar (found while cleaning up a production deploy probe). `DELETE /api/todos/[id]` now removes the block first — verified: complete → delete the task without uncompleting → block is gone from the calendar.

**Deploy:** the live app is **cael-agent.vercel.app**, which deploys from GitHub on push to `main` (the CLI-linked `aucctus/focuspoint` project — focuspoint-beta.vercel.app — is a *different*, empty database and is not the live app; its `todos` table doesn't even exist, so the new column was only needed on the DB in `.env.local`, which cael-agent shares). Confirmed live in production by completing a throwaway task there and seeing `calendar_event_id` come back.

---

## 2026-08-15 — Goal banner → three-pillars hero with a process chart

**What was built:** the "Your goal" banner at the top of the task list was a flat
muted box with three badges. It's now a hero card: a soft amber→violet→emerald
gradient with two blurred colour blooms, a gradient-text headline, and a small
process chart underneath that spells out *why* each pillar matters.

**The chart:** three cards, one per pillar, each showing `pillar → what it creates`:
- More content → creates **awareness**, and **distributes** the service
- More events → creates **trust**, and **distributes** the service
- Better AI agents → creates a **higher-value service**

Below them, a dashed convergence row ("The service — known through awareness,
chosen through trust, worth more through better agents. Content and events build
it *and* carry it to people."). Wording change: the first pillar is now "More
content" rather than "More calls", matching how Berto described the model.

**Decisions:**
- Pillar colours reuse `CATEGORY_BADGE_CLASS` (content=amber, events=violet,
  ai_agents=emerald) so a task's category chip reads as the same pillar.
- The distribution relationship is shown *per pillar* (a small share-icon line on
  content and events) rather than as extra arrows — arrows converging from two
  cards would need SVG and didn't survive the mobile stack.
- Chart is a `PILLAR_FLOW` const near `CATEGORY_BADGE_CLASS`, not inline JSX.
- Grid is `sm:grid-cols-3`, stacking to one column on mobile.

**Files changed:** `app/_components/dashboard.tsx` only (new `PILLAR_FLOW` const,
new lucide imports: Megaphone/Users/Bot/ArrowRight/Target/Share).

**Verified:** dev server on :3789, Playwright screenshots in both light and dark
mode — gradient, blooms, and gradient text all read correctly in both themes; no
seed data created. **Typecheck:** PASS ✓

**Follow-up (same day):** Berto trimmed the hero's prose — removed the "Your goal"
eyebrow, the "Three pillars — every task should ladder up to one of them" line,
and the dashed "The service" convergence row. In their place, one principle line
under the chart: *"Don't chase money — create the conditions where money becomes
**inevitable**."* The hero is now headline → three pillar cards → principle.
`TargetIcon` import dropped with the convergence row. Verified on the running dev
server (:3000, Berto's own — Turbopack picked the edits up) in light and dark.

---

## 2026-08-15 — Growth measured in books, not pages

**Ask:** Berto: "for growth, let's change it from pages read to books."

**Decisions (asked Berto):** goal set to **100 books** (of the options offered — 1,000 / 100 / 31 — he picked 100, a decade-ish target where the 15 books already logged read as a visible 15% rather than hugging the floor the way 4,800/10,000 pages did). Page counts are still recorded on every `reading_logs` row and `log_reading` still looks them up via `web_search` — only the unit the *goal* is measured in changed, so no data was lost or migrated.

**Files changed:**
- `app/_components/home-screen.tsx` — `wealthSeries.growth` now emits one point of `value: 1` per reading log (was `Number(l.pages)`), unit `"books"` (was `"pages"`).
- `agent/instructions.md` — the Reading line said the chart shows "cumulative pages this year"; now says the Growth card counts books finished against a goal of 100, and notes page counts are still recorded.
- DB only: `vision_items` id 28 (`kind=goal, title=Growth`) content `10000` → `100`.

**Verified:** Playwright screenshot of the Growth card against the running dev server — reads "15 books / 100 books" with the dashed goal line well above the curve. (Berto's own dev server was already running on :3000 in the focuspoint dir, so per `.claude/skills/verify` this was checked against that server rather than killing it — Turbopack picked the edit up from disk.)

**Typecheck:** PASS ✓

**Gotcha worth remembering:** the goal row was updated *before* the new code reached production, so for ~40s the still-deployed pages-based card compared 4,800 pages against the new goal of 100 and latched the goal-achieved celebration (`vision_items.achieved = true`, `achieved_at` stamped). Reset to `false`/`NULL` afterwards and confirmed the prod card reads a plain "15 books / 100 books" with no 🎉. **When changing a goal's unit, deploy the code first, then update the goal row** — otherwise the old unit is briefly measured against the new target and can fire a false celebration.

**Follow-up 2 (same day):** hero trimmed further — headline removed, and the
pillar boxes reduced to just icon + title (the "creates X / and distributes it"
lines moved into each box's `title` tooltip rather than being deleted outright, so
the reasoning is still one hover away). Hero is now: three compact pillar chips +
the "don't chase money" principle line. Unused `ArrowRightIcon` / `ShareIcon` /
`TargetIcon` imports removed.

**Follow-up 3 (same day):** chevron arrows between the three pillar chips
(content → events → AI agents). The row is a flex layout rather than a 3-col
grid so the arrows can sit between boxes; on mobile the chips stack and the
chevrons rotate 90° to point down.

**Follow-up 4 (same day):** each pillar chip now lists what it actually takes,
day to day, as a small bulleted list (`traits` on `PILLAR_FLOW`, bullet dot tinted
per pillar): content → consistency, attention to detail; events → energy, aura,
appearance; AI agents → reading the docs, time coding, aggressive tinkering. Third
pillar renamed "Better AI agents" → "More AI agents". Row switched to
`sm:items-stretch` so the three boxes stay equal height with the arrows centred.

**Follow-up 5 (same day):** connectors between chips are now a line + arrowhead
flush to both box edges (no gap in the flex row) instead of a floating chevron,
and the chips are capped at `sm:max-w-[13rem]` with the row centred, so they read
as a chart rather than three full-width panels. The connector flips to a vertical
line when the chips stack on mobile.

**Follow-up 6 (same day):** feedback loop added under the chart — a rounded return
path from "More AI agents" back up into "More content" and "More events", each
arm labelled *Improves*. Drawn with borders (no SVG): the loop is a second flex
row that mirrors the chip row's sizing, which is why `CHART_SLOT` / `CHART_GAP`
now exist as shared constants — change one row's widths without the other and the
verticals stop landing under the chip centres. The loop is desktop-only; once the
chips stack, a plain "Better agents improve the content and the events" line
takes its place.

**Follow-up 7 (same day):** the forward arrows in the goal hero are now labelled
with what each step actually produces — content → events reads *More attendees*,
events → AI agents reads *More clients*. Added as an `inbound` field on
`PILLAR_FLOW` (the label for the arrow coming *into* that chip), rendered above
the connector line on desktop and under the vertical connector on mobile.
`CHART_GAP` widened `w-9` → `w-24` so the labels sit over the arrow without
spilling onto the chips — note this constant is shared with the feedback-loop
row, which is what keeps the *Improves* verticals aligned under the chip centres.
Verified with a Playwright screenshot against the local dev server.

**Follow-up 8 (same day):** goal hero now runs the full width of the task panel
— dropped the `sm:max-w-[13rem]` cap from `CHART_SLOT` so the three chips stretch
edge to edge — and plays a one-shot intro on first paint: each chip fades up
left→right (`CHART_BEAT` 0.42s apart), the arrow into the next chip draws from
its left edge, then the feedback loop and the closing principle line settle in
(~1.9s total, then completely still). Built with `motion` (Framer Motion v12),
which was already a direct dependency — no new install. Notes:
- `chartHasAnimated` is a module-level flag, so the intro plays once per page
  load rather than every time you flip back to the Tasks tab. Flip that to a
  per-mount `useState` if it should replay on each visit.
- `useReducedMotion()` short-circuits the whole thing to a static render.
- Arrow labels are wrapped in a plain positioned `<span>` with the motion
  element inside: motion writes an inline `transform`, which would otherwise
  clobber Tailwind's `-translate-x-1/2` centering.
Verified with Playwright frames at ~0.4s (first chip + arrow drawing) and ~2.5s
(fully settled, full width).

**Follow-up 9 (same day):** goal hero is now full bleed and replays on every
visit. Dropped the `chartHasAnimated` module flag from follow-up 8 — the Tasks
panel unmounts when you leave the tab, so the motion elements remount and the
intro replays each time you open Tasks; `useReducedMotion()` is now the only
thing that switches it off. The hero container went from a rounded bordered card
to `-mx-5 -mt-4 … border-b` (negative margins cancel the panel's `px-5 py-4`), so
the gradient runs edge to edge under the header with a single bottom border.
Verified with Playwright: settled full-bleed frame, plus a leave-Tasks →
return-to-Tasks frame at 420ms showing only the first chip in.

**Follow-up 10 (same day):** goal hero rebuilt on real registry components
instead of hand-drawn CSS. Berto's constraint: *"whatever you do, we need to
leverage packages, and not try to do from scratch."* Installed via the Magic UI
registry (`npx shadcn@latest add @magicui/animated-beam @magicui/border-beam
@magicui/dot-pattern`) — all three land in `components/ui/` and use the `motion`
package already present, so no new npm deps.

The whole hero moved out of `dashboard.tsx` into
`app/_components/goal-flow-hero.tsx` (it needs its own refs, and dashboard.tsx
was long enough). Deleted along with it: `PILLAR_FLOW`, `CHART_SLOT`,
`CHART_GAP`, `CHART_BEAT`, `CHART_EASE`, `CHART_LOOP_DELAY`, `chartRise`,
`chartDraw` — the hand-rolled connectors, arrowheads and border-drawn feedback
loop are all gone.

What it is now: three glass chips (`backdrop-blur`, shadow) each wrapped in a
`<BorderBeam>` tinted to its pillar, wired by four `<AnimatedBeam>`s — content→
events, events→agents, then two curved returns from agents back to events and
content — over a masked `<DotPattern>`. Beams travel continuously on a 4.5–5.5s
cycle; chips still fade up left→right on mount, so the intro still replays on
every visit to Tasks.

Gotchas worth knowing:
- `<AnimatedBeam>` draws between two elements in a shared container, so each
  chip carries three zero-size anchor spans (left/right/bottom edges). Beams
  attach to those, not to the chips, otherwise a return path cuts straight
  through the middle of a card.
- The gap labels sit in an `h-4 self-center` span with the text at `bottom-full`
  — the beam runs along that span's midline, so anything centred in it gets a
  line drawn through the text.
- The feedback band is `h-20 items-end` so the deepest curve (`curvature={-70}`)
  clears the caption underneath it.
- Reduced motion: `BorderBeam` is not rendered, and the beams get
  `duration 0.01 / repeat 0`, which leaves their static path visible.
Verified with Playwright: desktop hero, 390px mobile stack, and a gradient-
position sample 700ms apart confirming all four beams are actually travelling.
