"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { dateKey, isOnProtocol, todayISO, type MealSlot } from "@/lib/nutrition";

export interface MealRec {
  id: number;
  meal_date: string;
  slot: MealSlot;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  feedback: "up" | "down" | null;
}

export interface LoggedMeal {
  id: number;
  name: string;
  slot: string | null;
  eaten_date: string;
}

/**
 * Today's nutrition state, shared by the full block on the Nutrition screen and
 * the compact strip pinned to the Tasks board: which protocol rules are ticked,
 * what Cael suggested for each sitting, and which sittings have actually been
 * eaten. Both views act on the same rows, so whichever one you're looking at is
 * the one you can tick things off in.
 */
export function useNutritionToday() {
  const today = todayISO();
  const [rules, setRules] = useState<string[]>([]);
  const [plan, setPlan] = useState<MealRec[]>([]);
  const [logged, setLogged] = useState<LoggedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p, m] = await Promise.all([
        fetch("/api/nutrition/days?days=2"),
        fetch("/api/nutrition/plan"),
        fetch("/api/nutrition/meals?limit=60"),
      ]);
      if (d.ok) {
        const rows: { logged_date: string; rules: string[] }[] = await d.json();
        setRules(rows.find((r) => dateKey(r.logged_date) === today)?.rules ?? []);
      }
      if (p.ok) setPlan(await p.json());
      if (m.ok) {
        const rows: LoggedMeal[] = await m.json();
        setLogged(rows.filter((r) => dateKey(r.eaten_date) === today));
      }
    } catch {
      // leave what's on screen; the next mount retries
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRule = useCallback(
    async (key: string) => {
      const next = rules.includes(key) ? rules.filter((r) => r !== key) : [...rules, key];
      const prev = rules;
      setRules(next);
      try {
        const res = await fetch("/api/nutrition/days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logged_date: today, rules: next }),
        });
        if (!res.ok) throw new Error();
        if (isOnProtocol(next) && !isOnProtocol(prev)) toast.success("Today's on protocol.");
      } catch {
        setRules(prev);
        toast.error("Couldn't save that.");
      }
    },
    [rules, today],
  );

  /** Ticking a sitting logs the suggested dish into the meal log; unticking removes it. */
  const toggleAte = useCallback(
    async (slot: MealSlot, name: string) => {
      const existing = logged.find((l) => l.slot === slot);
      if (existing) {
        const prev = logged;
        setLogged((ls) => ls.filter((l) => l.id !== existing.id));
        try {
          const res = await fetch(`/api/nutrition/meals/${existing.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
        } catch {
          setLogged(prev);
          toast.error("Couldn't undo that.");
        }
        return;
      }
      try {
        const res = await fetch("/api/nutrition/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slot }),
        });
        if (!res.ok) throw new Error();
        const row = (await res.json()) as LoggedMeal;
        setLogged((ls) => [row, ...ls]);
      } catch {
        toast.error("Couldn't log that meal.");
      }
    },
    [logged],
  );

  const setFeedback = useCallback(
    async (rec: MealRec, value: "up" | "down") => {
      const next = rec.feedback === value ? null : value;
      const prev = plan;
      setPlan((ps) => ps.map((p) => (p.id === rec.id ? { ...p, feedback: next } : p)));
      try {
        const res = await fetch(`/api/meals/${rec.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: next }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setPlan(prev);
        toast.error("Couldn't save feedback.");
      }
    },
    [plan],
  );

  /** Asks for a fresh suggestion. `slot` omitted fills in whatever's missing. */
  const suggest = useCallback(
    async (slot?: MealSlot) => {
      setBusySlot(slot ?? "all");
      try {
        const res = await fetch("/api/nutrition/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slot ? { slot } : {}),
        });
        if (!res.ok) throw new Error();
        const fresh = await fetch("/api/nutrition/plan");
        if (fresh.ok) setPlan(await fresh.json());
      } catch {
        toast.error("Couldn't get a suggestion — the model may be busy.");
      } finally {
        setBusySlot(null);
      }
    },
    [],
  );

  const bySlot = useMemo(() => {
    const map = new Map<string, MealRec>();
    for (const p of plan) map.set(p.slot, p);
    return map;
  }, [plan]);

  const eatenSlots = useMemo(() => new Set(logged.map((l) => l.slot).filter(Boolean) as string[]), [logged]);

  return { today, rules, plan, bySlot, eatenSlots, loading, busySlot, toggleRule, toggleAte, setFeedback, suggest, reload: load };
}
