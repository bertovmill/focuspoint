"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_PROTEIN_TARGET_G, dateKey, isOnProtocol, todayISO, type MealSlot } from "@/lib/nutrition";

export interface MealRec {
  id: number;
  meal_date: string;
  slot: MealSlot;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  feedback: "up" | "down" | null;
  protein_g: number | null;
  kcal: number | null;
  ingredients: string[];
  recipe_id: number | null;
}

export interface LoggedMeal {
  id: number;
  name: string;
  slot: string | null;
  eaten_date: string;
  protein_g?: number | string | null;
  kcal?: number | string | null;
}

/**
 * Today's nutrition state, shared by the full block on the Nutrition screen and
 * the compact strip pinned to the Tasks board: which protocol rules are ticked,
 * what is planned for each sitting, and which sittings have actually been
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
  const [proteinTarget, setProteinTarget] = useState(DEFAULT_PROTEIN_TARGET_G);

  const load = useCallback(async () => {
    try {
      const [d, p, m, t] = await Promise.all([
        fetch("/api/nutrition/days?days=2"),
        fetch("/api/nutrition/plan"),
        fetch("/api/nutrition/meals?limit=60"),
        fetch("/api/nutrition/target"),
      ]);
      if (t.ok) {
        const { target_g } = (await t.json()) as { target_g?: number };
        if (target_g) setProteinTarget(target_g);
      }
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

  /**
   * Ticking a sitting logs the suggested dish into the meal log, carrying its
   * protein and calories so the ring counts it; unticking removes it.
   */
  const toggleAte = useCallback(
    async (slot: MealSlot, rec: { name: string; protein_g?: number | null; kcal?: number | null }) => {
      const name = rec.name;
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
          body: JSON.stringify({ name, slot, protein_g: rec.protein_g ?? null, kcal: rec.kcal ?? null }),
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

  /** Rotates a bank meal into `slot`; with no slot, fills whatever today is missing. */
  const suggest = useCallback(
    async (slot?: MealSlot) => {
      setBusySlot(slot ?? "all");
      try {
        const res = await fetch("/api/nutrition/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slot ? { slot } : {}),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
        const fresh = await fetch("/api/nutrition/plan");
        if (fresh.ok) setPlan(await fresh.json());
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : "Couldn't pick from the bank.");
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

  /** Grams of protein eaten today — only meals that carry a number count. */
  const proteinToday = useMemo(
    () => Math.round(logged.reduce((sum, l) => sum + (Number(l.protein_g) || 0), 0)),
    [logged],
  );

  return {
    today,
    rules,
    plan,
    bySlot,
    eatenSlots,
    loading,
    busySlot,
    proteinToday,
    proteinTarget,
    toggleRule,
    toggleAte,
    setFeedback,
    suggest,
    reload: load,
  };
}
