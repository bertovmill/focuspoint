---
name: verify
description: How to launch and drive focuspoint locally to verify UI changes end-to-end (dev server port gotcha, auth cookie, Playwright recipe).
---

# Verifying focuspoint changes in the running app

## Launch

**Do not assume port 3000 is focuspoint.** Berto often has other projects
(`~/venice`, `~/helios`) running `next dev` on 3000. Check first:

```bash
lsof -p <pid> | grep cwd   # for whatever node process owns the port
```

Start focuspoint on its own port instead (background):

```bash
PORT=3789 npm run dev
```

Ready when `curl -s -o /dev/null -w "%{http_code}" http://localhost:3789/login` returns 200 (~1–15s).

**Next 16 allows only one dev server per project dir.** If the launch dies with
"Another next dev server is already running" (it prints the PID/port/dir), and
that server's dir IS focuspoint, don't kill it — it's likely Berto's own session.
Verify against that server's port instead; Turbopack hot-reloads your edits from
disk, so your changes are live on it. Test data you create will briefly appear
in his UI — clean it up promptly.

## Auth

The whole app sits behind cookie auth (`middleware.ts`). The cookie is just the
raw password:

- Password: `BASIC_AUTH_PASSWORD` in `.env.local`
- Cookie: `cael_session=<password>` (works for pages and `/api/*` alike)
- Or POST `{"password": "..."}` to `/api/auth/login`

## Drive (Playwright)

Playwright is already in `node_modules`. Recipe:

```js
import { chromium } from "/Users/bertomill/focuspoint/node_modules/playwright/index.mjs";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: "cael_session", value: PASSWORD, domain: "localhost", path: "/" }]);
const page = await context.newPage();
```

- Seed test data via `page.request.post("/api/todos", ...)` (shares the cookie) —
  don't mutate Berto's real tasks; delete seeds when done.
- Desktop layout: navigate tabs via the sidebar buttons, e.g.
  `page.getByRole("button", { name: /^Tasks/ })`.
- shadcn-style components carry `data-slot` attributes — stable selectors
  (e.g. `[data-slot="context-menu-content"]`).
- Confirm persistence server-side with `page.request.get("/api/todos?limit=200")`,
  not just optimistic UI state.

## Cleanup

Kill only the dev server you started, by its specific PID — never
`pkill -f "next dev"` (it kills Berto's other projects).
