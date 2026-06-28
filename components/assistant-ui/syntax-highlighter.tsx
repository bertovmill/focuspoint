"use client";

import { makePrismAsyncSyntaxHighlighter } from "@assistant-ui/react-syntax-highlighter/full";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Async (code-split) Prism highlighter that bundles all languages, so fenced
// code blocks get per-language coloring with no manual language registration.
// We render a consistently dark code block in both light and dark app themes —
// background/padding come from the surrounding `pre` in markdown-text, so the
// theme only contributes token colors.
export const SyntaxHighlighter = makePrismAsyncSyntaxHighlighter({
  style: oneDark,
  customStyle: {
    margin: 0,
    padding: 0,
    background: "transparent",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
  codeTagProps: {
    style: { background: "transparent", fontSize: "inherit" },
  },
});
