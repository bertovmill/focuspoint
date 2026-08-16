"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MailIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubscribeForm } from "./subscribe-form";

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

export function NewsletterPopup({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

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
    if (!next && !subscribed) remember("dismissed");
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {subscribed ? (
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

            <SubscribeForm
              variant="stacked"
              className="mt-2"
              onSuccess={() => {
                setSubscribed(true);
                remember("subscribed");
                window.setTimeout(() => setOpen(false), 2200);
              }}
            />
            <Button type="button" variant="ghost" className="mt-1 self-start" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
