"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ChevronsRightIcon, SquarePenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAskAi } from "./ask-ai-context";

// The chat itself (markdown renderer, scroll anchoring, the network code) loads
// the first time the panel opens, so a page that never opens it never pays for it.
const AskAiChat = dynamic(() => import("./ask-ai-chat").then((m) => m.AskAiChat), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

/**
 * The column on the right. Fixed to the viewport: `AskAiProvider` pushes the
 * page over on laptops; on phones the panel simply covers it.
 */
export function AskAiPanel() {
  const { open, setOpen } = useAskAi();
  // Once opened, the chat stays mounted behind the slide-out so the thread survives.
  const [mounted, setMounted] = useState(false);
  // "New chat" remounts the thread — a fresh key is the whole reset.
  const [thread, setThread] = useState(0);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Phone: the panel covers the page, so stop the page scrolling underneath it.
  useEffect(() => {
    if (!open || window.matchMedia("(min-width: 1024px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <aside
      id="ask-ai-panel"
      aria-label="Ask AI"
      inert={!open}
      className={cn(
        // `visibility` holds "visible" for the whole slide-out, so the panel is
        // only hidden from the tab order once it's actually off-screen.
        "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border/60 bg-background transition-[transform,visibility] duration-300 ease-out lg:w-[420px]",
        open ? "visible translate-x-0" : "invisible translate-x-full",
      )}
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-medium tracking-tight">Cael</span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Berto&apos;s agent
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="New chat"
            title="New chat"
            onClick={() => setThread((t) => t + 1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <SquarePenIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            title="Close (⌘I)"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </header>
      {mounted && <AskAiChat key={thread} />}
    </aside>
  );
}
