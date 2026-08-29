"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpIcon, CheckIcon, ChevronsUpDownIcon, Minimize2Icon } from "lucide-react";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { CHAT_MODEL_DEFAULT, CHAT_MODEL_TIERS, isChatModelId } from "@/lib/chat-model";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const DOCKED_STORAGE_KEY = "focuspoint:chat-bar-docked";

/**
 * The rungs of the model ladder, Max at the top — one global setting for every
 * Cael conversation. Selecting a rung PUTs immediately; agent/model.ts reads it
 * before every model call, so it applies from the next message.
 */
function ModelPicker() {
  const [model, setModel] = useState<string>(CHAT_MODEL_DEFAULT);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/chat-model", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (isChatModelId(d?.model)) setModel(d.model);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const pick = useCallback((id: string) => {
    setModel(id);
    void fetch("/api/settings/chat-model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: id }),
    });
  }, []);

  const current = CHAT_MODEL_TIERS.find((t) => t.id === model) ?? CHAT_MODEL_TIERS[2]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1 rounded-xl px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Model: ${current.label}`}
          title="Pick Cael's model"
        >
          {current.label}
          <ChevronsUpDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="mb-2 w-64">
        {/* Rendered top rung first, so "up" reads upward. */}
        {[...CHAT_MODEL_TIERS].reverse().map((tier) => (
          <DropdownMenuItem key={tier.id} onClick={() => pick(tier.id)} className="gap-2">
            <CheckIcon className={cn("size-4 shrink-0", tier.id === model ? "opacity-100" : "opacity-0")} />
            <span className="flex min-w-0 flex-col">
              <span className={cn("text-sm", tier.id === model && "font-medium")}>{tier.label}</span>
              <span className="text-xs text-muted-foreground">{tier.blurb}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Matches the nav rail's spring so the bar moves with the same weight as the
// rest of the chrome.
const BAR_SPRING = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.8 };

/**
 * The ever-present line to Cael: a wide input pill floating at the bottom
 * center of every section. Sending opens the chat page with the message
 * already on its way. The corner button docks it down to a small bubble in
 * the bottom-right; the bubble brings it back. Docked-or-not survives
 * reloads via localStorage.
 *
 * Desktop only — on mobile the bottom nav owns that edge and Chat is one tap
 * away.
 */
export function FloatingChatBar({ onSend }: { readonly onSend: (message: string) => void }) {
  const [docked, setDocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setDocked(window.localStorage.getItem(DOCKED_STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  const setDockedPersistent = useCallback((next: boolean) => {
    setDocked(next);
    window.localStorage.setItem(DOCKED_STORAGE_KEY, next ? "1" : "0");
  }, []);

  const submit = useCallback(() => {
    const message = value.trim();
    if (!message) return;
    setValue("");
    onSend(message);
  }, [value, onSend]);

  // Render nothing until we know which shape to draw, so the bar doesn't
  // flash open and then jump to the corner on load.
  if (!hydrated) return null;

  return (
    <div className="hidden lg:block">
      <AnimatePresence initial={false}>
        {docked ? (
          <motion.button
            key="bubble"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 8 }}
            transition={BAR_SPRING}
            onClick={() => setDockedPersistent(false)}
            className={cn(
              "fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full",
              "border border-border bg-background/95 shadow-lg backdrop-blur-sm",
              "transition-colors hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
            aria-label="Open chat bar"
            title="Chat with Cael"
          >
            <CaelAvatar size={28} />
          </motion.button>
        ) : (
          <motion.form
            key="bar"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={BAR_SPRING}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className={cn(
              "fixed bottom-5 left-1/2 z-40 -translate-x-1/2",
              "flex w-[min(44rem,calc(100vw-10rem))] items-center gap-2.5",
              "rounded-2xl border border-border bg-background/95 py-2.5 pl-3.5 pr-2.5 shadow-lg backdrop-blur-sm",
            )}
          >
            <CaelAvatar size={30} />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask Cael anything…"
              aria-label="Message Cael"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <ModelPicker />
            <button
              type="submit"
              disabled={!value.trim()}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                value.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground/60",
              )}
              aria-label="Send message"
            >
              <ArrowUpIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setDockedPersistent(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Send chat bar to the corner"
              title="Send to corner"
            >
              <Minimize2Icon className="size-4" />
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
