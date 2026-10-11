"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASK_AI_HASH } from "@/lib/public-site";
import { AskAiContext, useAskAi } from "./ask-ai-context";
import { AskAiPanel } from "./ask-ai-panel";

/**
 * The Ask AI panel, modelled on the Vercel docs' "Ask AI" sidebar.
 *
 * One button in the header opens a column on the right. On a laptop the page
 * slides over to make room for it; on a phone it covers the page. It lives in
 * the site layout rather than on a page of its own, so the conversation
 * survives moving around the site — open it on the homepage, read a post, come
 * back to the same thread.
 */
export function AskAiProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const pathname = usePathname();

  // The panel has an address: bertomill.com/#ask-cael opens it on arrival, and a
  // plain <a href="#ask-cael"> anywhere on the site does too, via hashchange.
  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash === ASK_AI_HASH) setOpen(true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // And the other way round: the hash is on the URL while the panel is open and
  // gone once it closes — re-applied after a client-side navigation too, since
  // the panel outlives the page. replaceState, so Back never replays an open/close.
  useEffect(() => {
    const { pathname: path, search, hash } = window.location;
    if (open && hash !== ASK_AI_HASH) window.history.replaceState(null, "", `${path}${search}${ASK_AI_HASH}`);
    else if (!open && hash === ASK_AI_HASH) window.history.replaceState(null, "", `${path}${search}`);
  }, [open, pathname]);

  // ⌘I / Ctrl+I toggles, as in the Vercel docs. Escape closes, unless something
  // nearer the key (a dialog) already took it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && !e.defaultPrevented) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <AskAiContext.Provider value={value}>
      {/* Laptop: the page slides left by the panel's width (420px, matched in
          ask-ai-panel.tsx). Phone: the panel covers the page and nothing moves. */}
      <div
        className={cn(
          "flex min-h-dvh flex-col bg-background text-foreground transition-[margin-right] duration-300 ease-out",
          open && "lg:mr-[420px]",
        )}
      >
        {children}
      </div>
      <AskAiPanel />
    </AskAiContext.Provider>
  );
}

/**
 * Opens the panel. A plain pill by default; each header dresses it to match its
 * neighbours through `className`, and `children` swaps the label.
 */
export function AskAiButton({ className, children, onClick, ...props }: ComponentProps<"button">) {
  const { open, setOpen } = useAskAi();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="ask-ai-panel"
      onClick={(e) => {
        onClick?.(e);
        setOpen(true);
      }}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-medium text-foreground backdrop-blur-md transition-colors hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <SparklesIcon className="size-4" aria-hidden />
          Ask AI
        </>
      )}
    </button>
  );
}
