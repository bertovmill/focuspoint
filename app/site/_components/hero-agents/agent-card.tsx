"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEveAgent, type EveMessage } from "eve/react";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { Prose } from "../prose";
import { BUDDY } from "./cast";
import type { AgentStage, Pose, RoomLayout } from "./stage";

/**
 * Where the buddy's agent is served: the bertomill-agents eve workspace
 * (`/eve/guide`). A separate Vercel project on purpose, so nothing a visitor
 * can reach shares a deployment with Cael.
 */
const AGENTS_HOST =
  process.env.NEXT_PUBLIC_HERO_AGENTS_URL ??
  "https://bertomill-agents.vercel.app";

const MAX_CHARS = 1500;
/** The bubble's default size, and the smallest it can be dragged to. */
const CARD_W = 340;
const CARD_H = 440;
const MIN_W = 300;
const MIN_H = 240;
const MAX_W = 760;
/** The size you dragged it to, remembered for next time. */
const SIZE_KEY = "buddy-chat-size";

/** How long each ghost suggestion sits in the empty input before the next. */
const ROTATE_MS = 4000;
const SUGGESTIONS = [...BUDDY.suggestions, ...BUDDY.starters];

/**
 * The faint text shown after what's typed: a whole rotating question while the
 * input is empty, or the rest of one that starts with what's been typed so far.
 */
function ghostFor(input: string, tick: number): string | null {
  if (!input) return SUGGESTIONS[tick % SUGGESTIONS.length];
  if (input.includes("\n")) return null;
  const typed = input.toLowerCase();
  const match = SUGGESTIONS.find(
    (q) => q.length > input.length && q.toLowerCase().startsWith(typed),
  );
  return match ? match.slice(input.length) : null;
}

function savedSize(): { w: number; h: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null");
    return v && typeof v.w === "number" && typeof v.h === "number" ? v : null;
  } catch {
    return null;
  }
}

/**
 * What the buddy is doing while no reply text is showing: the page it's
 * reading, or just thinking. Null once words are streaming. The model reasons
 * and reads pages before it writes, and those steps add an assistant message
 * with no text, so "is the last message the user's?" isn't enough.
 */
function activityLabel(messages: readonly EveMessage[]): string | null {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return "Thinking";
  const part = last.parts.findLast((p) => p.type !== "step-start");
  if (part?.type === "text" && part.text.trim()) return null;
  if (part?.type === "dynamic-tool" && !part.state.startsWith("output"))
    return part.toolMetadata?.eve?.label ?? "Thinking";
  return "Thinking";
}

/**
 * A message's text. Text from separate agent steps (before and after a page
 * read) becomes separate paragraphs instead of running together.
 */
function replyText(message: EveMessage): string {
  let text = "";
  let step: number | undefined;
  for (const part of message.parts) {
    if (part.type !== "text") continue;
    if (text && part.stepIndex !== step) text += "\n\n";
    text += part.text;
    step = part.stepIndex;
  }
  return text.trim();
}

