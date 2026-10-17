"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

/**
 * What Berto has open right now, for the corner chat: each page publishes a line
 * about the item in front of him (the open note, the article in the editor, the
 * sketch on the canvas) and the corner chat sends it, hidden, with every
 * message. Pages that publish nothing still get their section name from the
 * shell.
 */
type PageContextValue = {
  detail: string | null;
  setDetail: (detail: string | null) => void;
  /** A page with its own Cael chat on screen (the Writing editor) hides the corner one. */
  cornerHidden: boolean;
  setCornerHidden: (hidden: boolean) => void;
};

const PageContext = createContext<PageContextValue | null>(null);

export function PageContextProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null);
  const [cornerHidden, setCornerHidden] = useState(false);
  const value = useMemo(() => ({ detail, setDetail, cornerHidden, setCornerHidden }), [detail, cornerHidden]);
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

/** The current page's detail line, or null when it hasn't published one. */
export function usePageDetail(): string | null {
  return useContext(PageContext)?.detail ?? null;
}

/**
 * Publish what's open on this page. Pass null when nothing is. Cleared when the
 * component unmounts, so leaving the page doesn't leave a stale line behind.
 */
export function usePublishPageDetail(detail: string | null) {
  const setDetail = useContext(PageContext)?.setDetail;
  useEffect(() => {
    if (!setDetail) return;
    setDetail(detail);
    return () => setDetail(null);
  }, [setDetail, detail]);
}

/** True while a page has asked for the corner chat to step aside. */
export function useCornerHidden(): boolean {
  return useContext(PageContext)?.cornerHidden ?? false;
}

/** Hide the corner chat while `hidden` is true (and this component is mounted). */
export function useHideCornerChat(hidden: boolean) {
  const setCornerHidden = useContext(PageContext)?.setCornerHidden;
  useEffect(() => {
    if (!setCornerHidden) return;
    setCornerHidden(hidden);
    return () => setCornerHidden(false);
  }, [setCornerHidden, hidden]);
}

/** Long note or article text, cut to what's worth sending with every message. */
export function clipForContext(text: string, max = 1500): string {
  const flat = text.trim();
  return flat.length > max ? `${flat.slice(0, max)}… (cut; ${flat.length} characters in all)` : flat;
}

/**
 * The text on Berto's screen right now, so Cael sees what he sees on any page
 * (Berto, 2026-10-17) — not only the ones that publish a detail line. Reads the
 * visible page area (marked `data-cael-page` in the shell; the nav rail and the
 * chat sit outside it), plus whatever is typed into its fields, since
 * innerText skips those. Text only: no images or layout.
 */
export function readPageText(max = 6000): string | null {
  if (typeof document === "undefined") return null;
  const parts: string[] = [];
  for (const root of document.querySelectorAll<HTMLElement>("[data-cael-page]")) {
    // A hidden element's innerText falls back to all of its text, hidden or not.
    if (!root.checkVisibility()) continue;
    const text = root.innerText.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    if (text) parts.push(text);
    const fields: string[] = [];
    for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type]), input[type=text], input[type=search]")) {
      const value = el.value.trim();
      if (!value || !el.checkVisibility()) continue;
      const name = el.getAttribute("aria-label") || el.placeholder || el.name;
      fields.push(name ? `${name}: ${value}` : value);
    }
    if (fields.length) parts.push(`Typed into fields:\n${fields.join("\n")}`);
  }
  const all = parts.join("\n\n");
  if (!all) return null;
  return all.length > max ? `${all.slice(0, max)}… (cut; ${all.length} characters on screen in all)` : all;
}
