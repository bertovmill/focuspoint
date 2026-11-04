"use client";

import { useEffect, useState } from "react";
import { CandyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/nutrition";
import type { CheckinResult } from "@/lib/yesterday-meals";
import { cn } from "@/lib/utils";

// The first time Cael opens each day it asks "what did you eat yesterday?".
// Six chips (his most-logged meals, so they drift with how he actually eats),
// a sweets flag, and a plain-text box for the real answer. One save writes
// rough meals for yesterday and comes back with a one-line verdict.
// Dismissal is remembered per day in localStorage; a day that already has
// meals logged never asks.

const KEY_PREFIX = "cael.yesterday-checkin.";

interface Week {
  logged: number;
  avg_protein_g: number;
  avg_kcal: number;
}

interface Loaded {
  date: string;
  logged: boolean;
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

export function YesterdayCheckin() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sweets, setSweets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = KEY_PREFIX + todayISO();
    if (typeof window === "undefined" || window.localStorage.getItem(key)) return;
    let cancelled = false;
    fetch("/api/nutrition/yesterday")
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
        body: JSON.stringify({ text: parts.join(". "), sweets }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
      setSaved((await res.json()) as Saved);
      window.localStorage.setItem(KEY_PREFIX + todayISO(), "1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent id="yesterday-checkin" className="max-w-md">
        {saved ? (
          <>
            <DialogHeader>
              <DialogTitle>Yesterday, roughly</DialogTitle>
              <DialogDescription>Ballpark numbers, not a calorie count.</DialogDescription>
            </DialogHeader>
            <div className={cn("rounded-lg px-3 py-2 text-sm font-medium", VERDICT_STYLE[saved.verdict])}>
              {VERDICT_LABEL[saved.verdict]} · {saved.note}
            </div>
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
            {saved.week.logged > 1 && (
              <p className="text-xs text-muted-foreground">
                Last {saved.week.logged} logged days: ~{saved.week.avg_protein_g}g protein, ~{saved.week.avg_kcal} kcal a day.
              </p>
            )}
            <Button onClick={() => setOpen(false)} className="w-full">
              Done
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>What did you eat yesterday?</DialogTitle>
              <DialogDescription>Tap what fits, then say the rest in your own words.</DialogDescription>
            </DialogHeader>
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
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. fish with rice and some salad, a couple of cookies after dinner"
              rows={3}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={dismiss} disabled={saving}>
                Skip today
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Working it out…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
