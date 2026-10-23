"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAVAL_PRINCIPLES, NAVAL_SOURCE } from "@/lib/naval-content";
import { TONY_PRINCIPLES, TONY_SOURCE } from "@/lib/tony-robbins-content";
import type { NavalStatus } from "@/lib/naval";

// Thinkers whose lessons Berto is putting into practice. Each gets a page at
// /great-thinkers/<slug>; Naval first, then Tony Robbins (2026-10-23).
const THINKERS = [
  { slug: "naval", name: "Naval Ravikant", lesson: "How to get rich without getting lucky" },
  { slug: "tony-robbins", name: "Tony Robbins", lesson: "Energy is everything" },
];

/** /great-thinkers and its per-thinker pages. */
export function GreatThinkersPanel() {
  const pathname = usePathname();
  if (pathname.startsWith("/great-thinkers/naval")) return <NavalPage />;
  if (pathname.startsWith("/great-thinkers/tony-robbins")) return <TonyRobbinsPage />;
  return <ThinkersList />;
}

function ThinkersList() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Great Thinkers</h1>
        <p className="text-sm text-muted-foreground">Lessons worth living by, turned into small daily moves.</p>
      </header>
      <div className="flex flex-col gap-2">
        {THINKERS.map((t) => (
          <Link
            key={t.slug}
            href={`/great-thinkers/${t.slug}`}
            className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 transition-colors hover:bg-muted"
          >
            <div className="flex flex-1 flex-col">
              <span className="font-medium">{t.name}</span>
              <span className="text-sm text-muted-foreground">{t.lesson}</span>
            </div>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function NavalPage() {
  const [status, setStatus] = useState<NavalStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/great-thinkers/naval")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setStatus)
      .catch(() => setError("Couldn't load today's moves."));
  }, []);

  useEffect(load, [load]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/great-thinkers/naval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error ?? "Something went wrong.");
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const noTasksYet = status && status.moves.every((m) => m.taskId === null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/great-thinkers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-3" /> Great Thinkers
        </Link>
        <h1 className="text-2xl font-semibold">Naval: How to get rich</h1>
        <p className="text-sm text-muted-foreground">
          Three small moves every weekday. They land on your board each morning, and your 12:30 calendar block is when to do them.
        </p>
      </header>

      {status && (
        <section className="flex flex-col gap-1 rounded-2xl bg-primary/10 px-5 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">Today&apos;s principle</span>
          <span className="text-lg font-semibold">{status.principle.title}</span>
          <span className="text-sm text-muted-foreground">{status.principle.meaning}</span>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s moves</h2>
          {status && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <FlameIcon className={cn("size-4", status.streak > 0 && "text-orange-500")} />
              {status.streak} day streak · {status.week.done}/{status.week.possible} this week
            </span>
          )}
        </div>

        {status?.moves.map((m) => (
          <button
            key={m.key}
            disabled={m.taskId === null || busy !== null}
            onClick={() => m.taskId !== null && post({ taskId: m.taskId, done: !m.done }, m.key)}
            className="flex items-start gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-left transition-colors enabled:hover:bg-muted disabled:opacity-60"
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                m.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {m.done && <CheckIcon className="size-3" strokeWidth={3} />}
            </span>
            <span className="flex flex-col">
              <span className={cn("font-medium", m.done && "text-muted-foreground line-through")}>
                {m.label} <span className="text-xs font-normal text-muted-foreground">· {m.minutes} min</span>
              </span>
              <span className="text-sm text-muted-foreground">{m.why}</span>
            </span>
          </button>
        ))}

        {noTasksYet && (
          <Button variant="secondary" className="self-start" disabled={busy !== null} onClick={() => post({ action: "add" }, "add")}>
            {busy === "add" ? "Adding…" : "Put today's moves on my board"}
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sunday review · 15 min</h2>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          <li>What did I ship or publish this week that keeps working without me?</li>
          <li>Where did I trade time for money, and could any of it be owned instead?</li>
          <li>What did I go deep on, and did it feel like play?</li>
          <li>Who are my long-term people, and did I invest in them?</li>
          <li>Did my spending stay flat?</li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">The principles</h2>
        <div className="flex flex-col gap-4">
          {NAVAL_PRINCIPLES.map((p, i) => (
            <div key={p.title} className="flex gap-3">
              <span className="w-5 shrink-0 text-right text-sm text-muted-foreground">{i + 1}</span>
              <div className="flex flex-col">
                <span className="font-medium">{p.title}</span>
                <span className="text-sm text-muted-foreground">{p.meaning}</span>
              </div>
            </div>
          ))}
        </div>
        <a href={NAVAL_SOURCE} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Read the original at nav.al/rich
        </a>
      </section>
    </div>
  );
}

// The lesson only for now; a daily follow-through system like Naval's is still to be decided.
function TonyRobbinsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/great-thinkers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-3" /> Great Thinkers
        </Link>
        <h1 className="text-2xl font-semibold">Tony Robbins: Energy is everything</h1>
        <p className="text-sm text-muted-foreground">
          Energy comes mostly from your mind, your habits and how you move, not just food and sleep.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">The lesson</h2>
        <div className="flex flex-col gap-4">
          {TONY_PRINCIPLES.map((p, i) => (
            <div key={p.title} className="flex gap-3">
              <span className="w-5 shrink-0 text-right text-sm text-muted-foreground">{i + 1}</span>
              <div className="flex flex-col">
                <span className="font-medium">{p.title}</span>
                <span className="text-sm text-muted-foreground">{p.meaning}</span>
              </div>
            </div>
          ))}
        </div>
        <a href={TONY_SOURCE} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Watch the original clip
        </a>
      </section>
    </div>
  );
}
