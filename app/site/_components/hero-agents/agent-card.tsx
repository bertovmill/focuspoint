"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useEveAgent } from "eve/react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Prose } from "../prose";
import { BUDDY } from "./cast";
import type { AgentStage, Pose, RoomLayout } from "./stage";

/**
 * Where the buddy's agent is served: the bertomill-agents eve workspace
 * (`/eve/guide`). A separate Vercel project on purpose, so nothing a visitor
 * can reach shares a deployment with Cael.
 */
const AGENTS_HOST = process.env.NEXT_PUBLIC_HERO_AGENTS_URL ?? "https://bertomill-agents.vercel.app";

const MAX_CHARS = 1500;
const CARD_W = 340;

const CHAT_PROSE = "text-sm/6 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5";

/**
 * The chat with the buddy: a speech bubble above its head (full width on
 * phones). The conversation is a real eve session with the `guide` agent;
 * closing the bubble keeps nothing.
 */
export function AgentCard({
  anchor,
  bounds,
  onClose,
  stage,
}: {
  anchor: Pose;
  bounds: RoomLayout;
  onClose: () => void;
  stage: AgentStage | null;
}) {
  const agent = useEveAgent({ host: `${AGENTS_HOST}/eve/${BUDDY.agent}`, followIdle: false });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = agent.status === "submitted" || agent.status === "streaming";

  // It sways while it thinks, nods when the reply lands, shrugs if it fails.
  const wasBusy = useRef(false);
  useEffect(() => {
    stage?.setThinking(busy);
    if (wasBusy.current && !busy) stage?.react(agent.status === "error" ? "shrug" : "nod");
    wasBusy.current = busy;
  }, [busy, agent.status, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Ask AI's own Escape handler would otherwise see it too.
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    if (window.matchMedia("(min-width: 640px)").matches) inputRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const messages = agent.data.messages;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = (text: string) => {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || busy || agent.status === "resuming") return;
    setInput("");
    void agent.send(message);
  };

  // Above its head like a speech bubble, kept inside the hero and clear of
  // the nav; it grows upward as the conversation does.
  const left = Math.min(Math.max(16, anchor.x - CARD_W / 2), bounds.width - CARD_W - 16);
  const headTop = anchor.y - anchor.height * 1.15;
  const placed = {
    "--card-left": `${left}px`,
    "--card-bottom": `${bounds.height - headTop}px`,
    "--card-max": `${Math.max(240, Math.min(440, headTop - 72))}px`,
  } as CSSProperties;

  return (
    <div
      role="dialog"
      aria-label="Chat with Berto's helper"
      style={placed}
      className={cn(
        "pointer-events-auto absolute inset-x-3 bottom-[var(--card-bottom)] z-30 flex max-h-[var(--card-max)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        "sm:inset-x-auto sm:left-[var(--card-left)] sm:w-[340px]",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="size-2 rounded-full bg-[#9fbf8c]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/70">Berto&apos;s helper</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="ml-auto rounded-full p-1 text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-sm/6 text-foreground/85">{BUDDY.hello}</p>
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {BUDDY.starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-border/70 px-3 py-1 text-xs text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => {
          const text = message.parts
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("")
            .trim();
          if (!text) return null;
          return message.role === "user" ? (
            <p key={message.id} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-3 py-1.5 text-sm/6">
              {text}
            </p>
          ) : (
            <Prose key={message.id} className={CHAT_PROSE}>
              {text}
            </Prose>
          );
        })}
        {busy && messages.at(-1)?.role === "user" && (
          <p className="flex gap-1 py-1" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-bounce rounded-full bg-foreground/40"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </p>
        )}
        {agent.status === "error" && (
          <p className="text-sm text-destructive">That didn&apos;t go through. Try again in a moment.</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border/60 p-2"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={MAX_CHARS}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Ask me anything about Berto…"
          aria-label="Message Berto's helper"
          className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-foreground/40"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          aria-label="Send"
          className="grid size-8 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      </form>
    </div>
  );
}
