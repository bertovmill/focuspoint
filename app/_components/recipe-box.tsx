"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CalendarPlusIcon, ClockIcon, LinkIcon, SearchIcon, UtensilsIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AddToPlanDialog } from "@/app/_components/add-to-plan-dialog";
import { cookDisplay } from "@/app/_components/cook-fonts";
import type { Recipe } from "@/lib/nutrition-plan";
import { recipeHref } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

const TINTS = [
  "bg-[var(--tint-1)]",
  "bg-[var(--tint-2)]",
  "bg-[var(--tint-3)]",
  "bg-[var(--tint-4)]",
  "bg-[var(--tint-5)]",
  "bg-[var(--tint-6)]",
] as const;

type Shelf = "all" | "saved" | "bank";
const SHELVES: { key: Shelf; label: string }[] = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "bank", label: "Meal bank" },
];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The recipe box at /meals/recipes: every recipe Cael knows, as warm pastel
 * cards. Paste a link (or, for sites that block apps, the recipe text) to save
 * one; any card goes onto the meal plan in one step. Saved recipes never fill
 * the week on their own.
 */
export function RecipeBox() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<Recipe | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/recipes")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Recipe[]) => setRecipes(Array.isArray(rows) ? rows : []))
      .catch(() => setRecipes([]));
  }, []);

  const saved = recipes?.filter((r) => r.saved_to_box) ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes ?? [])
      .filter((r) => (shelf === "saved" ? r.saved_to_box : shelf === "bank" ? !r.saved_to_box : true))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.saved_to_box) - Number(a.saved_to_box) || b.created_at.localeCompare(a.created_at));
  }, [recipes, shelf, query]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition/recipes/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Couldn't read that page.");
      const { recipe, existed } = body as { recipe: Recipe; existed: boolean };
      setLink("");
      setFresh(recipe.id);
      if (existed) {
        toast(`${recipe.name} is already in the box.`);
        return;
      }
      setRecipes((cur) => [recipe, ...(cur ?? [])]);
      toast(`Saved ${recipe.name}`);
      // A photo in the same style as the bank meals, made once in the background.
      fetch(`/api/nutrition/recipes/${recipe.id}/image`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: Recipe | null) => {
          if (r?.image_url) setRecipes((cur) => cur?.map((x) => (x.id === r.id ? { ...x, image_url: r.image_url } : x)) ?? cur);
        })
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that page.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="recipe-box" className="cook-paper -mx-3 -my-4 min-h-[calc(100%+2rem)] px-4 pb-16 pt-6 sm:-mx-4 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/meals"
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-[var(--cook-soft)] transition-colors hover:text-[var(--cook-ink)]"
        >
          <ArrowLeftIcon className="size-3.5" />
          This week&apos;s meals
        </Link>

        <header className="mt-5">
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl" style={{ fontFamily: cookDisplay.style.fontFamily }}>
            Recipe box
          </h1>
          <p className="mt-2 text-[15px] text-[var(--cook-soft)]">
            {recipes === null
              ? " "
              : `${recipes.length} recipe${recipes.length === 1 ? "" : "s"} · ${saved.length} saved. Paste a recipe link, or the recipe itself, to keep it here.`}
          </p>
        </header>

        <form id="save-recipe-link" onSubmit={save} className="mt-6 flex items-center gap-2 rounded-full bg-[var(--tint-3)] p-1.5 pl-4">
          <LinkIcon className="size-4 shrink-0 text-[var(--cook-soft)]" />
          <input
            type="text"
            placeholder="Paste a recipe link or recipe text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={saving}
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-[var(--cook-soft)]"
          />
          <button
            type="submit"
            disabled={saving || !link.trim()}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--cook-accent)] px-5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <>
                <Spinner className="size-4" />
                Reading…
              </>
            ) : (
              "Save"
            )}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {SHELVES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setShelf(s.key)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                shelf === s.key ? "bg-[var(--cook-ink)] text-[var(--cook-bg)]" : "text-[var(--cook-soft)] hover:text-[var(--cook-ink)]",
              )}
            >
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex w-full items-center gap-2 rounded-full bg-[var(--tint-5)] px-3.5 py-1.5 sm:w-56">
            <SearchIcon className="size-4 shrink-0 text-[var(--cook-soft)]" />
            <input
              type="search"
              placeholder="Search recipes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--cook-soft)]"
            />
          </label>
        </div>

        {recipes === null ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 rounded-3xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-[var(--cook-soft)]">
            {query ? `Nothing matches "${query}".` : shelf === "saved" ? "No saved recipes yet. Paste a link above." : "No recipes yet."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r, i) => (
              <article
                key={r.id}
                id={`recipe-card-${r.id}`}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-3xl transition-shadow",
                  TINTS[i % TINTS.length],
                  fresh === r.id && "ring-2 ring-[var(--cook-accent)]",
                )}
              >
                <Link href={recipeHref(r)} className="block">
                  <div className="m-2 mb-0 aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-black/5">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image_url} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-[var(--cook-soft)]">
                        <UtensilsIcon className="size-6" />
                      </span>
                    )}
                  </div>
                  <div className="px-5 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--cook-soft)]">
                      {r.source_url ? host(r.source_url) : r.saved_to_box ? "Saved" : "Meal bank"}
                    </p>
                    <h2
                      className="font-display mt-1 text-xl leading-snug tracking-tight group-hover:underline"
                      style={{ fontFamily: cookDisplay.style.fontFamily }}
                    >
                      {r.name}
                    </h2>
                  </div>
                </Link>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap px-5 pb-4 pt-3 text-xs tabular-nums text-[var(--cook-soft)]">
                  {r.minutes != null && (
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="size-3.5" />
                      {r.minutes} min
                    </span>
                  )}
                  {r.protein_g != null && <span>{r.protein_g} g protein</span>}
                  {r.kcal != null && <span>{r.kcal} kcal</span>}
                  <button
                    type="button"
                    onClick={() => setAdding(r)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--cook-ink)] px-3 py-1.5 text-xs font-medium text-[var(--cook-bg)] transition-opacity hover:opacity-85"
                  >
                    <CalendarPlusIcon className="size-3.5" />
                    Add to plan
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <AddToPlanDialog recipe={adding} onClose={() => setAdding(null)} />
    </div>
  );
}
