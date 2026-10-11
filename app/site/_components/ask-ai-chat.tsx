"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, BookOpenIcon, BotIcon, GemIcon, HammerIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { cn } from "@/lib/utils";
import { useAskAi } from "./ask-ai-context";
import { Prose } from "./prose";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  { icon: HammerIcon, text: "What is Berto building right now?" },
  { icon: GemIcon, text: "What are the 8 forms of wealth?" },
  { icon: BotIcon, text: "How does Cael actually work?" },
  { icon: BookOpenIcon, text: "What should I read first?" },
] as const;

/** Prose is set for articles; this tightens it for a 420px column. */
const CHAT_PROSE =
  "text-sm/6 [&_p]:my-2.5 [&_ul]:my-2.5 [&_ol]:my-2.5 [&_li]:my-1 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_blockquote]:my-3 [&_hr]:my-5";

const DESKTOP = "(min-width: 1024px)";

/**
 * The visitor-facing chat, inside the Ask AI panel.
 *
 * Talks to `/api/site/chat`, a tool-less completion that knows only public
 * aggregates — this UI can't reach the real agent. Streams plain text, so
 * there's no protocol client to keep in step with the server.
 */
export function AskAiChat() {
  const { open } = useAskAi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modKey, setModKey] = useState("⌘");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The tip names the real key: everything but a Mac says Ctrl.
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("Ctrl");
  }, []);

  // Laptop: the cursor lands in the box as the panel opens. Not on phones — the
  // keyboard would shoot up over half the panel before anyone has read it.
  useEffect(() => {
    if (open && window.matchMedia(DESKTOP).matches) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const next: ChatMessage[] = [...messages, { role: "user", content: question }];
      // Open Cael's turn straight away so the typing dots show for the whole wait —
      // the server builds its context before the first byte comes back.
      setMessages([...next, { role: "assistant", content: "" }]);
      setInput("");
      setError(null);
      setBusy(true);

      try {
        const res = await fetch("/api/site/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? "Cael couldn't answer just now.");
        }

        // Fill the open turn as tokens land.
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let received = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + value };
            return copy;
          });
        }
        // The response can fail *after* headers are sent, which closes the stream
        // with nothing in it. Without this the visitor is left staring at a blank turn.
        if (received.trim().length === 0) throw new Error("Cael couldn't answer just now. Try again in a moment.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        // Drop the empty assistant turn so the thread doesn't keep a blank bubble.
        setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const empty = messages.length === 0;

  return (
    <>
      {empty ? (
        <div className="flex-1 overflow-y-auto px-5 pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Cael is the agent that runs Berto&apos;s life — goals, reading, training, calendar.
            This is its public face: same voice, none of the keys. Ask it what he&apos;s building.
          </p>
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="gap-6 px-5 py-6">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div className="min-w-0 max-w-full">
                    <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">Cael</div>
                    {m.content ? <Prose className={CHAT_PROSE}>{m.content}</Prose> : <TypingDots />}
                  </div>
                )}
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Like the Vercel docs: suggestions, the shortcut tip, then the box, all pinned to the bottom. */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        {empty && (
          <ul className="mb-3 flex flex-col">
            {SUGGESTIONS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => void send(text)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-foreground/90 transition-colors hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {text}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-2 hidden px-2 text-xs text-muted-foreground lg:block">
          Tip: open and close with <Kbd>{modKey}</Kbd> <Kbd>I</Kbd>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="rounded-xl border border-border bg-card p-2 transition-colors focus-within:border-primary/50"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={1500}
            placeholder="Ask about what Berto's building…"
            aria-label="Message Cael"
            className="max-h-40 min-h-14 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none field-sizing-content placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              aria-label="Send"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          </div>
        </form>
        <p className="mt-2 px-2 text-[11px] leading-relaxed text-muted-foreground">
          Cael only knows what Berto publishes here — no access to his tasks, notes or calendar.
        </p>
      </div>
    </>
  );
}

/** Cael's turn before the first token lands: three dots bouncing in sequence, in a bubble. */
function TypingDots() {
  return (
    <div
      role="status"
      aria-label="Cael is thinking"
      className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground animate-bounce motion-reduce:animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}