const CHAT_PROSE =
  "text-sm/6 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5";

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
  const agent = useEveAgent({
    host: `${AGENTS_HOST}/eve/${BUDDY.agent}`,
    followIdle: false,
  });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Which ghost suggestion is up; it only moves on while the input is empty.
  const [tick, setTick] = useState(() =>
    Math.floor(Math.random() * SUGGESTIONS.length),
  );
  useEffect(() => {
    if (input) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [input]);
  const ghost = ghostFor(input, tick);
  const acceptGhost = () => {
    if (!ghost) return;
    setInput(input + ghost);
    inputRef.current?.focus({ preventScroll: true });
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = agent.status === "submitted" || agent.status === "streaming";
  // Dragged size; null until someone drags (or a saved size loads).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => setSize(savedSize()), []);

  // It sways while it thinks, nods when the reply lands, shrugs if it fails.
  const wasBusy = useRef(false);
  useEffect(() => {
    stage?.setThinking(busy);
    if (wasBusy.current && !busy)
      stage?.react(agent.status === "error" ? "shrug" : "nod");
    wasBusy.current = busy;
  }, [busy, agent.status, stage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Ask AI's own Escape handler would otherwise see it too.
      e.preventDefault();
      onClose();
    };
    // A click or tap anywhere else closes it, except on the buttons that
    // toggle it, which would otherwise close it and open it straight back up.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || cardRef.current?.contains(target)) return;
      if (target.closest("[data-chat-toggle]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    if (window.matchMedia("(min-width: 640px)").matches)
      inputRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const messages = agent.data.messages;
  // Rendered once per change to the conversation, not on every keystroke or resize.
  const thread = useMemo(
    () =>
      messages.map((message) => {
        const text = replyText(message);
        if (!text) return null;
        return message.role === "user" ? (
          <p
            key={message.id}
            className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-3 py-1.5 text-sm/6"
          >
            {text}
          </p>
        ) : (
          <Prose key={message.id} className={CHAT_PROSE}>
            {text}
          </Prose>
        );
      }),
    [messages],
  );
  const activity = busy ? activityLabel(messages) : null;
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const submit = (text: string) => {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || busy || agent.status === "resuming") return;
    setInput("");
    void agent.send(message);
  };

  // Above its head like a speech bubble, kept inside the hero and clear of
  // the nav. It's anchored at the bottom, so it grows upward (and out from
  // its middle) as you drag it bigger.
  const headTop = anchor.y - anchor.height * 1.15;
  const maxH = Math.max(MIN_H, headTop - 72);
  const maxW = Math.max(MIN_W, Math.min(MAX_W, bounds.width - 32));
  const w = Math.min(Math.max(size?.w ?? CARD_W, MIN_W), maxW);
  const h = Math.min(Math.max(size?.h ?? CARD_H, MIN_H), maxH);
  const left = Math.min(Math.max(16, anchor.x - w / 2), bounds.width - w - 16);
  const placed = {
    "--card-left": `${left}px`,
    "--card-bottom": `${bounds.height - headTop}px`,
    "--card-w": `${w}px`,
    // Until it's been dragged, it only gets as tall as the conversation needs.
    [size ? "--card-h" : "--card-max"]: `${h}px`,
  } as CSSProperties;

  // Drag the grip in the top corner: up makes it taller, sideways wider
  // (on both sides, so it stays over the buddy's head).
  const onGripDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const card = e.currentTarget.closest<HTMLElement>("[role=dialog]");
    if (!card) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured; the drag still works while it stays on the grip.
    }
    const start = {
      x: e.clientX,
      y: e.clientY,
      w: card.offsetWidth,
      h: card.offsetHeight,
    };
    const side =
      e.clientX > card.getBoundingClientRect().left + card.offsetWidth / 2
        ? 1
        : -1;
    let latest = { w: start.w, h: start.h };
    // While dragging, size the card straight through its CSS variables, at
    // most once a frame, and leave React (and the chat's markdown) alone;
    // the size goes into state once, on release.
    card.style.removeProperty("--card-max");
    card.dataset.resizing = "";
    let frame = 0;
    const apply = () => {
      frame = 0;
      const left = Math.min(
        Math.max(16, anchor.x - latest.w / 2),
        bounds.width - latest.w - 16,
      );
      card.style.setProperty("--card-w", `${latest.w}px`);
      card.style.setProperty("--card-h", `${latest.h}px`);
      card.style.setProperty("--card-left", `${left}px`);
    };
    const move = (ev: PointerEvent) => {
      latest = {
        w: Math.min(
          Math.max(start.w + side * (ev.clientX - start.x) * 2, MIN_W),
          maxW,
        ),
        h: Math.min(Math.max(start.h - (ev.clientY - start.y), MIN_H), maxH),
      };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(frame);
      apply();
      delete card.dataset.resizing;
      setSize(latest);
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(latest));
      } catch {
        // Private mode: the size just won't be remembered.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onGripKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 60 : 20;
    const d = {
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = {
      w: Math.min(Math.max(w + d[0] * 2, MIN_W), maxW),
      h: Math.min(Math.max(h + d[1], MIN_H), maxH),
    };
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the size just won't be remembered.
    }
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Chat with Berto's helper"
      style={placed}
      className={cn(
        "pointer-events-auto absolute inset-x-3 bottom-[var(--card-bottom)] z-30 flex h-[var(--card-h,auto)] max-h-[var(--card-max,none)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md",
        // `duration-200` would otherwise also ease every size change, which made resizing lag.
        "animate-in fade-in slide-in-from-bottom-2 duration-200 transition-none",
        // Re-blurring the room behind it every frame is what makes a resize stutter.
        "data-[resizing]:bg-background data-[resizing]:backdrop-blur-none",
        "sm:inset-x-auto sm:left-[var(--card-left)] sm:w-[var(--card-w)]",
      )}
    >
      {/* Resize grips: both top corners, like a window you pull up. */}
      {(["left", "right"] as const).map((corner) => (
        <button
          key={corner}
          type="button"
          aria-label="Resize chat (arrow keys)"
          title="Drag to resize"
          onPointerDown={onGripDown}
          onKeyDown={onGripKey}
          onDoubleClick={() => {
            setSize(null);
            try {
              localStorage.removeItem(SIZE_KEY);
            } catch {
              // Nothing saved to clear.
            }
          }}
          className={cn(
            "absolute top-0 z-10 size-5 touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary",
            corner === "left"
              ? "left-0 cursor-nesw-resize max-sm:hidden"
              : "right-0 cursor-nwse-resize max-sm:cursor-ns-resize",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 size-2 border-t-2 border-foreground/25",
              corner === "left"
                ? "left-1.5 rounded-tl-sm border-l-2"
                : "right-1.5 rounded-tr-sm border-r-2",
            )}
          />
        </button>
      ))}
      <header className="flex items-center gap-2 border-b border-border/60 py-2.5 pl-4 pr-6">
        <span className="size-2 rounded-full bg-[#9fbf8c]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/70">
          Berto&apos;s helper
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="ml-auto rounded-full p-1 text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
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
        {thread}
        {activity && (
          <p className="flex items-center gap-2 py-1 text-sm" role="status">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-foreground/40"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </span>
            <Shimmer as="span" duration={1.4}>{`${activity}…`}</Shimmer>
          </p>
        )}
        {agent.status === "error" && (
          <p className="text-sm text-destructive">
            That didn&apos;t go through. Try again in a moment.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border/60 p-2"
      >
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && ghost) {
                e.preventDefault();
                acceptGhost();
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            aria-label="Message Berto's helper"
            aria-description={ghost ? `Press Tab for: ${input + ghost}` : undefined}
            className="block max-h-28 min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          {/* The ghost suggestion, laid over the textarea in the same type so
              its words line up after what's typed. */}
          {ghost && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-1.5 text-sm"
            >
              <span className="invisible">{input}</span>
              <span
                key={input ? "rest" : ghost}
                className="text-foreground/35 animate-in fade-in duration-500"
              >
                {ghost}
              </span>
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={acceptGhost}
                className="pointer-events-auto ml-1.5 inline-block translate-y-[-1px] rounded border border-border/70 px-1 font-mono text-[10px] leading-4 text-foreground/40 transition-colors hover:text-foreground/70"
              >
                <span className="max-sm:hidden">Tab</span>
                <span className="sm:hidden">Use</span>
              </button>
            </div>
          )}
        </div>
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
