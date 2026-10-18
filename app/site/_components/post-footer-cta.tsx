import { CalendarIcon } from "lucide-react";
import { BOOKING_URL } from "@/lib/public-site";

/**
 * Closer shown at the end of every article and episode — the moment a reader is
 * most likely to want to talk. Deliberately quiet: one line and one action, so it
 * reads as an offer rather than an ad break.
 */
export function PostFooterCta() {
  return (
    <aside className="mt-14 rounded-xl border border-border bg-card p-6">
      <h2 className="font-medium tracking-tight">Working on something like this?</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        I&apos;m always up for talking through agents, tooling, or whatever you&apos;re building.
        Grab a slot and let&apos;s get into it.
      </p>
      <a
        href={BOOKING_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <CalendarIcon className="size-4" />
        Book a meeting
      </a>
    </aside>
  );
}
