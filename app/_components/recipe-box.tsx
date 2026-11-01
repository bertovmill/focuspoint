"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClockIcon, LinkIcon, SearchIcon, Trash2Icon, UtensilsIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cookDisplay } from "@/app/_components/cook-fonts";
import { MarkdownDoc } from "@/app/_components/markdown-doc";
import { MealFeedback } from "@/app/_components/meal-feedback";
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

type Shelf = "all" | "liked" | "saved" | "bank";
const SHELVES: { key: Shelf; label: string }[] = [
  { key: "all", label: "All" },
  { key: "liked", label: "Liked" },
  { key: "saved", label: "Saved" },
  { key: "bank", label: "Meal bank" },
];

// Liked recipes lead, disliked ones sink to the end.
const RANK = { up: 0, none: 1, down: 2 } as const;

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The Meals page at /meals: the vision, values and process on top, then every
 * meal Cael knows as warm pastel cards, and the taste profile under them. It's the database Cael recommends from, not a
 * plan. Paste a link (or, for sites that block apps, the recipe text) to save
 * one. Thumbs on each card feed the taste profile (liked first, disliked out);
 * Remove archives a meal, with Undo.
 */
export function RecipeBox() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
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
      .filter((r) =>
        shelf === "liked" ? r.rating === "up" : shelf === "saved" ? r.saved_to_box : shelf === "bank" ? !r.saved_to_box : true,
      )
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          RANK[a.rating ?? "none"] - RANK[b.rating ?? "none"] ||
          Number(b.saved_to_box) - Number(a.saved_to_box) ||
          b.created_at.localeCompare(a.created_at),
      );
  }, [recipes, shelf, query]);

  const rate = (id: number, rating: Recipe["rating"], reason: string | null) =>
    setRecipes((cur) => cur?.map((x) => (x.id === id ? { ...x, rating, rating_reason: reason } : x)) ?? cur);

  const archive = async (r: Recipe, archived: boolean) => {
    const res = await fetch(`/api/nutrition/recipes/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error(archived ? "Couldn't remove that." : "Couldn't bring that back.");
      return;
    }
    if (archived) {
      setRecipes((cur) => cur?.filter((x) => x.id !== r.id) ?? cur);
      toast(`Removed ${r.name}`, { duration: 10_000, action: { label: "Undo", onClick: () => archive(r, false) } });
    } else {
      setRecipes((cur) => (cur && !cur.some((x) => x.id === r.id) ? [...cur, r] : cur));
    }
  };

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
      setRecipes((cur) => [{ ...recipe, rating: null, rating_reason: null }, ...(cur ?? [])]);
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
        <header>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl" style={{ fontFamily: cookDisplay.style.fontFamily }}>
            Meals
          </h1>
        </header>

        {/* Everything below follows from this: why he eats the way he does. */}
        <MarkdownDoc
          id="meals-vision-values-process"
          endpoint="/api/meals/foundation"
          className="mt-5"
          heading={
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Vision, values and process</h2>
              <p className="text-xs text-muted-foreground">Why we eat this way. Every meal below comes after this. Edit anything and it sticks.</p>
            </div>
          }
          placeholder="Write the vision, values and process for how you eat."
        />

        <header className="mt-6">
          <p className="mt-2 text-[15px] text-[var(--cook-soft)]">
            {recipes === null
              ? " "
              : `${recipes.length} meal${recipes.length === 1 ? "" : "s"} · ${saved.length} saved. Cael recommends from these. Paste a recipe link, or the recipe itself, to add one.`}
          </p>
          <p className="mt-1 text-[15px] text-[var(--cook-soft)]">
            Thumbs up or down on any recipe teaches Cael{" "}
            <Link href="#meal-taste-profile" className="underline decoration-[var(--cook-accent)] underline-offset-4 hover:text-[var(--cook-ink)]">
              your taste
            </Link>
            . Liked ones come first and get recommended more; disliked ones stop coming up.
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
              placeholder="Search meals or ingredients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--cook-soft)]"
            />
          </label>
        </div>

        {recipes === null ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-60 rounded-3xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-[var(--cook-soft)]">
            {query
              ? `Nothing matches "${query}".`
              : shelf === "saved"
                ? "No saved recipes yet. Paste a link above."
                : shelf === "liked"
                  ? "Nothing liked yet. Give a recipe a thumbs up."
                  : "No recipes yet."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((r, i) => (
              <article
                key={r.id}
                id={`recipe-card-${r.id}`}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-3xl transition-[box-shadow,opacity]",
                  r.rating === "down" && "opacity-60 hover:opacity-100",
                  TINTS[i % TINTS.length],
                  fresh === r.id && "ring-2 ring-[var(--cook-accent)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => archive(r, true)}
                  aria-label={`Remove ${r.name}`}
                  title="Remove from the recipe box"
                  className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-full bg-[var(--cook-bg)]/90 text-[var(--cook-soft)] shadow-sm transition-opacity hover:text-[var(--cook-ink)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2Icon className="size-4" />
                </button>
                <Link href={recipeHref(r)} className="block">
                  <div className="m-2 mb-0 aspect-[16/9] overflow-hidden rounded-[1.25rem] bg-black/5">
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
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 whitespace-nowrap px-5 pb-3 pt-3 text-xs tabular-nums text-[var(--cook-soft)]">
                  {r.minutes != null && (
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="size-3.5" />
                      {r.minutes} min
                    </span>
                  )}
                  {r.protein_g != null && <span>{r.protein_g} g protein</span>}
                  {r.kcal != null && <span>{r.kcal} kcal</span>}
                </div>
                <div className="flex items-center gap-2 px-5 pb-4">
                  <MealFeedback
                    compact
                    recipeId={r.id}
                    rating={r.rating ?? null}
                    reason={r.rating_reason ?? null}
                    downToast="Got it. Cael will steer away from meals like this."
                    onChange={(rating, reason) => rate(r.id, rating, reason)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Taste profile — rewritten by a model from his 👍/👎 and one-liners
          (lib/meal-feedback.ts); recommendations follow it. */}
      <div className="mx-auto mt-10 max-w-5xl">
        <MarkdownDoc
          id="meal-taste-profile"
          endpoint="/api/meals/taste-profile"
          heading={
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Taste profile</h2>
              <p className="text-xs text-muted-foreground">
                Cael rewrites this from your 👍/👎 on meals and recommends to fit it. Edit anything here and it sticks.
              </p>
            </div>
          }
          placeholder="Rate a meal and Cael starts this for you."
        />
      </div>
    </div>
  );
}
