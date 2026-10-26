"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, ClockIcon, UtensilsIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MealRatingEntry, Recipe } from "@/lib/nutrition-plan";
import { MealFeedback } from "@/app/_components/meal-feedback";
import { cn } from "@/lib/utils";

// Which Robbins rule each sitting's meals are built around — shown under the
// title so the "why" is part of the recipe, not a separate screen.
const SITTING: Record<string, { label: string; rule: string }> = {
  meal1: { label: "Morning", rule: "Water-rich · no protein with starch" },
  meal2: { label: "Midday", rule: "Water-rich · no protein with starch" },
  meal3: { label: "Evening", rule: "Water-rich · no protein with starch" },
  snack: { label: "Snack", rule: "Light and water-rich" },
};

/**
 * One bank meal as a full recipe, NYT Cooking-style: a big photo, the story
 * line, time, then ingredients beside a numbered method. Opened from Home's
 * meal picks at /meals/recipes/<id>-<slug>. Ingredients tick off while
 * cooking (kept only for the visit). A meal with no photo yet gets one here,
 * the same way Home does.
 */
export function RecipeView({ id }: { id: number }) {
  const [recipe, setRecipe] = useState<Recipe | null | "missing">(null);
  const [have, setHave] = useState<Set<number>>(new Set());
  const [rating, setRating] = useState<MealRatingEntry | null>(null);

  useEffect(() => {
    let stale = false;
    (async () => {
      const res = await fetch(`/api/nutrition/recipes/${id}`).catch(() => null);
      if (stale) return;
      if (!res?.ok) return setRecipe("missing");
      const r = (await res.json()) as Recipe;
      setRecipe(r);
      fetch(`/api/nutrition/recipes/${id}/feedback`)
        .then((f) => (f.ok ? f.json() : null))
        .then((f: { rating: MealRatingEntry["rating"] | null; reason: string | null } | null) => {
          if (!stale && f?.rating) setRating({ rating: f.rating, reason: f.reason });
        })
        .catch(() => {});
      if (!r.image_url) {
        const img = await fetch(`/api/nutrition/recipes/${id}/image`, { method: "POST" }).catch(() => null);
        if (!stale && img?.ok) {
          const { image_url } = (await img.json()) as Recipe;
          setRecipe((cur) => (cur && cur !== "missing" ? { ...cur, image_url } : cur));
        }
      }
    })();
    return () => {
      stale = true;
    };
  }, [id]);

  const toggle = (i: number) =>
    setHave((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (recipe === "missing") {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-sm text-muted-foreground">
        That recipe isn&apos;t in the meal bank. <Link href="/" className="underline">Back home</Link>
      </div>
    );
  }

  const sitting = recipe?.slot ? SITTING[recipe.slot] : undefined;
  // Bank meals from before full recipes have only plain ingredient names.
  const lines = recipe ? (recipe.ingredient_lines.length ? recipe.ingredient_lines : recipe.ingredients) : [];

  return (
    <article id="recipe" className="mx-auto max-w-4xl pb-16">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Today&apos;s meals
      </Link>

      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted sm:aspect-[16/8]">
        {recipe?.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.image_url} alt={recipe.name} className="size-full object-cover" />
        )}
      </div>

      {recipe === null ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : (
        <>
          <header className="mt-8 max-w-2xl">
            {sitting && (
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                {sitting.label} · {sitting.rule}
              </p>
            )}
            <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">{recipe.name}</h1>
            {recipe.description && (
              <p className="mt-3 font-serif text-lg leading-relaxed text-muted-foreground">{recipe.description}</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y py-3 text-sm">
              {recipe.minutes != null && (
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{recipe.minutes} min</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <UtensilsIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">Serves 1</span>
              </span>
            </div>
            <MealFeedback
              className="mt-4"
              recipeId={recipe.id}
              rating={rating?.rating ?? null}
              reason={rating?.reason ?? null}
              onChange={(r, reason) => setRating(r ? { rating: r, reason } : null)}
            />
          </header>

          <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section id="ingredients">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest">Ingredients</h2>
              <ul className="space-y-1">
                {lines.map((line, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className="flex w-full items-start gap-3 rounded-md px-1 py-1.5 text-left text-[15px] leading-snug hover:bg-muted/60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                          have.has(i) ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
                        )}
                      >
                        {have.has(i) && <CheckIcon className="size-3" />}
                      </span>
                      <span className={cn(have.has(i) && "text-muted-foreground line-through")}>{line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section id="preparation">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest">Preparation</h2>
              {recipe.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No method written for this one yet.</p>
              ) : (
                <ol className="space-y-6">
                  {recipe.steps.map((step, i) => (
                    <li key={i}>
                      <p className="text-sm font-semibold">Step {i + 1}</p>
                      <p className="mt-1 font-serif text-[17px] leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </article>
  );
}
