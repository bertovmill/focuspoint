"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { PlannedMeal, Recipe } from "@/lib/nutrition-plan";
import { ALL_SLOTS, addDaysISO, shortDayLabel, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/**
 * Puts one recipe on the meal plan: pick a day in the coming week, then a
 * sitting. Each sitting shows what's planned there now, since adding replaces it.
 */
export function AddToPlanDialog({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<string>("meal3");
  const [planned, setPlanned] = useState<PlannedMeal[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!recipe) return;
    setDate(today);
    setSlot(recipe.slot ?? "meal3");
    setPlanned(null);
    fetch(`/api/nutrition/plan?from=${days[0]}&to=${days[6]}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PlannedMeal[]) => setPlanned(Array.isArray(rows) ? rows : []))
      .catch(() => setPlanned([]));
    // Read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe]);

  const inCell = (d: string, s: string) => planned?.find((p) => p.meal_date === d && p.slot === s);

  const save = async () => {
    if (!recipe) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition/plan", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, slot, recipe_id: recipe.id }),
      });
      if (!res.ok) throw new Error();
      const label = ALL_SLOTS.find((s) => s.key === slot)?.label ?? "the plan";
      toast(`${recipe.name} → ${date === today ? "today" : shortDayLabel(date)}, ${label}`);
      onClose();
    } catch {
      toast.error("Couldn't add that to the plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!recipe} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to plan</DialogTitle>
          <DialogDescription>{recipe?.name}</DialogDescription>
        </DialogHeader>

        <div id="add-to-plan-day" className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
                d === date ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {d === today ? "Today" : shortDayLabel(d)}
            </button>
          ))}
        </div>

        <div id="add-to-plan-sitting" className="grid grid-cols-2 gap-2">
          {ALL_SLOTS.map((s) => {
            const there = inCell(date, s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSlot(s.key)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left transition-colors",
                  s.key === slot ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70",
                )}
              >
                <span className="block text-sm font-medium">{s.label}</span>
                <span className={cn("block truncate text-xs", s.key === slot ? "text-background/70" : "text-muted-foreground")}>
                  {planned === null ? "\u00a0" : there ? `Replaces ${there.name}` : "Empty"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Spinner className="size-4" /> : "Add to plan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
