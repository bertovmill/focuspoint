#!/usr/bin/env node
// Launch-speed evals: `npm run eval:speed`.
//
// Cael took 5–10 s to open on the phone (2026-10-16). The causes were all in the
// code, so these checks read the code rather than a signed-in browser, and catch a
// regression before it ships:
//
//   1. Home's first load stays light: following the static imports from the app
//      shell and the home screen never reaches the chat, the doc editor, the chart
//      library or the other heavy panels. (`next/dynamic` / `import()` are fine.)
//   2. The thread list stays titles-only: transcripts come per thread.
//   3. Home's startup requests stay within budget.
//   4. The service worker keeps caching the app's script files.
//
// Exit code 1 on any failure, so it can gate a deploy.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Packages that must not be on Home's first load, and why.
const HEAVY_PACKAGES = {
  "@tiptap": "doc editor (~520 KB)",
  recharts: "charts (~330 KB)",
  "@excalidraw": "sketches",
  "@fullcalendar": "calendar",
  "eve/react": "chat runtime",
};
// App modules that are only for other sections.
const HEAVY_MODULES = [
  "app/_components/agent-chat.tsx",
  "app/_components/dashboard.tsx",
  "app/_components/notion-editor.tsx",
  "app/_components/score-chart.tsx",
  "app/_components/writing-panel.tsx",
  "app/_components/training-plan-panel.tsx",
  "app/_components/week-plan-panel.tsx",
  "app/_components/career-panel.tsx",
  "app/_components/newsletter-panel.tsx",
];
const ENTRY_POINTS = ["app/(app)/layout.tsx", "app/_components/home-screen.tsx"];
// Home made 31 requests before 2026-10-16 and 21 after. Room to grow a little,
// not to slide back.
const HOME_REQUEST_BUDGET = 24;

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

// ── Static import graph ────────────────────────────────────────────────────
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;

function resolveLocal(spec, fromFile) {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(dirname(join(ROOT, fromFile)), spec);
  for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && !p.endsWith("/")) {
      try {
        readFileSync(p);
        return p.slice(ROOT.length + 1);
      } catch {
        // a directory; try the next extension
      }
    }
  }
  return null;
}

function walk(entries) {
  const seen = new Map(); // file -> importer
  const packages = new Map(); // package -> importing file
  const queue = entries.map((e) => [e, null]);
  while (queue.length) {
    const [file, from] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, from);
    const src = read(file);
    for (const [, spec] of src.matchAll(STATIC_IMPORT)) {
      if (spec.startsWith(".") || spec.startsWith("@/")) {
        const next = resolveLocal(spec, file);
        if (next && /\.(tsx?|m?js)$/.test(next)) queue.push([next, file]);
      } else if (!packages.has(spec)) {
        packages.set(spec, file);
      }
    }
  }
  return { files: seen, packages };
}

function chain(files, file) {
  const path = [];
  for (let f = file; f; f = files.get(f)) path.unshift(f.replace(/^app\/_components\//, ""));
  return path.join(" → ");
}

const graph = walk(ENTRY_POINTS);

for (const [prefix, what] of Object.entries(HEAVY_PACKAGES)) {
  const hit = [...graph.packages].find(([pkg]) => pkg === prefix || pkg.startsWith(prefix + "/") || pkg.startsWith(prefix));
  check(
    `Home doesn't load ${prefix} (${what})`,
    !hit,
    hit ? `imported by ${chain(graph.files, hit[1])}; load it with next/dynamic` : "",
  );
}
for (const mod of HEAVY_MODULES) {
  const hit = graph.files.has(mod);
  check(
    `Home doesn't load ${mod.split("/").pop()}`,
    !hit,
    hit ? `reached via ${chain(graph.files, mod)}; load it with next/dynamic` : "",
  );
}

// ── Startup requests ───────────────────────────────────────────────────────
// Every distinct /api path fetched by code on Home's first load.
const apiCalls = new Set();
for (const file of graph.files.keys()) {
  for (const [, path] of read(file).matchAll(/fetch\(\s*[`"'](\/api\/[^`"'?$]+)/g)) apiCalls.add(path);
}
check(
  `Home fetches ≤ ${HOME_REQUEST_BUDGET} API paths at most`,
  apiCalls.size <= HOME_REQUEST_BUDGET,
  `${apiCalls.size} found`,
);

// ── Thread list payload ────────────────────────────────────────────────────
const threadsRoute = read("app/api/threads/route.ts");
const listQueries = [...threadsRoute.matchAll(/SELECT([\s\S]*?)FROM threads/g)].map((m) => m[1]);
check(
  "Thread list has a titles-only query",
  listQueries.some((cols) => !/\bevents\b/.test(cols) && !/\bsession\b/.test(cols)),
  "every launch reads /api/threads; full transcripts made it 10+ MB",
);
check(
  "Full thread rows only behind ?include=events",
  /include["']?\)\s*===\s*["']events["']/.test(threadsRoute),
);
const provider = read("app/_components/threads-provider.tsx");
check(
  "Threads provider loads the list without ?include=events",
  /fetch\("\/api\/threads"\)/.test(provider) && !/fetch\("\/api\/threads\?include=events"\)/.test(provider),
);
check(
  "Chat waits for its transcript before mounting",
  /useThreadLoaded\(/.test(read("app/_components/agent-chat.tsx")),
);

// ── Service worker ─────────────────────────────────────────────────────────
const sw = read("public/sw.js");
check(
  "Service worker caches /_next/static/ cache-first",
  /addEventListener\("fetch"/.test(sw) && /\/_next\/static\//.test(sw) && /cacheFirst/.test(sw),
);
check(
  "Service worker never caches /api responses",
  !/pathname\.startsWith\("\/api/.test(sw),
);
check(
  "Service worker registered at app startup",
  /serviceWorker\s*\.register\("\/sw\.js"\)/.test(read("app/(app)/layout.tsx")),
);

// ── Report ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail && (!r.ok || r.name.includes("API")) ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} speed checks passed · Home graph: ${graph.files.size} files, ${apiCalls.size} API paths`);
process.exit(failed.length ? 1 : 0);
