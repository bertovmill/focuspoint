"use client";

import { useEffect, useRef } from "react";

/**
 * Refetch when Berto is actually looking — and at no other time.
 *
 * **Why this exists.** On 2026-08-29 Vercel paused the whole account: the free tier's
 * 1,000,000 monthly function invocations had been used *480%* over. The cause was five
 * components each running a bare `setInterval` — the dashboard alone hit four API routes
 * every 15 seconds, forever, whether or not anyone was looking. One tab left open on a
 * second monitor is ~46,000 invocations a day (every request runs middleware too, so it
 * bills roughly double the fetch count), which clears the monthly cap on its own.
 *
 * The first fix relaxed the intervals to 60s and paused them while hidden. This is the
 * second: **there is no interval at all by default.** An idle tab now costs exactly
 * nothing, however long it sits there.
 *
 * What triggers a fetch:
 *  - mount
 *  - the tab becoming visible again (`visibilitychange`)
 *  - the window regaining focus
 *
 * Both listeners matter, and they are not redundant. Switching between two windows that
 * are *both* on screen — the pinned task window beside the main app, which is how this
 * app is actually used — fires `focus`/`blur` but **not** `visibilitychange`, since
 * neither document was ever hidden. Listening only for visibility would let those two
 * views silently drift apart. Consecutive triggers inside `MIN_GAP_MS` collapse into one,
 * because switching tabs commonly fires both at once.
 *
 * `intervalMs` is left in for the rare caller that genuinely needs a timer; pass a
 * positive number and it ticks *only while visible*. Default is off, and it should stay
 * off — if you find yourself reaching for it, the answer is usually a refetch after the
 * mutation that changed the data.
 *
 * `fn` is held in a ref, so an inline arrow function won't tear down and re-create the
 * listeners on every render.
 */

/** Collapse triggers that land together (focus + visibilitychange on a tab switch). */
const MIN_GAP_MS = 1_000;

export function usePolling(fn: () => void | Promise<void>, intervalMs = 0, enabled = true) {
  const callback = useRef(fn);
  callback.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRun = 0;

    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRun < MIN_GAP_MS) return;
      lastRun = now;
      void callback.current();
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (intervalMs <= 0) return;
      stop(); // never stack two intervals
      timer = setInterval(() => run(true), intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run(); // catch up on whatever changed while we were away
        start();
      } else {
        stop();
      }
    };

    const onFocus = () => run();

    run(true);
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, enabled]);
}
