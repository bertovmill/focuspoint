"use client";

import { createContext, useContext } from "react";

export interface AskAiState {
  /** Whether the Ask AI panel is showing. */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const AskAiContext = createContext<AskAiState | null>(null);

export function useAskAi(): AskAiState {
  const ctx = useContext(AskAiContext);
  if (!ctx) throw new Error("useAskAi() needs <AskAiProvider> above it — it lives in app/site/layout.tsx.");
  return ctx;
}
