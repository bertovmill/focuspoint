"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Prose } from "./prose";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What is Berto building right now?",
  "What are the 8 forms of wealth?",
  "How does Cael actually work?",
  "What should I read first?",
];

/**
 * The visitor-facing chat.
 *
 * Talks to `/api/site/chat`, which is a tool-less completion — this UI can't reach
 * the real agent, and the endpoint it does reach only knows public aggregates.
 * Streams plain text, so there's no protocol client to keep in step with the server.
 */
export function PublicChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const next: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(next);
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

        // Open an empty assistant turn, then fill it as tokens land.
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
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
        // with nothing in it. Without this the visitor is left staring at a blank bubble.
        if (received.trim().length === 0) throw new Error("Cael couldn't answer just now. Try again in a moment.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        // Drop the empty assistant turn so the transcript doesn't keep a blank bubble.
        setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1">
        {empty ? (
          <div className="py-6">
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-6 py-6">
            {messages.map((m, i) => (
              <li
                key={`${m.role}-${i}`}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[95%] min-w-0">
                    <div className="mb-1.5 font-mono text-xs uppercase tracking-[0.14em] text-primary">Cael</div>
                    {m.content ? (
                      <Prose>{m.content}</Prose>
                    ) : (
                      <span className="inline-block size-2 animate-pulse rounded-full bg-muted-foreground" />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="pb-4 text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 border-t border-border/60 bg-background/90 py-4 backdrop-blur-md"
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 focus-within:border-primary/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={1500}
            placeholder="Ask about what Berto's building…"
            aria-label="Message Cael"
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            aria-label="Send"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUpIcon className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cael only knows what Berto publishes here — no access to his tasks, notes or calendar.
        </p>
      </form>
    </div>
  );
}
