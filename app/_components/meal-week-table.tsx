"use client";

import { useMemo, useRef, useState } from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";
import { CheckIcon, PlusIcon, SearchIcon, ShuffleIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IngredientMultiSelect } from "@/app/_components/ingredient-multi-select";
import type { PlannedMeal, Recipe } from "@/lib/nutrition-plan";
import { ALL_SLOTS, MEAL_SLOTS, shortDayLabel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

const key = (date: string, slot: string) => `${date}:${slot}`;

type Row = {
  id: string;
  date: string;
  slot: string;
  slotLabel: string;
  cell: PlannedMeal | undefined;
  /** The first sitting of its day carries the day label and the day's totals. */
  firstOfDay: boolean;
};

type Live = {
  today: string;
  target: number;
  ate: Set<string>;
  busy: Set<string>;
  ingredientsOf: (cell: PlannedMeal) => string[];
  options: string[];
  dayTotals: Map<string, { protein: number; kcal: number; n: number }>;
  onPick: (date: string, slot: string) => void;
  onRotate: (date: string, slot: string) => void;
  onToggleEaten: (date: string, slot: string) => void;
  onClear: (date: string, slot: string) => void;
  onIngredients: (cell: PlannedMeal, next: string[]) => void;
  onAddSnack: (date: string) => void;
  snackDays: Set<string>;
};

/**
 * /meals on wide screens — the week as a table: one row per sitting, grouped by
 * day. Ingredients are a multi-select over every ingredient in the bank; editing
 * them on a bank meal edits the bank entry, so every week it's planned (and the
 * grocery list) follows. Replaces the 7-column card grid (Berto, 2026-10-20).
 */
export function MealWeekTable({
  days,
  cells,
  recipes,
  snackOpen,
  ...rest
}: Omit<Live, "ingredientsOf" | "options" | "snackDays"> & {
  days: string[];
  cells: Map<string, PlannedMeal>;
  recipes: Recipe[];
  snackOpen: Set<string>;
}) {
  const [search, setSearch] = useState("");

  const recipeIngredients = useMemo(() => new Map(recipes.map((r) => [r.id, r.ingredients])), [recipes]);
  const ingredientsOf = (cell: PlannedMeal) =>
    (cell.recipe_id !== null && recipeIngredients.get(cell.recipe_id)) || cell.ingredients;

  // The shared list: every ingredient across the bank and this week's meals.
  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const list of [...recipes.map((r) => r.ingredients), ...[...cells.values()].map((c) => c.ingredients)])
      for (const i of list) if (!seen.has(i.toLowerCase())) seen.set(i.toLowerCase(), i);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [recipes, cells]);

  const data = useMemo<Row[]>(
    () =>
      days.flatMap((d) => {
        const slots = cells.has(key(d, "snack")) || snackOpen.has(d) ? ALL_SLOTS : MEAL_SLOTS;
        return slots.map((s, i) => ({
          id: key(d, s.key),
          date: d,
          slot: s.key,
          slotLabel: s.label,
          cell: cells.get(key(d, s.key)),
          firstOfDay: i === 0,
        }));
      }),
    [days, cells, snackOpen],
  );

  // Column defs stay stable so an open ingredient picker doesn't remount on
  // every save; cells read the current values from here.
  const live = useRef<Live>(null!);
  live.current = { ...rest, ingredientsOf, options, snackDays: new Set(data.filter((r) => r.slot === "snack").map((r) => r.date)) };

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "day",
        header: "Day",
        cell: ({ row }) => {
          const { date, firstOfDay } = row.original;
          if (!firstOfDay) return null;
          const { today, dayTotals, target, onAddSnack } = live.current;
          const t = dayTotals.get(date);
          const hasSnackRow = live.current.snackDays.has(date);
          return (
            <div className="space-y-0.5">
              <div
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  date === today ? "text-foreground" : date < today ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {shortDayLabel(date)}
                {date === today && <span className="ml-1.5 rounded bg-foreground px-1 py-px text-[10px] text-background">today</span>}
              </div>
              {t && t.n > 0 && (
                <div className={cn("text-[11px] tabular-nums", t.protein >= target ? "text-emerald-600" : "text-muted-foreground")}>
                  {t.protein} g{t.kcal > 0 && ` · ${t.kcal} kcal`}
                </div>
              )}
              {!hasSnackRow && (
                <button
                  type="button"
                  onClick={() => onAddSnack(date)}
                  className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70 hover:text-foreground"
                >
                  <PlusIcon className="size-3" />
                  Snack
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: "slot",
        header: "Sitting",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.slotLabel}</span>,
      },
      {
        id: "meal",
        header: "Meal",
        cell: ({ row }) => {
          const { date, slot, cell } = row.original;
          const { onPick, onRotate, busy } = live.current;
          if (busy.has(key(date, slot)) && !cell) return <Spinner className="size-3.5" />;
          if (!cell)
            return (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPick(date, slot)}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <PlusIcon className="size-3.5" />
                  Pick a meal
                </button>
                {slot !== "snack" && (
                  <button
                    type="button"
                    onClick={() => onRotate(date, slot)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    title="Rotate in a bank meal you haven't had lately"
                    aria-label="Rotate one in"
                  >
                    <ShuffleIcon className="size-3.5" />
                  </button>
                )}
              </div>
            );
          return (
            <button
              type="button"
              onClick={() => onPick(date, slot)}
              className="flex min-w-0 items-center gap-2 rounded text-left hover:opacity-80"
              title="Swap for another bank meal"
            >
              {cell.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cell.image_url} alt="" className="size-8 shrink-0 rounded object-cover" />
              )}
              <span className="line-clamp-2 text-sm font-medium leading-snug">{cell.name}</span>
            </button>
          );
        },
      },
      {
        id: "protein",
        header: () => <span className="block text-right">Protein</span>,
        cell: ({ row }) => {
          const c = row.original.cell;
          return (
            <span className="block text-right text-sm tabular-nums">
              {c ? (c.protein_g !== null ? `${c.protein_g} g` : "?") : ""}
            </span>
          );
        },
      },
      {
        id: "kcal",
        header: () => <span className="block text-right">kcal</span>,
        cell: ({ row }) => (
          <span className="block text-right text-sm tabular-nums text-muted-foreground">{row.original.cell?.kcal ?? ""}</span>
        ),
      },
      {
        id: "ingredients",
        header: "Ingredients",
        cell: ({ row }) => {
          const { cell, date, slot } = row.original;
          if (!cell) return null;
          const { ingredientsOf, options, onIngredients, busy } = live.current;
          return (
            <IngredientMultiSelect
              value={ingredientsOf(cell)}
              options={options}
              disabled={busy.has(key(date, slot))}
              onChange={(next) => onIngredients(cell, next)}
            />
          );
        },
      },
      {
        id: "ate",
        header: () => <span className="block text-center">Ate</span>,
        cell: ({ row }) => {
          const { cell, date, slot } = row.original;
          const { today, ate, onToggleEaten } = live.current;
          if (!cell || date > today) return null;
          const on = ate.has(key(date, slot));
          return (
            <button
              type="button"
              onClick={() => onToggleEaten(date, slot)}
              aria-pressed={on}
              aria-label={on ? "Eaten — click to un-log" : "Mark as eaten"}
              title={on ? "Logged as eaten (click to undo)" : "Ate it — log it and count the protein"}
              className={cn(
                "mx-auto flex size-5 items-center justify-center rounded border",
                on ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50 hover:border-foreground",
              )}
            >
              {on && <CheckIcon className="size-3" />}
            </button>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const { cell, date, slot } = row.original;
          if (!cell) return null;
          const { onRotate, onClear, busy } = live.current;
          const b = busy.has(key(date, slot));
          return (
            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onRotate(date, slot)}
                disabled={b}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Rotate"
                title="Rotate in a different bank meal"
              >
                {b ? <Spinner className="size-3.5" /> : <ShuffleIcon className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => onClear(date, slot)}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                aria-label="Remove this meal"
                title="Remove this meal"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Search matches the meal name or any of its ingredients.
    globalFilterFn: (row, _columnId, value: string) => {
      const q = value.trim().toLowerCase();
      if (!q) return true;
      const c = row.original.cell;
      if (!c) return false;
      return c.name.toLowerCase().includes(q) || live.current.ingredientsOf(c).some((i) => i.toLowerCase().includes(q));
    },
  });

  const rows = table.getRowModel().rows;
  const searching = search.trim().length > 0;

  return (
    <section id="week-table" className="space-y-2">
      <div className="relative max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search meals or ingredients"
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={cn(
                      "h-8 text-[11px] font-semibold uppercase tracking-wide",
                      h.column.id === "day" && "w-36",
                      h.column.id === "slot" && "w-20",
                      h.column.id === "meal" && "w-[26%]",
                      (h.column.id === "protein" || h.column.id === "kcal") && "w-20",
                      h.column.id === "ate" && "w-14",
                      h.column.id === "actions" && "w-20",
                    )}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                  No meals match “{search}”.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => {
                const r = row.original;
                const newDay = i > 0 && rows[i - 1].original.date !== r.date;
                const eaten = rest.ate.has(r.id);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "group/row align-top",
                      newDay && "border-t-2 border-t-border",
                      r.date === rest.today && "bg-muted/30",
                      r.date < rest.today && !eaten && "text-muted-foreground",
                      eaten && "bg-emerald-500/5",
                    )}
                  >
                    {row.getVisibleCells().map((c) => (
                      <TableCell key={c.id} className="py-1.5 align-middle whitespace-normal">
                        {/* While searching every row shows its day, since its siblings may be hidden. */}
                        {c.column.id === "day" && searching && !r.firstOfDay ? (
                          <span className="text-xs text-muted-foreground">{shortDayLabel(r.date)}</span>
                        ) : (
                          flexRender(c.column.columnDef.cell, c.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
