"use client";

import type { EveMessageData } from "eve/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// When Cael calls `navigate_to` (agent/tools/navigate_to.ts), the server only
// echoes the path back; this hook is the half that moves his screen. It watches
// the thread for new navigate_to results, does a client-side route change (the
// (app) layout, and the corner chat in it, stay mounted), then scrolls to and
// flashes the `highlight` element once the page has rendered it.
//
// Results already in the thread when the chat mounts are marked seen, so
// reopening an old conversation never replays its navigation.

type NavigateOutput = { path: string; highlight: string | null; label: string | null };

const HIGHLIGHT_CLASS = "cael-highlight";
const HIGHLIGHT_MS = 2600;
// How long to keep looking for the element after the route change (the page
// may still be fetching the note it was asked to open).
const FIND_TIMEOUT_MS = 6000;
const FIND_EVERY_MS = 150;

function flash(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
}

export function highlightWhenReady(id: string) {
  const started = Date.now();
  const tick = () => {
    const el = document.getElementById(id);
    if (el) return flash(el);
    if (Date.now() - started < FIND_TIMEOUT_MS) window.setTimeout(tick, FIND_EVERY_MS);
  };
  tick();
}

function isSafePath(path: string): boolean {
  // In-app only: a single leading slash, no scheme, no protocol-relative URL.
  return /^\/(?!\/)[^\s]*$/.test(path);
}

export function useAgentNavigation(messages: EveMessageData["messages"]) {
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const calls: { id: string; output: NavigateOutput }[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || part.toolName !== "navigate_to") continue;
        if (part.state !== "output-available") continue;
        calls.push({ id: part.toolCallId, output: part.output as NavigateOutput });
      }
    }
    // First render: everything already in the thread is history, not a request.
    if (seen.current === null) {
      seen.current = new Set(calls.map((c) => c.id));
      return;
    }
    for (const call of calls) {
      if (seen.current.has(call.id)) continue;
      seen.current.add(call.id);
      const { path, highlight } = call.output;
      if (!isSafePath(path)) continue;
      const current = window.location.pathname + window.location.search;
      if (current !== path) router.push(path);
      if (highlight) highlightWhenReady(highlight);
    }
  }, [messages, router]);
}
