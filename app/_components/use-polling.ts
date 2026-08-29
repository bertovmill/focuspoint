"use client";

import { useEffect, useRef } from "react";

/**
 * Poll only while the tab is actually being looked at.
 *
 * **Why this exists.** On 2026-08-29 Vercel paused the whole account: the free tier's
 * 1,000,000 monthly function invocations had been used *480%* over. The cause was five
 * components each running a bare `setInterval` — the dashboard alone hit four API routes
 * every 15 seconds, forever, whether or not anyone was looking. One tab left open on a
 * second monitor is ~46,000 invocations a day (every request runs middleware too, so it
 * bills roughly double the fetch count), which clears the monthly cap on its own.
 *
 * The fix isn't a longer interval — a hidden tab polling every two minutes is still
 * polling all night for nobody. It's to stop entirely when hidden and catch up on the
 * way back:
 *
 *  - Runs `fn` once on mount.
 *  - Ticks every `intervalMs` **only while `document.visibilityState === "visible"`**.
 *  - On becoming visible again, fires immediately, then resumes ticking. So the data you
 *    see when you look back at the tab is fresher than the old always-on poll gave you,
 *    not staler.
 *
 * `fn` is held in a ref, so an inline arrow function won't tear down and re-create the
 * interval on every render.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs = 60_000, enabled = true) {
  const callback = useRef(fn);
  callback.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => void callback.current();

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      stop(); // never stack two intervals
      timer = setInterval(run, intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        run(); // catch up on whatever changed while we were away
        start();
      } else {
        stop();
      }
    };

    run();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
