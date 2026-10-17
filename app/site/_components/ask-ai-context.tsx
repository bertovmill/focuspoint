"use client";

import { createContext, useContext } from "react";

export interface AskAiState {
  /** Whether the Ask AI panel is showing. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /**
   * Opens Ask AI the way the current page wants: the homepage's plush buddy
   * registers itself (see `setOpener`) so the button, ⌘I and #ask-cael open
   * its chat in the room instead; everywhere else this opens the panel.
   */
  request: () => void;
  setOpener: (opener: (() => void) | null) => void;
}

export const AskAiContext = createContext<AskAiState | null>(null);

export function useAskAi(): AskAiState {
  const ctx = useContext(AskAiContext);
  if (!ctx) throw new Error("useAskAi() needs <AskAiProvider> above it — it lives in app/site/layout.tsx.");
  return ctx;
}
