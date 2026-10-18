"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, PlusIcon, ShoppingCartIcon, TrashIcon, UtensilsCrossedIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ProtocolChart, type NutritionDay } from "@/app/_components/protocol-chart";
import { MealPlan } from "@/app/_components/meal-plan";
import { RuleImage } from "@/app/_components/rule-image";
import { PROTOCOL_RULES, dateKey, isOnProtocol, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

interface Meal {
  id: number;
  name: string;
  notes: string | null;
  felt_good: boolean;
  eaten_date: string;
  created_at: string;
}

interface Staple {
  id: number;
  name: string;
  why: string | null;
  image_url: string | null;
}

interface Principle {
  id: number;
  content: string;
  tags: string[] | null;
  created_at: string;
}

interface ListSummary {
  id: number;
  name: string;
}

const GROCERY_LIST_NAME = "Groceries";
const HISTORY_DAYS = 14;

function dayLabel(iso: string) {
  const key = dateKey(iso);
  if (key === todayISO()) return "Today";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function NutritionPanel() {
  const [days, setDays] = useState<NutritionDay[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [staples, setStaples] = useState<Staple[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [groceryListId, setGroceryListId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMeal, setNewMeal] = useState("");
  const [newStaple, setNewStaple] = useState("");
  const [showAllPrinciples, setShowAllPrinciples] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const today = todayISO();

  const load = useCallback(async () => {
    try {
      const [d, m, s, p, l] = await Promise.all([
        fetch("/api/nutrition/days"),
        fetch("/api/nutrition/meals"),
        fetch("/api/nutrition/staples"),
        fetch("/api/nutrition/principles"),
        fetch("/api/lists"),
      ]);
      if (d.ok) setDays(await d.json());
      if (m.ok) setMeals(await m.json());
      if (s.ok) setStaples(await s.json());
      if (p.ok) setPrinciples(await p.json());
      if (l.ok) {
        const lists: ListSummary[] = await l.json();
        setGroceryListId(lists.find((x) => x.name.toLowerCase() === GROCERY_LIST_NAME.toLowerCase())?.id ?? null);
      }
    } catch {
      // leave the panel as-is; the next poll retries
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayRules = useMemo(
    () => days.find((d) => dateKey(d.logged_date) === today)?.rules ?? [],
    [days, today],
  );

  const toggleRule = async (key: string) => {
    const next = todayRules.includes(key) ? todayRules.filter((r) => r !== key) : [...todayRules, key];
    const prev = days;
    setDays((ds) => {
      const rest = ds.filter((d) => dateKey(d.logged_date) !== today);
      return [{ logged_date: today, rules: next, note: null }, ...rest];
    });
    try {
      const res = await fetch("/api/nutrition/days", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logged_date: today, rules: next }),
      });
      if (!res.ok) throw new Error();
      if (isOnProtocol(next) && !isOnProtocol(todayRules)) toast.success("Today's on protocol.");
    } catch {
      setDays(prev);
      toast.error("Couldn't save that.");
    }
  };

  const logMeal = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetch("/api/nutrition/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error();
      const row: Meal = await res.json();
      setMeals((ms) => [row, ...ms]);
      setNewMeal("");
    } catch {
      toast.error("Couldn't log that meal.");
    }
  };

  const deleteMeal = async (id: number) => {
    const prev = meals;
    setMeals((ms) => ms.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/nutrition/meals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMeals(prev);
      toast.error("Couldn't remove that meal.");
    }
  };

  const addStaple = async () => {
    const name = newStaple.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/nutrition/staples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const row: Staple = await res.json();
      setStaples((ss) => (ss.some((s) => s.id === row.id) ? ss : [...ss, row]));
      setNewStaple("");
      generateStapleImage(row.id);
    } catch {
      toast.error("Couldn't add that staple.");
    }
  };

  // A staple without a photo gets one made for it. Fire-and-forget: the shelf is
  // usable without the picture, so a failed generation is a missing image, not an
  // error the user has to deal with.
  const generateStapleImage = async (id: number) => {
    setGeneratingId(id);
    try {
      const res = await fetch(`/api/nutrition/staples/${id}/image`, { method: "POST" });
      if (!res.ok) return;
      const row: Staple = await res.json();
      setStaples((ss) => ss.map((s) => (s.id === row.id ? { ...s, image_url: row.image_url } : s)));
    } catch {
      // no image, no problem
    } finally {
      setGeneratingId((cur) => (cur === id ? null : cur));
    }
  };

  const removeStaple = async (id: number) => {
    const prev = staples;
    setStaples((ss) => ss.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/nutrition/staples/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setStaples(prev);
      toast.error("Couldn't remove that staple.");
    }
  };

  // The staples shelf is the standing record of what works; the Groceries list
  // in Lists stays the actual shopping list. This is the one-way bridge.
  const addToGroceries = async (name: string) => {
    if (!groceryListId) {
      toast.error(`No "${GROCERY_LIST_NAME}" list to add to.`);
      return;
    }
    try {
      const res = await fetch(`/api/lists/${groceryListId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} → Groceries`);
    } catch {
      toast.error("Couldn't add to Groceries.");
    }
  };

  // Quick-add buttons are just the meals logged most often — the shortcuts
  // build themselves out of what actually gets eaten.
  const favourites = useMemo(() => {
    const counts = new Map<string, { name: string; n: number; last: number }>();
    for (const m of meals) {
      const key = m.name.toLowerCase();
      const at = new Date(m.created_at).getTime();
      const cur = counts.get(key);
      if (cur) counts.set(key, { ...cur, n: cur.n + 1, last: Math.max(cur.last, at) });
      else counts.set(key, { name: m.name, n: 1, last: at });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 8);
  }, [meals]);

  const mealsByDay = useMemo(() => {
    const groups = new Map<string, Meal[]>();
    for (const m of meals) {
      const key = dateKey(m.eaten_date);
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, HISTORY_DAYS);
  }, [meals]);

  const shownPrinciples = showAllPrinciples ? principles : principles.slice(0, 6);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProtocolChart days={days} />

      <MealPlan />

      {/* Today's protocol */}
      <section>
        <h2 className="text-sm font-semibold mb-2">Today</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROTOCOL_RULES.map((rule) => {
            const on = todayRules.includes(rule.key);
            return (
              <button
                key={rule.key}
                type="button"
                onClick={() => toggleRule(rule.key)}
                className={cn(
                  "flex gap-2.5 rounded-lg border p-3 text-left transition-colors",
                  on ? "border-emerald-500/60 bg-emerald-500/10" : "border-border hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
                  )}
                >
                  {on && <CheckIcon className="size-3" />}
                </span>
                <RuleImage ruleKey={rule.key} className="size-11" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight">{rule.label}</span>
                  <span className="block text-xs text-muted-foreground leading-snug mt-0.5">{rule.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Meal log */}
      <section>
        <h2 className="text-sm font-semibold mb-2">Meals that felt good</h2>
        {favourites.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {favourites.map((f) => (
              <Button
                key={f.name}
                size="sm"
                variant="outline"
                className="h-7 gap-1 rounded-full px-2.5 text-xs"
                onClick={() => logMeal(f.name)}
              >
                <PlusIcon className="size-3" />
                {f.name}
                {f.n > 1 && <span className="text-muted-foreground">×{f.n}</span>}
              </Button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            logMeal(newMeal);
          }}
        >
          <Input
            value={newMeal}
            onChange={(e) => setNewMeal(e.target.value)}
            placeholder="What did you eat that worked?"
            className="h-9"
          />
          <Button type="submit" size="sm" className="h-9" disabled={!newMeal.trim()}>
            Log
          </Button>
        </form>

        {mealsByDay.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Nothing logged yet. Log a meal once and it becomes a one-tap button.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {mealsByDay.map(([date, rows]) => (
              <div key={date}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{dayLabel(date)}</p>
                <ul className="space-y-1">
                  {rows.map((m) => (
                    <li
                      key={m.id}
                      className="group flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
                    >
                      <UtensilsCrossedIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                      {m.notes && <span className="truncate text-xs text-muted-foreground">{m.notes}</span>}
                      <button
                        type="button"
                        onClick={() => deleteMeal(m.id)}
                        className="text-muted-foreground/60 hover:text-destructive"
                        aria-label={`Remove ${m.name}`}
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Staples shelf */}
      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Energy staples</h2>
          <p className="text-xs text-muted-foreground">Tap the cart to send one to Groceries</p>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {staples.map((s) => (
            <div key={s.id} className="group flex items-start gap-2 rounded-lg border border-border px-2.5 py-2">
              {s.image_url ? (
                <Image
                  src={s.image_url}
                  alt=""
                  width={88}
                  height={88}
                  className="size-11 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded bg-muted">
                  {generatingId === s.id && <Spinner className="size-3.5" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{s.name}</p>
                {s.why && <p className="text-xs text-muted-foreground leading-snug mt-0.5">{s.why}</p>}
              </div>
              <button
                type="button"
                onClick={() => addToGroceries(s.name)}
                className="mt-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Add ${s.name} to Groceries`}
                title="Add to Groceries"
              >
                <ShoppingCartIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeStaple(s.id)}
                className="mt-0.5 text-muted-foreground/60 hover:text-destructive"
                aria-label={`Remove ${s.name}`}
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addStaple();
          }}
        >
          <Input
            value={newStaple}
            onChange={(e) => setNewStaple(e.target.value)}
            placeholder="Add a food that works"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!newStaple.trim()}>
            Add
          </Button>
        </form>
      </section>

      {/* Food principles — read straight out of tagged thoughts */}
      <section className="pb-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Food principles</h2>
          <p className="text-xs text-muted-foreground">From your notes</p>
        </div>
        <ul className="space-y-1.5">
          {shownPrinciples.map((p) => (
            <li key={p.id} className="rounded-lg border border-border px-3 py-2">
              <p className="text-sm leading-snug whitespace-pre-wrap">{p.content}</p>
              {p.tags && p.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.tags.slice(0, 5).map((t) => (
                    <Badge key={t} variant="secondary" className="h-4 px-1.5 text-xs font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {principles.length > 6 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => setShowAllPrinciples((v) => !v)}
          >
            {showAllPrinciples ? "Show fewer" : `Show all ${principles.length}`}
          </Button>
        )}
      </section>
    </div>
  );
}
