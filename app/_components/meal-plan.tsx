"use client";

import Image from "next/image";
import { CheckIcon, RefreshCwIcon, SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MEAL_SLOTS, currentSlot } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import { useNutritionToday } from "@/app/_components/use-nutrition-today";

/**
 * Today's three sittings, on the Nutrition screen. Cael fills these in on the
 * morning tick (agent/schedules/dispatcher.ts); the buttons here are for the
 * days that hasn't happened yet, or when a suggestion doesn't appeal.
 */
export function MealPlan() {
  const { bySlot, eatenSlots, loading, busySlot, toggleAte, setFeedback, suggest } = useNutritionToday();
  const live = currentSlot();
  const missing = MEAL_SLOTS.filter((s) => !bySlot.has(s.key));

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold">Today&apos;s meals</h2>
        {missing.length > 0 && !loading && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busySlot !== null}
            onClick={() => suggest()}
          >
            {busySlot === "all" ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
            {busySlot === "all" ? "Cooking up ideas…" : `Suggest ${missing.length === 3 ? "all three" : "the rest"}`}
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MEAL_SLOTS.map((slotMeta) => {
          const rec = bySlot.get(slotMeta.key);
          const ate = eatenSlots.has(slotMeta.key);
          const busy = busySlot === slotMeta.key;
          return (
            <div
              key={slotMeta.key}
              className={cn(
                "flex flex-col overflow-hidden rounded-lg border",
                ate ? "border-emerald-500/60" : slotMeta.key === live ? "border-foreground/25" : "border-border",
              )}
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide">{slotMeta.label}</span>
                {slotMeta.key === live && !ate && (
                  <span className="text-[10px] text-muted-foreground">now</span>
                )}
                {rec && (
                  <button
                    type="button"
                    onClick={() => suggest(slotMeta.key)}
                    disabled={busy}
                    className="tap-target ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label={`Suggest a different ${slotMeta.label.toLowerCase()}`}
                    title="Suggest something else"
                  >
                    {busy ? <Spinner className="size-3" /> : <RefreshCwIcon className="size-3" />}
                  </button>
                )}
              </div>

              {rec ? (
                <>
                  {rec.image_url && (
                    <Image
                      src={rec.image_url}
                      alt={rec.name}
                      width={640}
                      height={480}
                      sizes="(min-width: 640px) 33vw, 100vw"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <p className="text-sm font-medium leading-tight">{rec.name}</p>
                    {rec.description && (
                      <p className="text-xs text-muted-foreground leading-snug">{rec.description}</p>
                    )}
                    <div className="mt-auto flex items-center gap-1 pt-1.5">
                      <Button
                        size="sm"
                        variant={ate ? "default" : "outline"}
                        className={cn("h-7 flex-1 gap-1 text-xs", ate && "bg-emerald-600 hover:bg-emerald-600/90")}
                        onClick={() => toggleAte(slotMeta.key, rec.name)}
                      >
                        <CheckIcon className="size-3" />
                        {ate ? "Ate it" : "Ate it?"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setFeedback(rec, "up")}
                        className={cn(
                          "tap-target rounded-md border p-1.5",
                          rec.feedback === "up" ? "border-emerald-500 text-emerald-600" : "text-muted-foreground",
                        )}
                        aria-label="Liked it"
                      >
                        <ThumbsUpIcon className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedback(rec, "down")}
                        className={cn(
                          "tap-target rounded-md border p-1.5",
                          rec.feedback === "down" ? "border-destructive text-destructive" : "text-muted-foreground",
                        )}
                        aria-label="Not for me"
                      >
                        <ThumbsDownIcon className="size-3" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground">{loading ? "…" : "Nothing suggested yet"}</p>
                  {!loading && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      disabled={busy || busySlot !== null}
                      onClick={() => suggest(slotMeta.key)}
                    >
                      {busy ? <Spinner className="size-3" /> : <SparklesIcon className="size-3" />}
                      Suggest one
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
