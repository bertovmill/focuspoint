"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MailIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Newsletter signup, shown once per visitor.
 *
 * Trigger is whichever comes first: ~30s on the page, or scrolling half of it.
 * That way an engaged reader gets asked and someone who bounces never does.
 *
 * Both "subscribed" and "dismissed" are remembered in localStorage, so nobody is
 * asked twice. Built on the project's existing shadcn dialog rather than a
 * bespoke overlay, so focus trapping, Escape and scroll-lock come for free.
 */

const STORAGE_KEY = "bertomill.newsletter";
const DELAY_MS = 30_000;
const SCROLL_FRACTION = 0.5;

type Status = "idle" | "submitting" | "done" | "error";

export function NewsletterPopup({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't interrupt anyone with a form that can't submit — the server only
    // reports enabled once Resend's credentials are actually present.
    if (!enabled) return;

    // Never re-ask someone who already subscribed or closed it.
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return; // Storage blocked (private mode) — better to stay silent than nag every page.
    }

    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      setOpen(true);
      cleanup();
    };

    const onScroll = () => {
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable > 0 && window.scrollY / scrollable >= SCROLL_FRACTION) fire();
    };

    const timer = window.setTimeout(fire, DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    }
    return cleanup;
  }, [enabled]);

  const remember = (value: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage blocked — the dialog still closes for this session */
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && status !== "done") remember("dismissed");
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/site/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't sign you up just now.");
      setStatus("done");
      remember("subscribed");
      window.setTimeout(() => setOpen(false), 2200);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {status === "done" ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10">
              <CheckIcon className="size-5 text-primary" />
            </div>
            <DialogTitle className="mt-4 text-lg">You&apos;re in.</DialogTitle>
            <DialogDescription className="mt-2">
              I&apos;ll send the next one straight to your inbox.
            </DialogDescription>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 grid size-10 place-items-center rounded-full bg-primary/10">
                <MailIcon className="size-5 text-primary" />
              </div>
              <DialogTitle>Get what I&apos;m learning</DialogTitle>
              <DialogDescription>
                Occasional notes on building AI agents, shipping software, and running a life with
                one. No spam, and one click to leave.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "submitting"}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={status === "submitting" || email.trim().length === 0}>
                  {status === "submitting" ? "Signing you up…" : "Subscribe"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Not now
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
