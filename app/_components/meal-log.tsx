"use client";

import { useEffect, useState } from "react";
import { ThumbsDownIcon, ThumbsUpIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { slotLabel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

type LoggedMeal = {
  id: number;
  name: string;
  notes: string | null;
  felt_good: boolean;
  slot: string | null;
  eaten_date: string;
};

const ANCHOR = "meal-log";
const field = "w-full rounded-md border bg-transparent px-2.5 py-2 text-base md:text-sm";

/**
 * /meals#meal-log — meals he actually ate, liked or not, with a note on why.
 * Same nutrition_meals rows the ticks on the week grid and Cael's log_meal tool
 * write; meals are logged by ticking a sitting on the grid, so this is the
 * history plus thumbs and notes. `version` bumps when the grid logs something.
 */
export function MealLog({ version = 0 }: { version?: number }) {
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [editing, setEditing] = useState<{ id: number; notes: string } | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/meals?limit=60")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LoggedMeal[]) => setMeals(rows.map((m) => ({ ...m, eaten_date: String(m.eaten_date).slice(0, 10) }))))
      .catch(() => setMeals([]));
  }, [version]);

  const patch = async (m: LoggedMeal, body: Partial<Pick<LoggedMeal, "felt_good" | "notes">>) => {
    const prev = meals;
    setMeals((ms) => ms?.map((x) => (x.id === m.id ? { ...x, ...body } : x)) ?? ms);
    try {
      const res = await fetch(`/api/nutrition/meals/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMeals(prev);
      toast.error("Couldn't save that.");
    }
  };

  const remove = async (m: LoggedMeal) => {
    const prev = meals;
    setMeals((ms) => ms?.filter((x) => x.id !== m.id) ?? ms);
    try {
      const res = await fetch(`/api/nutrition/meals/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMeals(prev);
      toast.error("Couldn't delete that.");
    }
  };

  return (
    <section id={ANCHOR} className="scroll-mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Meal log</h2>
          <p className="text-sm text-muted-foreground">
            What you ate, whether you liked it, and why. Tick a sitting on the grid to log it.
          </p>
        </div>
      </div>

      {meals === null ? (
        <div className="flex justify-center p-4">
          <Spinner className="size-4" />
        </div>
      ) : meals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nothing logged yet. Tick a sitting on the grid once you&apos;ve eaten it.
        </p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {meals.map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-md border px-3 py-2.5">
              <button
                type="button"
                onClick={() => patch(m, { felt_good: !m.felt_good })}
                className={cn("tap-target mt-0.5 shrink-0 rounded p-1", m.felt_good ? "text-emerald-600" : "text-rose-600")}
                aria-label={m.felt_good ? "Liked — mark as didn't like" : "Didn't like — mark as liked"}
                title={m.felt_good ? "Liked (tap to change)" : "Didn't like (tap to change)"}
              >
                {m.felt_good ? <ThumbsUpIcon className="size-4" /> : <ThumbsDownIcon className="size-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.eaten_date}
                  {m.slot && ` · ${slotLabel(m.slot) ?? m.slot}`}
                </p>
                {editing?.id === m.id ? (
                  <textarea
                    autoFocus
                    className={cn(field, "mt-1.5 min-h-16")}
                    value={editing.notes}
                    onChange={(e) => setEditing({ id: m.id, notes: e.target.value })}
                    onBlur={() => {
                      if (editing.notes !== (m.notes ?? "")) patch(m, { notes: editing.notes });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing({ id: m.id, notes: m.notes ?? "" })}
                    className={cn("mt-1 block w-full text-left text-sm", m.notes ? "text-foreground/80" : "text-muted-foreground/70")}
                  >
                    {m.notes || "Add a note…"}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(m)}
                className="tap-target shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${m.name}`}
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
