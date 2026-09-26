"use client";

import { useEffect, useMemo, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Recipe } from "@/lib/nutrition-plan";
import { shortDayLabel, slotLabel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export interface CustomMeal {
  name: string;
  protein_g: number | null;
  kcal: number | null;
  ingredients: string;
  save: boolean;
}

/**
 * Fills one cell of the week grid: pick from the library, ask Cael, or type a
 * meal in (optionally saving it to the library on the way).
 */
export function RecipePicker({
  target,
  recipes,
  suggesting,
  onClose,
  onPick,
  onSuggest,
  onCustom,
}: {
  target: { date: string; slot: string } | null;
  recipes: Recipe[];
  suggesting: boolean;
  onClose: () => void;
  onPick: (recipe: Recipe) => void;
  onSuggest: () => void;
  onCustom: (meal: CustomMeal) => void;
}) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [kcal, setKcal] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [save, setSave] = useState(true);

  useEffect(() => {
    if (target) {
      setQ("");
      setCustom(false);
      setName("");
      setProtein("");
      setKcal("");
      setIngredients("");
      setSave(true);
    }
  }, [target]);

  // Library entries hinted for this sitting float to the top; the rest follow.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? recipes.filter((r) => r.name.toLowerCase().includes(needle)) : recipes;
    return [...list].sort((a, b) => {
      const as = a.slot === target?.slot ? 0 : 1;
      const bs = b.slot === target?.slot ? 0 : 1;
      return as - bs || a.name.localeCompare(b.name);
    });
  }, [recipes, q, target?.slot]);

  const title = target ? `${slotLabel(target.slot)} · ${shortDayLabel(target.date)}` : "";

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 flex-1 gap-1 text-xs"
            disabled={suggesting}
            onClick={onSuggest}
          >
            {suggesting ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
            {suggesting ? "Asking Cael…" : "Ask Cael"}
          </Button>
          <Button
            size="sm"
            variant={custom ? "default" : "outline"}
            className="h-8 flex-1 text-xs"
            onClick={() => setCustom((v) => !v)}
          >
            Type one in
          </Button>
        </div>

        {custom ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onCustom({
                name: name.trim(),
                protein_g: protein === "" ? null : Number(protein),
                kcal: kcal === "" ? null : Number(kcal),
                ingredients,
                save,
              });
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
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
              Save to recipe library
            </label>
            <Button type="submit" size="sm" className="h-8 w-full text-xs" disabled={!name.trim()}>
              Use this meal
            </Button>
          </form>
        ) : (
          <>
            <Input
              autoFocus
              placeholder={recipes.length ? "Search the library…" : "No recipes saved yet"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={recipes.length === 0}
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {shown.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {recipes.length === 0
                    ? "Ask Cael for an idea or type a meal in — saving it builds the library."
                    : "Nothing matches."}
                </p>
              )}
              {shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {r.protein_g !== null ? `${r.protein_g} g protein` : "protein ?"}
                      {r.kcal !== null && ` · ${r.kcal} kcal`}
                      {r.ingredients.length > 0 && ` · ${r.ingredients.length} ingredients`}
                    </span>
                  </span>
                  {r.slot && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                        r.slot === target?.slot ? "border-foreground/40" : "text-muted-foreground",
                      )}
                    >
                      {r.slot}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
