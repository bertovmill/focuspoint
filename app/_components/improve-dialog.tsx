"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Fire this anywhere to open the Improve box (rail button, I key, palette, phone More). */
export const OPEN_IMPROVE_EVENT = "cael:open-improve";

export function openImprove() {
  window.dispatchEvent(new Event(OPEN_IMPROVE_EVENT));
}

interface Improvement {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  createdAt: string;
}

/**
 * "Liquid software": a freeform box wired to Claude Code that ships whatever is
 * typed, no review. See app/api/improvements/route.ts for the pipeline.
 */
export function ImproveDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ number: number; url: string } | null>(null);
  const [recent, setRecent] = useState<Improvement[] | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadRecent = useCallback(() => {
    fetch("/api/improvements")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Improvement[]) => setRecent(Array.isArray(rows) ? rows : []))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setSent(null);
      setError(null);
    };
    window.addEventListener(OPEN_IMPROVE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_IMPROVE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) loadRecent();
  }, [open, loadRecent]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/improvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't send it.");
      setSent(body);
      setText("");
      loadRecent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            Improve Cael
          </DialogTitle>
          <DialogDescription>
            Say how it should be different. Claude Code builds it and ships it, usually live in about 10 minutes.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={"What should change? For example:\n• Focus the chat box when I open Chat\n• Show protein left today on Home"}
          className="min-h-32 max-h-72"
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
        {sent && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckIcon className="size-4 text-primary" />
            Sent.{" "}
            <a href={sent.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Follow #{sent.number}
            </a>
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">⌘↵ to send · public on GitHub</span>
          <Button onClick={submit} disabled={!text.trim() || sending} size="sm">
            {sending && <Loader2Icon className="size-4 animate-spin" />}
            Ship it
          </Button>
        </div>

        {recent && recent.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="pb-1.5 text-xs font-medium text-muted-foreground">Recent</div>
            <ul className="space-y-1">
              {recent.slice(0, 6).map((r) => (
                <li key={r.number}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        r.state === "closed" ? "bg-emerald-500" : "bg-amber-500 animate-pulse",
                      )}
                    />
                    <span className="truncate">{r.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {r.state === "closed" ? "Shipped" : "Building"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
