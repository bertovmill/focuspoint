"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  ShuffleIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MarkdownDoc } from "@/app/_components/markdown-doc";
import { ProteinRing } from "@/app/_components/protein-ring";
import { RecipePicker, type CustomMeal } from "@/app/_components/recipe-picker";
import type { GroceryItem, PlannedMeal, Recipe } from "@/lib/nutrition-plan";
import {
  DEFAULT_PROTEIN_TARGET_G,
  ALL_SLOTS,
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
type Logged = { id: number; name: string; slot: string | null; eaten_date: string; protein_g: number | string | null };
const key = (date: string, slot: string) => `${date}:${slot}`;
/** Where a drag starts or lands. A day pill on the phone strip has no slot of its own. */
type Spot = { date: string; slot?: string };

/**
 * /meals — the week: seven days by three sittings, every one a meal from the
 * bank (no generated dishes). Ticking a sitting logs it as eaten
 * (nutrition_meals) and moves the protein ring. Under the grid: a Notion-style
 * Notes page and the meal bank itself. Cells are the same
 * meal_recommendations rows the Today cards and the Tasks strip read.
 */
export function WeekPlanPanel() {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => weekStartISO(today));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  // Phones show one day at a time; swiping moves it, crossing into the next or
  // previous week at the ends.
  const [selected, setSelected] = useState(today);
  const goTo = (date: string) => {
    setSelected(date);
    setWeekStart(weekStartISO(date));
  };
  const shiftWeek = (n: number) => goTo(addDaysISO(selected, 7 * n));
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [cells, setCells] = useState<Cells>(new Map());
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [target, setTarget] = useState(DEFAULT_PROTEIN_TARGET_G);
  const [eaten, setEaten] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [ate, setAte] = useState<Map<string, Logged>>(new Map());
  const [filling, setFilling] = useState(false);
  // Days where the optional snack row is open on phones before anything is in it.
  const [snackOpen, setSnackOpen] = useState<Set<string>>(new Set());
  const [groceriesOpen, setGroceriesOpen] = useState(false);
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
      const [p, r, t, m] = await Promise.all([
        fetch(`/api/nutrition/plan?from=${days[0]}&to=${days[6]}`),
        fetch("/api/nutrition/recipes"),
        fetch("/api/nutrition/target"),
        fetch(`/api/nutrition/meals?from=${days[0]}&to=${days[6]}`),
      ]);
      if (p.ok) {
        const rows = (await p.json()) as PlannedMeal[];
        setCells(new Map(rows.map((row) => [key(row.meal_date, row.slot), row])));
      }
      if (m.ok) {
        const rows = (await m.json()) as Logged[];
        setAte(new Map(rows.filter((l) => l.slot).map((l) => [key(l.eaten_date, l.slot!), l])));
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

  /** Swaps a sitting for another bank meal — whichever has come up least lately. */
  const rotate = async (date: string, slot: string) => {
    const k = key(date, slot);
    setBusyCell(k, true);
    try {
      const res = await fetch("/api/nutrition/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      putCell(data as PlannedMeal);
      await relog(data as PlannedMeal);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't swap that.");
    } finally {
      setBusyCell(k, false);
    }
  };

  // ── eaten ticks ───────────────────────────────────────────────────────
  // A tick is a nutrition_meals row for that date and sitting, carrying the
  // meal's protein so the ring counts it.

  const shiftRing = (date: string, grams: number | string | null | undefined) => {
    if (date === today) setEaten((e) => Math.max(0, e + (Number(grams) || 0)));
  };

  const logEaten = async (cell: PlannedMeal) => {
    const k = key(cell.meal_date, cell.slot);
    const res = await fetch("/api/nutrition/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: cell.name,
        slot: cell.slot,
        eaten_date: cell.meal_date,
        protein_g: cell.protein_g,
        kcal: cell.kcal,
      }),
    });
    if (!res.ok) throw new Error();
    const row = (await res.json()) as Logged;
    setAte((prev) => new Map(prev).set(k, { ...row, eaten_date: cell.meal_date }));
    shiftRing(cell.meal_date, cell.protein_g);
  };

  const unlogEaten = async (date: string, slot: string) => {
    const k = key(date, slot);
    const prev = ate.get(k);
    if (!prev) return;
    setAte((m) => {
      const next = new Map(m);
      next.delete(k);
      return next;
    });
    shiftRing(date, -(Number(prev.protein_g) || 0));
    const res = await fetch(`/api/nutrition/meals/${prev.id}`, { method: "DELETE" });
    if (!res.ok) {
      setAte((m) => new Map(m).set(k, prev));
      shiftRing(date, prev.protein_g);
      throw new Error();
    }
  };

  const toggleEaten = async (date: string, slot: string) => {
    const cell = cells.get(key(date, slot));
    try {
      if (ate.has(key(date, slot))) await unlogEaten(date, slot);
      else if (cell) await logEaten(cell);
    } catch {
      toast.error("Couldn't save that.");
    }
  };

  /** After a swap, an eaten sitting's log follows the new meal. */
  const relog = async (cell: PlannedMeal) => {
    if (!ate.has(key(cell.meal_date, cell.slot))) return;
    try {
      await unlogEaten(cell.meal_date, cell.slot);
      await logEaten(cell);
    } catch {
      toast.error("Couldn't update the log.");
    }
  };

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
      const row = (await res.json()) as PlannedMeal;
      putCell(row);
      return row;
    } catch {
      toast.error("Couldn't save that.");
      return null;
    } finally {
      setBusyCell(k, false);
    }
  };

  const clearCell = async (date: string, slot: string) => {
    const prev = cells.get(key(date, slot));
    if (ate.has(key(date, slot))) await unlogEaten(date, slot).catch(() => {});
    dropCell(date, slot);
    try {
      const res = await fetch(`/api/nutrition/plan?date=${date}&slot=${slot}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      if (prev) putCell(prev);
      toast.error("Couldn't clear that.");
    }
  };

  // ── drag to rearrange ─────────────────────────────────────────────────
  // Berto (2026-10-04): hold and drag to rearrange meals. Same feel as /training:
  // mouse after 6px, press-and-hold 250 ms on a phone so scrolling and the card's
  // buttons still work. Dropping on a filled sitting swaps the two; on the phone
  // strip, dropping on a day moves it to the same sitting that day.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [dragging, setDragging] = useState<PlannedMeal | null>(null);
  // A drag's finger-lift must not also count as a day swipe.
  const dragged = useRef(false);

  const moveMeal = async (from: { date: string; slot: string }, to: { date: string; slot: string }) => {
    const kf = key(from.date, from.slot);
    const kt = key(to.date, to.slot);
    if (kf === kt) return;
    const a = cells.get(kf);
    if (!a) return;
    const b = cells.get(kt);
    const la = ate.get(kf);
    const lb = ate.get(kt);
    const prevCells = cells;
    const prevAte = ate;

    // Optimistic: the meals trade places, and each "ate it" tick goes with its meal.
    setCells((prev) => {
      const next = new Map(prev);
      next.delete(kf);
      next.delete(kt);
      next.set(kt, { ...a, meal_date: to.date, slot: to.slot });
      if (b) next.set(kf, { ...b, meal_date: from.date, slot: from.slot });
      return next;
    });
    setAte((prev) => {
      const next = new Map(prev);
      next.delete(kf);
      next.delete(kt);
      if (la) next.set(kt, { ...la, eaten_date: to.date, slot: to.slot });
      if (lb) next.set(kf, { ...lb, eaten_date: from.date, slot: from.slot });
      return next;
    });
    const ring = (sign: 1 | -1) => {
      if (from.date === to.date) return;
      if (la) {
        shiftRing(from.date, -sign * (Number(la.protein_g) || 0));
        shiftRing(to.date, sign * (Number(la.protein_g) || 0));
      }
      if (lb) {
        shiftRing(to.date, -sign * (Number(lb.protein_g) || 0));
        shiftRing(from.date, sign * (Number(lb.protein_g) || 0));
      }
    };
    ring(1);

    try {
      const res = await fetch("/api/nutrition/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error();
      if (from.date !== to.date) toast.success(`${a.name} moved to ${shortDayLabel(to.date)}`);
    } catch {
      setCells(prevCells);
      setAte(prevAte);
      ring(-1);
      toast.error("Couldn't move that.");
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    dragged.current = true;
    const from = e.active.data.current as Spot | undefined;
    setDragging(from?.slot ? (cells.get(key(from.date, from.slot)) ?? null) : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const from = e.active.data.current as Spot | undefined;
    const over = e.over?.data.current as Spot | undefined;
    if (!from?.slot || !over) return;
    void moveMeal({ date: from.date, slot: from.slot }, { date: over.date, slot: over.slot ?? from.slot });
  };
  const dndProps = {
    sensors,
    // Only what's under the finger counts — the hidden layout's cells have no size.
    collisionDetection: pointerWithin,
    onDragStart,
    onDragEnd,
    onDragCancel: () => setDragging(null),
  };
  const overlay = (
    <DragOverlay>
      {dragging && (
        <div className="rotate-1 rounded-md bg-background shadow-xl">
          <PlanCell
            date={dragging.meal_date}
            slot={dragging.slot}
            cell={dragging}
            busy={false}
            past={false}
            today={false}
            eaten={false}
            onPick={() => {}}
            onRotate={() => {}}
            onToggleEaten={() => {}}
            onClear={() => {}}
            onSave={() => {}}
          />
        </div>
      )}
    </DragOverlay>
  );

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
      toast.success(`${cell.name} added to the meal bank.`);
    } catch {
      toast.error("Couldn't add that to the bank.");
    }
  };

  /** Sets the picked cell, then logs it as eaten when the picker says so. */
  const placeAndLog = async (t: { date: string; slot: string }, body: Record<string, unknown>, eatIt: boolean) => {
    const row = await setCell(t.date, t.slot, body);
    if (!row) return;
    try {
      if (ate.has(key(t.date, t.slot))) {
        await unlogEaten(t.date, t.slot);
        if (eatIt) await logEaten(row);
      } else if (eatIt) await logEaten(row);
    } catch {
      toast.error("Couldn't log that.");
    }
  };

  const onPickRecipe = async (recipe: Recipe, eatIt: boolean) => {
    if (!picker) return;
    const t = picker;
    setPicker(null);
    await placeAndLog(t, { recipe_id: recipe.id }, eatIt);
  };

  // A meal that isn't in the bank yet goes into the bank first, so every
  // planned sitting is a bank meal.
  const onCustom = async (meal: CustomMeal, eatIt: boolean) => {
    if (!picker) return;
    const t = picker;
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
      if (!res.ok) throw new Error();
      const recipe = (await res.json()) as Recipe;
      setRecipes((rs) => [...rs, recipe].sort((a, b) => a.name.localeCompare(b.name)));
      setPicker(null);
      await placeAndLog(t, { recipe_id: recipe.id }, eatIt);
    } catch {
      toast.error("Couldn't add that to the bank.");
    }
  };

  // ── week actions ──────────────────────────────────────────────────────

  /** Every empty cell from today forward, filled by rotating through the bank. */
  const fillWeek = async () => {
    const targets = days
      .filter((d) => d >= today)
      .flatMap((d) => MEAL_SLOTS.filter((s) => !cells.has(key(d, s.key))).map((s) => ({ date: d, slot: s.key })));
    if (targets.length === 0) {
      toast.message("Nothing to fill — every cell from today on is planned.");
      return;
    }
    setFilling(true);
    try {
      const res = await fetch("/api/nutrition/plan/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells: targets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      const { filled, skipped } = data as { filled: PlannedMeal[]; skipped: number };
      setCells((prev) => {
        const next = new Map(prev);
        for (const row of filled) next.set(key(row.meal_date, row.slot), row);
        return next;
      });
      toast.success(
        `Filled ${filled.length} sitting${filled.length === 1 ? "" : "s"} from the bank${skipped ? ` (${skipped} had nothing tagged for that sitting)` : ""}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't fill the week.");
    } finally {
      setFilling(false);
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
      toast.error("Couldn't remove that from the bank.");
    }
  };

  // ── derived ───────────────────────────────────────────────────────────

  const plannedByDay = useMemo(() => {
    const m = new Map<string, { protein: number; kcal: number; n: number }>();
    for (const d of days) {
      let protein = 0;
      let kcal = 0;
      let n = 0;
      for (const s of ALL_SLOTS) {
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
        <div className="ml-auto flex items-center gap-1.5 md:gap-1">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="tap-target rounded-lg border p-2.5 text-muted-foreground hover:text-foreground md:rounded-md md:p-1.5"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="size-5 md:size-3.5" />
          </button>
          <span className="min-w-32 text-center text-base font-medium tabular-nums md:min-w-28 md:text-xs md:font-normal">
            {weekRangeLabel(weekStart)}
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="tap-target rounded-lg border p-2.5 text-muted-foreground hover:text-foreground md:rounded-md md:p-1.5"
            aria-label="Next week"
          >
            <ChevronRightIcon className="size-5 md:size-3.5" />
          </button>
          {!isCurrentWeek && (
            <Button size="sm" variant="ghost" className="h-10 text-sm md:h-7 md:text-xs" onClick={() => goTo(today)}>
              Today
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
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:text-xs"
                title="Change the daily target"
              >
                <PencilIcon className="size-3" />
                {target} g target
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground md:text-xs">
            {eaten >= target
              ? "Target cleared. Nice."
              : `${Math.max(0, Math.round(target - eaten))} g to go`}
          </p>
          {plannedToday && plannedToday.n > 0 && (
            <p className="text-sm tabular-nums text-muted-foreground md:text-xs">
              Planned <span className="font-medium text-foreground">{plannedToday.protein} g</span>
              {plannedToday.kcal > 0 && ` · ${plannedToday.kcal} kcal`}
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 text-sm md:h-8 md:gap-1 md:text-xs"
            disabled={filling || emptyAhead === 0 || recipes.length === 0}
            onClick={fillWeek}
            title={
              recipes.length === 0
                ? "Add meals to the bank first"
                : emptyAhead === 0
                  ? "Every cell from today on is planned"
                  : `Fill ${emptyAhead} empty cell${emptyAhead === 1 ? "" : "s"} from the bank`
            }
          >
            {filling ? <Spinner className="size-3" /> : <ShuffleIcon className="size-3" />}
            Fill week from bank
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-sm md:h-8 md:gap-1 md:text-xs" onClick={() => setGroceriesOpen(true)}>
            <ShoppingCartIcon className="size-3" />
            Grocery list
          </Button>
        </div>
      </section>

      {/* Week grid — days across on wide screens. Meals drag between any two cells. */}
      <DndContext {...dndProps}>
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
          {ALL_SLOTS.map((slot) => (
            <div key={slot.key} className="contents">
              <div className="flex items-start pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {slot.label}
              </div>
              {days.map((d) => (
                <MealDnd key={key(d, slot.key)} date={d} slot={slot.key} filled={cells.has(key(d, slot.key))}>
                  <PlanCell
                    date={d}
                    slot={slot.key}
                    compact={slot.key === "snack"}
                    cell={cells.get(key(d, slot.key))}
                    busy={busy.has(key(d, slot.key))}
                    past={d < today}
                    today={d === today}
                    eaten={ate.has(key(d, slot.key))}
                    onPick={() => setPicker({ date: d, slot: slot.key })}
                    onRotate={() => rotate(d, slot.key)}
                    onToggleEaten={() => toggleEaten(d, slot.key)}
                    onClear={() => clearCell(d, slot.key)}
                    onSave={saveToLibrary}
                  />
                </MealDnd>
              ))}
            </div>
          ))}
          <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protein</div>
          {days.map((d) => (
            <DayTotal key={d} total={plannedByDay.get(d)} target={target} past={d < today} />
          ))}
        </div>
      </section>
      {overlay}
      </DndContext>

      {/* Phones — one day at a time: tap a day, or swipe left/right. Hold a meal
          to drag it to another sitting, or onto a day in the strip. */}
      <DndContext {...dndProps}>
      <section
        className="space-y-3 md:hidden"
        onTouchStart={(e) => {
          const t = e.touches[0];
          swipe.current = { x: t.clientX, y: t.clientY };
          dragged.current = false;
        }}
        onTouchEnd={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || dragged.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          // A clear sideways swipe only, so scrolling the page never flips the day.
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          goTo(addDaysISO(selected, dx < 0 ? 1 : -1));
        }}
      >
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const [yy, mm, dd] = d.split("-").map(Number);
            const weekday = new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { weekday: "short" });
            const n = ALL_SLOTS.filter((s) => cells.has(key(d, s.key))).length;
            const on = d === selected;
            return (
              <DayDrop key={d} date={d} active={!!dragging && d !== selected}>
                <button
                  type="button"
                  onClick={() => setSelected(d)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5",
                    on ? "bg-foreground text-background" : d === today ? "border border-foreground/40" : "text-muted-foreground",
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase">{weekday.slice(0, 2)}</span>
                  <span className="text-base font-medium tabular-nums">{dd}</span>
                  <span className={cn("size-1 rounded-full", n > 0 ? (on ? "bg-background" : "bg-foreground/50") : "bg-transparent")} />
                </button>
              </DayDrop>
            );
          })}
        </div>
        {days.filter((d) => d === selected).map((d) => {
          const t = plannedByDay.get(d);
          return (
            <div key={d} className={cn("rounded-lg border", d === today && "border-foreground/40")}>
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className={cn("text-sm font-semibold uppercase tracking-wide", d < today && "text-muted-foreground/60")}>
                  {shortDayLabel(d)}
                  {d === today && <span className="ml-1.5 font-normal normal-case text-muted-foreground">today</span>}
                </span>
                {t && t.n > 0 && (
                  <span className={cn("text-sm tabular-nums", t.protein >= target ? "text-emerald-600" : "text-muted-foreground")}>
                    {t.protein} g{t.kcal > 0 && ` · ${t.kcal} kcal`}
                  </span>
                )}
              </div>
              <div className="grid gap-2 p-2">
                {(cells.has(key(d, "snack")) || snackOpen.has(d) ? ALL_SLOTS : MEAL_SLOTS).map((slot) => (
                  <div key={slot.key} className="grid grid-cols-[60px_1fr] items-stretch gap-2">
                    <div className="pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{slot.label}</div>
                    <MealDnd date={d} slot={slot.key} filled={cells.has(key(d, slot.key))}>
                      <PlanCell
                        date={d}
                        slot={slot.key}
                        cell={cells.get(key(d, slot.key))}
                        busy={busy.has(key(d, slot.key))}
                        past={d < today}
                        today={d === today}
                        eaten={ate.has(key(d, slot.key))}
                        onPick={() => setPicker({ date: d, slot: slot.key })}
                        onRotate={() => rotate(d, slot.key)}
                        onToggleEaten={() => toggleEaten(d, slot.key)}
                        onClear={() => clearCell(d, slot.key)}
                        onSave={saveToLibrary}
                      />
                    </MealDnd>
                  </div>
                ))}
                {!cells.has(key(d, "snack")) && !snackOpen.has(d) && (
                  <button
                    type="button"
                    onClick={() => setSnackOpen((prev) => new Set(prev).add(d))}
                    className="tap-target ml-[68px] flex items-center gap-1 justify-self-start rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <PlusIcon className="size-3.5" />
                    Snack
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {overlay}
      </DndContext>

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

      <GroceryListDialog open={groceriesOpen} onOpenChange={setGroceriesOpen} from={days[0]} to={days[6]} />

      <RecipeLibrary
        recipes={recipes}
        onAdd={(r) => setRecipes((rs) => [...rs, r].sort((a, b) => a.name.localeCompare(b.name)))}
        onUpdate={(r) => {
          setRecipes((rs) => rs.map((x) => (x.id === r.id ? r : x)));
          setCells((prev) => {
            const next = new Map(prev);
            for (const [k, c] of next) if (c.recipe_id === r.id) next.set(k, { ...c, image_url: r.image_url });
            return next;
          });
        }}
        onDelete={deleteRecipe}
      />

      <RecipePicker
        target={picker}
        recipes={recipes}
        eatenDefault={
          !!picker &&
          (picker.date <= today || ate.has(key(picker.date, picker.slot)))
        }
        onClose={() => setPicker(null)}
        onPick={onPickRecipe}
        onCustom={onCustom}
      />
    </div>
  );
}

/**
 * One sitting as both a drop target and — when it holds a meal — something to
 * pick up. The cell stays in place, faded, while its copy follows the finger.
 */
function MealDnd({ date, slot, filled, children }: { date: string; slot: string; filled: boolean; children: React.ReactNode }) {
  const id = key(date, slot);
  const data: Spot = { date, slot };
  const drag = useDraggable({ id, data, disabled: !filled });
  const drop = useDroppable({ id, data });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...(filled ? { ...drag.attributes, ...drag.listeners } : {})}
      className={cn(
        // Fills its grid cell so the card inside keeps the row's height.
        "flex min-w-0 flex-col rounded-md [&>*]:flex-1",
        // No text selection or iOS callout on the press-and-hold that starts a drag.
        filled && "select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none",
        drag.isDragging && "opacity-30",
        drop.isOver && !drag.isDragging && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}

/** A day in the phone strip as a drop target: the meal goes to the same sitting that day. */
function DayDrop({ date, active, children }: { date: string; active: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } satisfies Spot, disabled: !active });
  return (
    <div ref={setNodeRef} className={cn("rounded-lg transition-transform", isOver && "scale-110 ring-2 ring-foreground/60")}>
      {children}
    </div>
  );
}

function PlanCell({
  cell,
  busy,
  past,
  today,
  eaten,
  compact = false,
  onPick,
  onRotate,
  onToggleEaten,
  onClear,
  onSave,
}: {
  date: string;
  slot: string;
  cell: PlannedMeal | undefined;
  busy: boolean;
  past: boolean;
  today: boolean;
  eaten: boolean;
  /** The optional snack row on wide screens: a slim + until there's one. */
  compact?: boolean;
  onPick: () => void;
  onRotate: () => void;
  onToggleEaten: () => void;
  onClear: () => void;
  onSave: (cell: PlannedMeal) => void;
}) {
  const loggable = past || today;
  if (!cell) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-1 rounded-md border border-dashed",
          compact ? "min-h-9" : "min-h-[60px] md:min-h-[76px]",
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
              aria-label={loggable ? "Pick or log a meal" : "Pick a meal"}
              title={loggable ? "Pick a bank meal (and log it as eaten)" : "Pick a meal from the bank"}
            >
              <PlusIcon className="size-4 md:size-3.5" />
            </button>
            {!compact && <button
              type="button"
              onClick={onRotate}
              className="tap-target rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Rotate one in"
              title="Rotate in a bank meal you haven't had lately"
            >
              <ShuffleIcon className="size-4 md:size-3.5" />
            </button>}
          </>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative flex min-h-[76px] flex-col rounded-md border p-2",
        eaten ? "border-emerald-500/60 bg-emerald-500/5" : today ? "border-foreground/30" : "border-border",
        past && !eaten && "opacity-60",
        busy && "opacity-50",
      )}
    >
      {/* The photo is what he recognises first: a thumbnail beside the name on
          phones, a strip across the top of the cell on the week grid. */}
      <div className="flex flex-1 gap-2.5 md:flex-col md:gap-1.5">
        {cell.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cell.image_url}
            alt=""
            className="size-14 shrink-0 rounded object-cover md:h-14 md:w-full"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="line-clamp-2 text-sm font-medium leading-snug md:text-xs" title={cell.description ?? cell.name}>
            {cell.name}
          </p>
          <p className="mt-auto pt-1 text-xs tabular-nums text-muted-foreground md:text-[11px]">
            {cell.protein_g !== null ? <span className="font-medium text-foreground">{cell.protein_g} g</span> : "? g"}
            {cell.kcal !== null && ` · ${cell.kcal} kcal`}
          </p>
        </div>
      </div>
      <div className="relative -mx-1 -mb-1 mt-1 flex items-center gap-0.5">
        {loggable && (
          <button
            type="button"
            onClick={onToggleEaten}
            className={cn(
              "tap-target mr-0.5 flex items-center gap-1 rounded px-1 py-0.5 text-xs md:text-[11px]",
              eaten ? "text-emerald-600" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={eaten}
            aria-label={eaten ? "Eaten — tap to un-log" : "Mark as eaten"}
            title={eaten ? "Logged as eaten (tap to undo)" : "Ate it — log it and count the protein"}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded border md:size-3.5",
                eaten ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50",
              )}
            >
              {eaten && <CheckIcon className="size-2.5" />}
            </span>
            {eaten ? "Ate" : null}
          </button>
        )}
        <button type="button" onClick={onPick} className="tap-target rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Swap" title="Swap for another bank meal">
          <RefreshCwIcon className="size-4 md:size-3" />
        </button>
        <button type="button" onClick={onRotate} disabled={busy} className="tap-target rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Rotate" title="Rotate in a different bank meal">
          {busy ? <Spinner className="size-3" /> : <ShuffleIcon className="size-4 md:size-3" />}
        </button>
        {!cell.recipe_id && (
          <button
            type="button"
            onClick={() => onSave(cell)}
            className="tap-target rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Add to the meal bank"
            title="Not in the bank — add it"
          >
            <BookmarkIcon className="size-4 md:size-3" />
          </button>
        )}
        <button type="button" onClick={onClear} className="tap-target ml-auto rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remove this meal" title="Remove this meal (a two-meal day)">
          <XIcon className="size-4 md:size-3" />
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
  onUpdate,
  onDelete,
}: {
  recipes: Recipe[];
  onAdd: (r: Recipe) => void;
  onUpdate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name: name.trim(), protein_g: protein || null, kcal: kcal || null, ingredients }),
      });
      if (!res.ok) throw new Error();
      onAdd((await res.json()) as Recipe);
      setName("");
      setProtein("");
      setKcal("");
      setIngredients("");
      setOpen(false);
    } catch {
      toast.error("Couldn't add that meal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="meal-bank" className="scroll-mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Meal bank</h2>
          <p className="text-xs text-muted-foreground">
            {recipes.length === 0
              ? "Every planned meal comes from here. Add the meals you eat on repeat."
              : `${recipes.length} meal${recipes.length === 1 ? "" : "s"} · pick any into a cell with +, or fill the week from them`}
          </p>
        </div>
        <Button size="sm" variant={open ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => setOpen((v) => !v)}>
          <PlusIcon className="size-3" />
          Add meal
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_110px_90px]">
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="number" inputMode="decimal" min={0} placeholder="Protein g" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <Input type="number" inputMode="numeric" min={0} placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          <textarea
            className="min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm sm:col-span-3"
            placeholder="Ingredients, one per line — these become the grocery list"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving || !name.trim()}>
              {saving ? <Spinner className="size-3" /> : "Add to bank"}
            </Button>
          </div>
        </form>
      )}

      {recipes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpenId(r.id)}
              className="flex w-full min-w-0 items-center gap-3 rounded-md border p-2 text-left hover:bg-muted/60"
            >
              {r.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image_url} alt="" className="size-14 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <ImageIcon className="size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">
                  {r.protein_g !== null ? `${r.protein_g} g protein` : "protein ?"}
                  {r.kcal !== null && ` · ${r.kcal} kcal`}
                  {r.ingredients.length > 0 && ` · ${r.ingredients.length} ingredients`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <MealDetail
        recipe={recipes.find((r) => r.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        onUpdate={onUpdate}
        onDelete={(r) => {
          setOpenId(null);
          onDelete(r);
        }}
      />
    </section>
  );
}

/**
 * One bank meal, opened: the photo (generate or redo it), the numbers, his
 * notes, and the ingredients to buy for it — the grocery list is built from
 * these, so they're editable right here.
 */
function MealDetail({
  recipe,
  onClose,
  onUpdate,
  onDelete,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onUpdate: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [recipe?.id]);

  const startEditing = () => {
    if (!recipe) return;
    setDraft(recipe.ingredients.join("\n"));
    setEditing(true);
  };

  const saveIngredients = async () => {
    if (!recipe) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: draft }),
      });
      if (!res.ok) throw new Error();
      onUpdate((await res.json()) as Recipe);
      setEditing(false);
    } catch {
      toast.error("Couldn't save the ingredients.");
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!recipe) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipe.id}/image`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      onUpdate(data as Recipe);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't make a picture.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={!!recipe} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md gap-3 overflow-y-auto">
        {recipe && (
          <>
            <div className="relative -mx-1 overflow-hidden rounded-md bg-muted">
              {recipe.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.image_url} alt={recipe.name} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-8" />
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-2 right-2 h-8 gap-1.5 text-xs shadow-sm"
                disabled={generating}
                onClick={generate}
              >
                {generating ? <Spinner className="size-3" /> : <ImageIcon className="size-3" />}
                {generating ? "Making a picture…" : recipe.image_url ? "New picture" : "Generate picture"}
              </Button>
            </div>
            <DialogHeader>
              <DialogTitle className="text-lg leading-snug">{recipe.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm tabular-nums text-muted-foreground">
              {recipe.protein_g !== null ? (
                <span className="font-medium text-foreground">{recipe.protein_g} g protein</span>
              ) : (
                "protein ?"
              )}
              {recipe.kcal !== null && ` · ${recipe.kcal} kcal`}
            </p>
            {recipe.description && <p className="text-sm text-foreground/80">{recipe.description}</p>}
            <div id="meal-ingredients">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingredients</h3>
                {!editing && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={startEditing}>
                    <PencilIcon className="size-3" />
                    Edit
                  </Button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    className="min-h-40 w-full rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
                    placeholder="One per line — these become the grocery list"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-8 text-xs" disabled={saving} onClick={saveIngredients}>
                      {saving ? <Spinner className="size-3" /> : "Save"}
                    </Button>
                  </div>
                </div>
              ) : recipe.ingredients.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {recipe.ingredients.map((ing) => (
                    <li key={ing} className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-foreground/40" />
                      {ing}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No ingredients listed.</p>
              )}
            </div>
            <div className="flex justify-end border-t pt-3">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(recipe)}
              >
                <TrashIcon className="size-3.5" />
                Remove from bank
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The week's grocery list, built from each planned meal's ingredients (no AI).
 * Each item notes which meals need it; "Send to Groceries" copies the lot onto
 * the Groceries list in Lists for ticking off in the store. Opens on
 * /meals#grocery-list so the view can be linked to directly.
 */
function GroceryListDialog({
  open,
  onOpenChange,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
}) {
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [sending, setSending] = useState(false);

  // #grocery-list ⇄ open, so the list has its own address.
  useEffect(() => {
    if (window.location.hash === "#grocery-list") onOpenChange(true);
  }, [onOpenChange]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const want = open ? "#grocery-list" : "";
    if (url.hash !== want && (open || url.hash === "#grocery-list")) {
      url.hash = want;
      window.history.replaceState(null, "", url);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    fetch(`/api/nutrition/groceries?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: GroceryItem[]) => setItems(rows))
      .catch(() => {
        setItems([]);
        toast.error("Couldn't build the grocery list.");
      });
  }, [open, from, to]);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/nutrition/groceries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) throw new Error();
      const { added, skipped } = (await res.json()) as { added: string[]; skipped: number };
      toast.success(
        `${added.length} item${added.length === 1 ? "" : "s"} → Groceries${skipped ? ` (${skipped} already there)` : ""}`,
      );
    } catch {
      toast.error("Couldn't send to Groceries.");
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!items?.length) return;
    try {
      await navigator.clipboard.writeText(items.map((i) => `- ${i.name}`).join("\n"));
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Grocery list</DialogTitle>
          <DialogDescription>
            {weekRangeLabel(from)} · from each meal&apos;s ingredients in the meal bank
          </DialogDescription>
        </DialogHeader>
        {items === null ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing to buy yet — plan some meals, and make sure each one has ingredients in the meal bank.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.name} className="py-2">
                <div className="text-sm font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.meals.map((m) => (m.times > 1 ? `${m.name} ×${m.times}` : m.name)).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!!items?.length && (
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={copy}>
              Copy
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={sending} onClick={send}>
              {sending ? <Spinner className="size-3" /> : <ShoppingCartIcon className="size-3" />}
              Send to Groceries
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
