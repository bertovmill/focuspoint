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
