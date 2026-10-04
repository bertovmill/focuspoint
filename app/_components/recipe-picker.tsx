"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Recipe } from "@/lib/nutrition-plan";
import { shortDayLabel, slotLabel, todayISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export interface CustomMeal {
  name: string;
  protein_g: number | null;
  kcal: number | null;
  ingredients: string;
}

/**
 * Fills one cell of the week grid from the meal bank. A meal that isn't there
 * yet can be typed in — it goes into the bank first. For today and past days,
 * "Ate it" logs the pick as eaten in the same step.
 */
export function RecipePicker({
  target,
  recipes,
  eatenDefault,
  onClose,
  onPick,
  onCustom,
}: {
  target: { date: string; slot: string } | null;
  recipes: Recipe[];
  eatenDefault: boolean;
  onClose: () => void;
  onPick: (recipe: Recipe, eatIt: boolean) => void;
  onCustom: (meal: CustomMeal, eatIt: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [kcal, setKcal] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [eatIt, setEatIt] = useState(false);

  useEffect(() => {
    if (target) {
      setQ("");
      setCustom(false);
      setName("");
      setProtein("");
      setKcal("");
      setIngredients("");
      setEatIt(eatenDefault);
    }
    // eatenDefault is read once per opening, so the toggle isn't reset under him.
  }, [target]);

  const loggable = !!target && target.date <= todayISO();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? recipes.filter((r) => r.name.toLowerCase().includes(needle)) : recipes;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, q]);

  const title = target ? `${slotLabel(target.slot)} · ${shortDayLabel(target.date)}` : "";

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {loggable && (
          <button
            type="button"
            onClick={() => setEatIt((v) => !v)}
            aria-pressed={eatIt}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm",
              eatIt ? "border-emerald-500/60 bg-emerald-500/5" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border",
                eatIt ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/50",
              )}
            >
              {eatIt && <CheckIcon className="size-3" />}
            </span>
            Ate it — log it and count the protein
          </button>
        )}

        {custom ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onCustom(
                {
                  name: name.trim(),
                  protein_g: protein === "" ? null : Number(protein),
                  kcal: kcal === "" ? null : Number(kcal),
                  ingredients,
                },
                eatIt && loggable,
              );
            }}
          >
            <Input autoFocus placeholder="Meal name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Protein (g)"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="kcal"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
              />
            </div>
            <textarea
              className="w-full min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm"
              placeholder="Ingredients, one per line (for the grocery list)"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" className="h-8 flex-1 text-xs" onClick={() => setCustom(false)}>
                Back to the bank
              </Button>
              <Button type="submit" size="sm" className="h-8 flex-1 text-xs" disabled={!name.trim()}>
                Add to bank &amp; use
              </Button>
            </div>
          </form>
        ) : (
          <>
            <Input
              autoFocus
              placeholder={recipes.length ? "Search the meal bank…" : "The meal bank is empty"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={recipes.length === 0}
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {shown.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {recipes.length === 0 ? "Add your first meal below — it goes into the bank." : "Nothing in the bank matches."}
                </p>
              )}
              {shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r, eatIt && loggable)}
                  className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base md:text-sm">{r.name}</span>
                    <span className="block text-sm text-muted-foreground tabular-nums md:text-xs">
                      {r.protein_g !== null ? `${r.protein_g} g protein` : "protein ?"}
                      {r.kcal !== null && ` · ${r.kcal} kcal`}
                      {r.ingredients.length > 0 && ` · ${r.ingredients.length} ingredients`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setName(q.trim());
                setCustom(true);
              }}
            >
              <PlusIcon className="size-3" />
              {q.trim() ? `Add “${q.trim()}” to the bank` : "New meal (adds to the bank)"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
