"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

/** True when the key press came from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * The palette's two openers, shared by the app and the public site:
 * `/` (pressed anywhere you aren't typing) opens it, the way GitHub and Slack
 * focus search; ⌘K / Ctrl+K toggles it from anywhere, including inside a field.
 * Nothing on screen advertises either (Berto, 2026-10-11) — it's a thing you know.
 */
export function usePaletteHotkey(setOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Shift stays allowed: on some layouts "/" is Shift+7.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);
}
