"use client";

import { useEffect, useState } from "react";
import { CandyIcon, CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/nutrition";
import type { CheckinDay, CheckinResult, EstimatedMeal } from "@/lib/yesterday-meals";
import { cn } from "@/lib/utils";

// The first time Cael opens each day it asks "what did you eat yesterday?".
// Six chips (his most-logged meals, so they drift with how he actually eats),
// a sweets flag, and a plain-text box for the real answer. One save writes
// rough meals for yesterday and comes back with a one-line verdict.
// Dismissal is remembered per day in localStorage; a day whose check-in is
// already in never asks. Meals he logged during the day itself (the
// "+ Log a meal" link on Home, 2026-11-05) show up in the popup as already
// counted, and it only asks for the rest.
//
// The same dialog, in "today" mode, is the day-of path: each save ADDS to today
// instead of replacing, and there is no verdict, since the day isn't over.

const KEY_PREFIX = "cael.yesterday-checkin.";

interface Week {
  logged: number;
  avg_protein_g: number;
  avg_kcal: number;
}

interface Loaded {
  day: CheckinDay;
  date: string;
  logged: boolean;
  meals: EstimatedMeal[];
  chips: string[];
  week: Week;
}

type Saved = CheckinResult & { week: Week };

const VERDICT_STYLE: Record<CheckinResult["verdict"], string> = {
  good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  ok: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  off: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
};

const VERDICT_LABEL: Record<CheckinResult["verdict"], string> = {
  good: "Ate well",
  ok: "Pretty good",
  off: "Off day",
};

/** First open of the day: ask about yesterday, once. */
export function YesterdayCheckin() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    const key = KEY_PREFIX + todayISO();
    if (typeof window === "undefined" || window.localStorage.getItem(key)) return;
    let cancelled = false;
    fetch("/api/nutrition/yesterday?day=yesterday")
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
      .then((d) => {
        if (cancelled || !d || d.logged) return;
        setData(d);
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(KEY_PREFIX + todayISO(), "1");
    setOpen(false);
  }

  if (!data) return null;
  return (
    <MealCheckin
      day="yesterday"
      data={data}
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : dismiss())}
      onSaved={() => window.localStorage.setItem(KEY_PREFIX + todayISO(), "1")}
      onSkip={dismiss}
    />
  );
}

/** "+ Log a meal": the day-of path. Opens the same dialog for today; each save adds. */
export function LogMealLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    fetch("/api/nutrition/yesterday?day=today")
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        id="log-meal"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <PlusIcon className="size-3.5" />
        Log a meal
      </button>
      {open && <MealCheckin day="today" data={data} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function MealCheckin({
  day,
  data,
  open,
  onOpenChange,
  onSaved,
  onSkip,
}: {
  day: CheckinDay;
  data: Loaded | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (saved: Saved) => void;
  onSkip?: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sweets, setSweets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = day === "today";

  function toggleChip(chip: string) {
    setPicked((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  async function save() {
    const parts = [...picked, text.trim()].filter(Boolean);
    if (parts.length === 0) {
      setError("Tap a meal or type what you ate.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/nutrition/yesterday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parts.join(". "), sweets, day }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
      const result = (await res.json()) as Saved;
      setSaved(result);
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const already = data?.meals ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No base max-width here: the shared dialog's calc(100%-2rem) keeps a side
          gap on phones; `max-w-md` alone would override it and run edge to edge. */}
      <DialogContent id={today ? "meal-checkin" : "yesterday-checkin"} className="sm:max-w-md">
        {saved ? (
          <>
            <DialogHeader>
              <DialogTitle>{today ? "Today so far" : "Yesterday, roughly"}</DialogTitle>
              <DialogDescription>Ballpark numbers, not a calorie count.</DialogDescription>
            </DialogHeader>
            {!today && (
              <div className={cn("rounded-lg px-3 py-2 text-sm font-medium", VERDICT_STYLE[saved.verdict])}>
                {VERDICT_LABEL[saved.verdict]} · {saved.note}
              </div>
            )}
            <ul className="divide-y text-sm">
              {saved.meals.map((m, i) => (
                <li key={i} className="flex items-center justify-between py-1.5">
                  <span>{m.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {m.protein_g}g · {m.kcal} kcal
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between py-1.5 font-medium">
                <span>Total</span>
                <span className="tabular-nums">
                  {Math.round(saved.totals.protein_g)}g of {saved.target_g}g · {saved.totals.kcal} kcal
                </span>
              </li>
            </ul>
            {!today && saved.week.logged > 1 && (
              <p className="text-xs text-muted-foreground">
                Last {saved.week.logged} logged days: ~{saved.week.avg_protein_g}g protein, ~{saved.week.avg_kcal} kcal a day.
              </p>
            )}
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{today ? "What did you eat?" : "What did you eat yesterday?"}</DialogTitle>
              <DialogDescription>
                {today ? "Add what you've had; come back later for the rest." : "Tap what fits, then say the rest in your own words."}
              </DialogDescription>
            </DialogHeader>
            {already.length > 0 && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Already counted: {already.map((m) => m.name).join(", ")}.{!today && " What else?"}
              </p>
            )}
            {data === null ? (
              <p className="text-xs text-muted-foreground">Loading your usual meals…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.chips.map((chip) => {
                  const on = picked.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleChip(chip)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                      )}
                    >
                      {on && <CheckIcon className="size-3.5" />}
                      {chip}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSweets((s) => !s)}
                  aria-pressed={sweets}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm transition-colors",
                    sweets ? "border-rose-500 bg-rose-500 text-white" : "hover:bg-muted",
                  )}
                >
                  <CandyIcon className="size-3.5" />
                  Sweets
                </button>
              </div>
            )}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={today ? "e.g. eggs and toast, a smoothie" : "e.g. fish with rice and some salad, a couple of cookies after dinner"}
              rows={3}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => (onSkip ? onSkip() : onOpenChange(false))} disabled={saving}>
                {today ? "Cancel" : "Skip today"}
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Working it out…" : today ? "Add" : "Save"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
