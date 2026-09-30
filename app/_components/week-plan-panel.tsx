"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MarkdownDoc } from "@/app/_components/markdown-doc";
import { ProteinRing } from "@/app/_components/protein-ring";
import { RecipePicker, type CustomMeal } from "@/app/_components/recipe-picker";
import type { PlannedMeal, Recipe } from "@/lib/nutrition-plan";
import {
  DEFAULT_PROTEIN_TARGET_G,
  MEAL_SLOTS,
  addDaysISO,
  shortDayLabel,
  todayISO,
  weekDates,
  weekRangeLabel,
  weekStartISO,
} from "@/lib/nutrition";
import { cn } from "@/lib/utils";

type Cells = Map<string, PlannedMeal>;
const key = (date: string, slot: string) => `${date}:${slot}`;
type FillStatus = { running: boolean; total: number; done: number; failed: number };

/**
 * /meals — the week: seven days by three sittings, the protein ring
 * for today, a Notion-style Notes page and the recipe library underneath, and
 * one button that turns the week's ingredients into the Groceries list. Cells are the same
 * meal_recommendations rows the Today cards and the Tasks strip read.
 */
export function WeekPlanPanel() {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const [cells, setCells] = useState<Cells>(new Map());
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [target, setTarget] = useState(DEFAULT_PROTEIN_TARGET_G);
  const [eaten, setEaten] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null);
  const [sendingGroceries, setSendingGroceries] = useState(false);
  const [picker, setPicker] = useState<{ date: string; slot: string } | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState("");

  const setBusyCell = (k: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  const load = useCallback(async () => {
    try {
      const [p, r, t] = await Promise.all([
        fetch(`/api/nutrition/plan?from=${days[0]}&to=${days[6]}`),
        fetch("/api/nutrition/recipes"),
        fetch("/api/nutrition/target"),
      ]);
      if (p.ok) {
        const rows = (await p.json()) as PlannedMeal[];
        setCells(new Map(rows.map((row) => [key(row.meal_date, row.slot), row])));
      }
      if (r.ok) setRecipes(await r.json());
      if (t.ok) {
        const data = (await t.json()) as { target_g: number; eaten_g: number };
        setTarget(data.target_g);
        setEaten(data.eaten_g);
      }
    } catch {
      // leave what's on screen
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const putCell = (row: PlannedMeal) => setCells((prev) => new Map(prev).set(key(row.meal_date, row.slot), row));
  const dropCell = (date: string, slot: string) =>
    setCells((prev) => {
      const next = new Map(prev);
      next.delete(key(date, slot));
      return next;
    });

  // ── cell actions ──────────────────────────────────────────────────────

  const suggest = useCallback(
    async (date: string, slot: string, quiet = false) => {
      const k = key(date, slot);
      setBusyCell(k, true);
      try {
        const res = await fetch("/api/nutrition/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, slot, with_image: date === today }),
        });
        if (!res.ok) throw new Error();
        putCell((await res.json()) as PlannedMeal);
        return true;
      } catch {
        if (!quiet) toast.error("Couldn't get a suggestion — the model may be busy.");
        return false;
      } finally {
        setBusyCell(k, false);
      }
    },
    [today],
  );

  const setCell = async (date: string, slot: string, body: Record<string, unknown>) => {
    const k = key(date, slot);
    setBusyCell(k, true);
    try {
      const res = await fetch("/api/nutrition/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot, ...body }),
      });
      if (!res.ok) throw new Error();
      putCell((await res.json()) as PlannedMeal);
      return true;
    } catch {
      toast.error("Couldn't save that.");
      return false;
    } finally {
      setBusyCell(k, false);
    }
  };

  const clearCell = async (date: string, slot: string) => {
    const prev = cells.get(key(date, slot));
    dropCell(date, slot);
    try {
      const res = await fetch(`/api/nutrition/plan?date=${date}&slot=${slot}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      if (prev) putCell(prev);
      toast.error("Couldn't clear that.");
    }
  };

  const saveToLibrary = async (cell: PlannedMeal) => {
    try {
      const res = await fetch("/api/nutrition/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cell.name,
          description: cell.description,
          slot: cell.slot,
          protein_g: cell.protein_g,
          kcal: cell.kcal,
          ingredients: cell.ingredients,
          image_url: cell.image_url,
        }),
      });
      if (!res.ok) throw new Error();
      const recipe = (await res.json()) as Recipe;
      setRecipes((rs) => [...rs, recipe].sort((a, b) => a.name.localeCompare(b.name)));
      putCell({ ...cell, recipe_id: recipe.id });
      // Link the cell back so the bookmark shows filled; a failure here is cosmetic.
      fetch("/api/nutrition/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: cell.meal_date, slot: cell.slot, recipe_id: recipe.id }),
      }).catch(() => {});
      toast.success(`${cell.name} saved to the library.`);
    } catch {
      toast.error("Couldn't save that recipe.");
    }
  };

  const onPickRecipe = async (recipe: Recipe) => {
    if (!picker) return;
    const t = picker;
    setPicker(null);
    await setCell(t.date, t.slot, { recipe_id: recipe.id });
  };

  const onCustom = async (meal: CustomMeal) => {
    if (!picker) return;
    const t = picker;
    setPicker(null);
    let recipe_id: number | null = null;
    if (meal.save) {
      try {
        const res = await fetch("/api/nutrition/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: meal.name,
            slot: t.slot,
            protein_g: meal.protein_g,
            kcal: meal.kcal,
            ingredients: meal.ingredients,
          }),
        });
        if (res.ok) {
          const recipe = (await res.json()) as Recipe;
          recipe_id = recipe.id;
          setRecipes((rs) => [...rs, recipe].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        // fall through: the cell is still set, just unlinked
      }
    }
    await setCell(t.date, t.slot, {
      name: meal.name,
      protein_g: meal.protein_g,
      kcal: meal.kcal,
      ingredients: meal.ingredients,
      recipe_id,
    });
  };

  const onSuggestFromPicker = async () => {
    if (!picker) return;
    const t = picker;
    const ok = await suggest(t.date, t.slot);
    if (ok) setPicker(null);
  };

  // ── week actions ──────────────────────────────────────────────────────

  /**
   * Every empty cell from today forward. The server fills them in the
   * background (three at a time), so leaving the page doesn't stop it; the
   * grid polls for progress while a run is going.
   */
  const fillWeek = async () => {
    const targets = days
      .filter((d) => d >= today)
      .flatMap((d) => MEAL_SLOTS.filter((s) => !cells.has(key(d, s.key))).map((s) => ({ date: d, slot: s.key })));
    if (targets.length === 0) {
      toast.message("Nothing to fill — every cell from today on is planned.");
      return;
    }
    try {
      const res = await fetch("/api/nutrition/plan/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells: targets, today }),
      });
      const job = (await res.json()) as FillStatus;
      if (!res.ok && res.status !== 409) throw new Error();
      setFill({ done: job.done, total: job.total });
      toast.message("Planning the week in the background — you can leave this page.");
    } catch {
      toast.error("Couldn't start filling the week.");
    }
  };

  const refreshPlan = useCallback(async () => {
    const p = await fetch(`/api/nutrition/plan?from=${days[0]}&to=${days[6]}`).catch(() => null);
    if (!p?.ok) return;
    const rows = (await p.json()) as PlannedMeal[];
    setCells(new Map(rows.map((row) => [key(row.meal_date, row.slot), row])));
  }, [days]);

  // Pick up a run that was started earlier (another visit, another device).
  useEffect(() => {
    fetch("/api/nutrition/plan/fill")
      .then((r) => (r.ok ? r.json() : null))
      .then((job: FillStatus | null) => {
        if (job?.running) setFill({ done: job.done, total: job.total });
      })
      .catch(() => {});
  }, []);

  // While a run is going, poll its progress and pull in the cells it has filled.
  const filling = fill !== null;
  useEffect(() => {
    if (!filling) return;
    const id = setInterval(async () => {
      const job = (await fetch("/api/nutrition/plan/fill")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as FillStatus | null;
      await refreshPlan();
      if (job?.running) {
        setFill({ done: job.done, total: job.total });
        return;
      }
      setFill(null);
      if (job?.failed) toast.error(`${job.failed} cell${job.failed === 1 ? "" : "s"} didn't fill — try again.`);
      else toast.success("Week planned.");
    }, 3000);
    return () => clearInterval(id);
  }, [filling, refreshPlan]);

  const sendGroceries = async () => {
    setSendingGroceries(true);
    try {
      const res = await fetch("/api/nutrition/groceries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: days[0], to: days[6] }),
      });
      if (!res.ok) throw new Error();
      const { added, skipped } = (await res.json()) as { added: string[]; skipped: number };
      if (added.length === 0 && skipped === 0) toast.message("No ingredients on this week's plan yet.");
      else
        toast.success(
          `${added.length} item${added.length === 1 ? "" : "s"} → Groceries${skipped ? ` (${skipped} already there)` : ""}`,
        );
    } catch {
      toast.error("Couldn't build the grocery list.");
    } finally {
      setSendingGroceries(false);
    }
  };

  const saveTarget = async () => {
    const n = Number(targetDraft);
    setEditingTarget(false);
    if (!Number.isFinite(n) || n <= 0 || n === target) return;
    const prev = target;
    setTarget(n);
    try {
      const res = await fetch("/api/nutrition/target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_g: n }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTarget(prev);
      toast.error("Couldn't save the target.");
    }
  };

  const deleteRecipe = async (r: Recipe) => {
    const prev = recipes;
    setRecipes((rs) => rs.filter((x) => x.id !== r.id));
    try {
      const res = await fetch(`/api/nutrition/recipes/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCells((prev) => {
        const next = new Map(prev);
        for (const [k, c] of next) if (c.recipe_id === r.id) next.set(k, { ...c, recipe_id: null });
        return next;
      });
    } catch {
      setRecipes(prev);
      toast.error("Couldn't delete that recipe.");
    }
  };

  // ── derived ───────────────────────────────────────────────────────────

  const plannedByDay = useMemo(() => {
    const m = new Map<string, { protein: number; kcal: number; n: number }>();
    for (const d of days) {
      let protein = 0;
      let kcal = 0;
      let n = 0;
      for (const s of MEAL_SLOTS) {
        const c = cells.get(key(d, s.key));
        if (!c) continue;
        n++;
        protein += c.protein_g ?? 0;
        kcal += c.kcal ?? 0;
      }
      m.set(d, { protein: Math.round(protein), kcal: Math.round(kcal), n });
    }
    return m;
  }, [cells, days]);

  const plannedToday = plannedByDay.get(today);
  const isCurrentWeek = weekStart === weekStartISO(today);
  const emptyAhead = days.filter((d) => d >= today).reduce((n, d) => n + MEAL_SLOTS.filter((s) => !cells.has(key(d, s.key))).length, 0);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Meals</h1>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
            className="tap-target rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <span className="min-w-28 text-center text-xs tabular-nums">{weekRangeLabel(weekStart)}</span>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
            className="tap-target rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
          {!isCurrentWeek && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setWeekStart(weekStartISO(today))}>
              This week
            </Button>
          )}
        </div>
      </div>

      {/* Protein + week actions */}
      <section className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
        <ProteinRing eaten={eaten} target={target} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            Protein today
            {editingTarget ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveTarget();
                }}
              >
                <Input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  className="h-7 w-20 text-xs"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={saveTarget}
                />
                <span className="text-xs text-muted-foreground">g target</span>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTargetDraft(String(target));
                  setEditingTarget(true);
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Change the daily target"
              >
                <PencilIcon className="size-3" />
                {target} g target
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {eaten >= target
              ? "Target cleared. Nice."
              : `${Math.max(0, Math.round(target - eaten))} g to go. Tick a sitting on the Nutrition screen or the Tasks board to count it.`}
          </p>
          {plannedToday && plannedToday.n > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              Planned today: <span className="font-medium text-foreground">{plannedToday.protein} g</span>
              {plannedToday.kcal > 0 && ` · ${plannedToday.kcal} kcal`}
              {plannedToday.protein < target && ` — ${target - plannedToday.protein} g short of target`}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={fill !== null || emptyAhead === 0}
            onClick={fillWeek}
            title={emptyAhead === 0 ? "Every cell from today on is planned" : `Fill ${emptyAhead} empty cell${emptyAhead === 1 ? "" : "s"}`}
          >
            {fill ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
            {fill ? `Planning ${fill.done}/${fill.total}…` : "Fill week with Cael"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={sendingGroceries} onClick={sendGroceries}>
            {sendingGroceries ? <Spinner className="size-3" /> : <ShoppingCartIcon className="size-3" />}
            Week → Groceries
          </Button>
        </div>
      </section>

      {/* Week grid — days across on wide screens */}
      <section className="hidden md:block">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1.5">
          <div />
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                "rounded-md px-1 py-1 text-center text-xs font-semibold uppercase tracking-wide",
                d === today ? "bg-foreground text-background" : d < today ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              {shortDayLabel(d)}
            </div>
          ))}
          {MEAL_SLOTS.map((slot) => (
            <div key={slot.key} className="contents">
              <div className="flex items-start pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {slot.label}
              </div>
              {days.map((d) => (
                <PlanCell
                  key={key(d, slot.key)}
                  date={d}
                  slot={slot.key}
                  cell={cells.get(key(d, slot.key))}
                  busy={busy.has(key(d, slot.key))}
                  past={d < today}
                  today={d === today}
                  onPick={() => setPicker({ date: d, slot: slot.key })}
                  onSuggest={() => suggest(d, slot.key)}
                  onClear={() => clearCell(d, slot.key)}
                  onSave={saveToLibrary}
                />
              ))}
            </div>
          ))}
          <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protein</div>
          {days.map((d) => (
            <DayTotal key={d} total={plannedByDay.get(d)} target={target} past={d < today} />
          ))}
        </div>
      </section>

      {/* Week — stacked on phones */}
      <section className="space-y-3 md:hidden">
        {days.map((d) => {
          const t = plannedByDay.get(d);
          return (
            <div key={d} className={cn("rounded-lg border", d === today && "border-foreground/40")}>
              <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                <span className={cn("text-xs font-semibold uppercase tracking-wide", d < today && "text-muted-foreground/60")}>
                  {shortDayLabel(d)}
                  {d === today && <span className="ml-1.5 font-normal normal-case text-muted-foreground">today</span>}
                </span>
                {t && t.n > 0 && (
                  <span className={cn("text-xs tabular-nums", t.protein >= target ? "text-emerald-600" : "text-muted-foreground")}>
                    {t.protein} g{t.kcal > 0 && ` · ${t.kcal} kcal`}
                  </span>
                )}
              </div>
              <div className="grid gap-1.5 p-1.5">
                {MEAL_SLOTS.map((slot) => (
                  <div key={slot.key} className="grid grid-cols-[52px_1fr] items-stretch gap-1.5">
                    <div className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{slot.label}</div>
                    <PlanCell
                      date={d}
                      slot={slot.key}
                      cell={cells.get(key(d, slot.key))}
                      busy={busy.has(key(d, slot.key))}
                      past={d < today}
                      today={d === today}
                      onPick={() => setPicker({ date: d, slot: slot.key })}
                      onSuggest={() => suggest(d, slot.key)}
                      onClear={() => clearCell(d, slot.key)}
                      onSave={saveToLibrary}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Notes — his Notion-style page for what isn't tied to one week: the
          typical grocery list, staples, go-to meals (lib/meal-notes.ts). */}
      <MarkdownDoc
        id="meal-notes"
        endpoint="/api/meals/notes"
        heading={
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Notes</h2>
            <p className="text-xs text-muted-foreground">
              Typical grocery list, staples, go-to meals — anything not tied to one week. Cael reads it when planning.
            </p>
          </div>
        }
        placeholder="Typical grocery list, staples, go-to meals… Type '/' for headings, checklists, toggles."
      />

      <RecipeLibrary recipes={recipes} onAdd={(r) => setRecipes((rs) => [...rs, r].sort((a, b) => a.name.localeCompare(b.name)))} onDelete={deleteRecipe} />

      <RecipePicker
        target={picker}
        recipes={recipes}
        suggesting={!!picker && busy.has(key(picker.date, picker.slot))}
        onClose={() => setPicker(null)}
        onPick={onPickRecipe}
        onSuggest={onSuggestFromPicker}
        onCustom={onCustom}
      />
    </div>
  );
}

function PlanCell({
  cell,
  busy,
  past,
  today,
  onPick,
  onSuggest,
  onClear,
  onSave,
}: {
  date: string;
  slot: string;
  cell: PlannedMeal | undefined;
  busy: boolean;
  past: boolean;
  today: boolean;
  onPick: () => void;
  onSuggest: () => void;
  onClear: () => void;
  onSave: (cell: PlannedMeal) => void;
}) {
  if (!cell) {
    return (
      <div
        className={cn(
          "flex min-h-[76px] items-center justify-center gap-1 rounded-md border border-dashed",
          today ? "border-foreground/30" : "border-border",
          past && "opacity-50",
        )}
      >
        {busy ? (
          <Spinner className="size-3.5" />
        ) : (
          <>
            <button
              type="button"
              onClick={onPick}
              className="tap-target rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Pick a meal"
              title="Pick from the library or type one in"
            >
              <PlusIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onSuggest}
              className="tap-target rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Ask Cael"
              title="Ask Cael for an idea"
            >
              <SparklesIcon className="size-3.5" />
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative flex min-h-[76px] flex-col rounded-md border p-2",
        today ? "border-foreground/30" : "border-border",
        past && "opacity-60",
        busy && "opacity-50",
      )}
    >
      {cell.image_url && (
        <div
          className="absolute inset-0 rounded-md bg-cover bg-center opacity-15"
          style={{ backgroundImage: `url(${cell.image_url})` }}
          aria-hidden
        />
      )}
      <p className="relative line-clamp-2 text-xs font-medium leading-snug" title={cell.description ?? cell.name}>
        {cell.name}
      </p>
      <p className="relative mt-auto pt-1 text-[11px] tabular-nums text-muted-foreground">
        {cell.protein_g !== null ? <span className="font-medium text-foreground">{cell.protein_g} g</span> : "? g"}
        {cell.kcal !== null && ` · ${cell.kcal} kcal`}
      </p>
      <div className="relative -mx-1 -mb-1 mt-1 flex items-center gap-0.5">
        <button type="button" onClick={onPick} className="tap-target rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Swap" title="Swap for another">
          <RefreshCwIcon className="size-3" />
        </button>
        <button type="button" onClick={onSuggest} disabled={busy} className="tap-target rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Ask Cael" title="Ask Cael for a different one">
          {busy ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
        </button>
        <button
          type="button"
          onClick={() => !cell.recipe_id && onSave(cell)}
          disabled={!!cell.recipe_id}
          className={cn("tap-target rounded p-1", cell.recipe_id ? "text-emerald-600" : "text-muted-foreground hover:text-foreground")}
          aria-label={cell.recipe_id ? "In the library" : "Save to library"}
          title={cell.recipe_id ? "In the recipe library" : "Save to the recipe library"}
        >
          <BookmarkIcon className={cn("size-3", cell.recipe_id && "fill-current")} />
        </button>
        <button type="button" onClick={onClear} className="tap-target ml-auto rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Clear" title="Clear this cell">
          <XIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

function DayTotal({ total, target, past }: { total?: { protein: number; kcal: number; n: number }; target: number; past: boolean }) {
  if (!total || total.n === 0) return <div className="pt-1 text-center text-xs text-muted-foreground/50">—</div>;
  const pct = Math.min(1, total.protein / target);
  return (
    <div className={cn("space-y-1 pt-1", past && "opacity-60")}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct >= 1 ? "bg-emerald-500" : "bg-foreground/70")} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className={cn("text-center text-[11px] tabular-nums", pct >= 1 ? "text-emerald-600" : "text-muted-foreground")}>
        {total.protein} g{total.kcal > 0 && ` · ${total.kcal}`}
      </p>
    </div>
  );
}

function RecipeLibrary({
  recipes,
  onAdd,
  onDelete,
}: {
  recipes: Recipe[];
  onAdd: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<string>("dinner");
  const [protein, setProtein] = useState("");
  const [kcal, setKcal] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slot, protein_g: protein || null, kcal: kcal || null, ingredients }),
      });
      if (!res.ok) throw new Error();
      onAdd((await res.json()) as Recipe);
      setName("");
      setProtein("");
      setKcal("");
      setIngredients("");
      setOpen(false);
    } catch {
      toast.error("Couldn't save that recipe.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Recipe library</h2>
          <p className="text-xs text-muted-foreground">
            {recipes.length === 0
              ? "Meals you can drop into any cell. Bookmark a suggestion above, or add one here."
              : `${recipes.length} saved · pick any into a cell with +`}
          </p>
        </div>
        <Button size="sm" variant={open ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setOpen((v) => !v)}>
          <PlusIcon className="size-3" />
          Add recipe
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_110px_100px_90px]">
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            aria-label="Sitting"
          >
            {MEAL_SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <Input type="number" inputMode="decimal" min={0} placeholder="Protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <Input type="number" inputMode="numeric" min={0} placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          <textarea
            className="min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm sm:col-span-4"
            placeholder="Ingredients, one per line — these become the grocery list"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
          <div className="flex justify-end gap-2 sm:col-span-4">
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving || !name.trim()}>
              {saving ? <Spinner className="size-3" /> : "Save recipe"}
            </Button>
          </div>
        </form>
      )}

      {recipes.length > 0 && (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {r.slot && <span className="uppercase tracking-wide">{r.slot} · </span>}
                  {r.protein_g !== null ? `${r.protein_g} g protein` : "protein ?"}
                  {r.kcal !== null && ` · ${r.kcal} kcal`}
                </p>
                {r.ingredients.length > 0 && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" title={r.ingredients.join(", ")}>
                    {r.ingredients.join(", ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(r)}
                className="tap-target shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${r.name}`}
                title="Delete"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
