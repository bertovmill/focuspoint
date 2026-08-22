"use client";

import { useState } from "react";
import { AppleIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { MEAL_SLOTS, PROTOCOL_RULES, currentSlot } from "@/lib/nutrition";
import { RuleImage } from "@/app/_components/rule-image";
import { cn } from "@/lib/utils";
import { useNutritionToday } from "@/app/_components/use-nutrition-today";

/**
 * The compact strip pinned above the pipelines on the Tasks board: today's four
 * protocol rules and the three sittings, tickable without leaving the task
 * screen. Same rows as the Nutrition section — this is a second window onto
 * them, not a copy.
 */
export function NutritionToday() {
  const { rules, bySlot, eatenSlots, toggleRule, toggleAte } = useNutritionToday();
  const [open, setOpen] = useState(true);
  const live = currentSlot();
  const done = rules.length + eatenSlots.size;
  const total = PROTOCOL_RULES.length + MEAL_SLOTS.length;

  return (
    <section className="border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60"
      >
        {open ? (
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <AppleIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide">Nutrition</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5 px-1.5 pb-1.5">
          {MEAL_SLOTS.map((slot) => {
            const rec = bySlot.get(slot.key);
            const ate = eatenSlots.has(slot.key);
            return (
              <div
                key={slot.key}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1 py-1",
                  slot.key === live && !ate && "bg-muted/50",
                )}
              >
                <button
                  type="button"
                  disabled={!rec}
                  onClick={() => rec && toggleAte(slot.key, rec.name)}
                  aria-label={ate ? `Un-log ${slot.label}` : `Log ${slot.label}`}
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded border",
                    ate ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
                    !rec && "opacity-40",
                  )}
                >
                  {ate && <CheckIcon className="size-2.5" />}
                </button>
                {rec?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rec.image_url} alt="" className="size-6 shrink-0 rounded object-cover" />
                ) : (
                  <span className="size-6 shrink-0 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[9.5px] uppercase tracking-wide text-muted-foreground leading-none">
                    {slot.label}
                  </span>
                  <span className={cn("block truncate text-[11px] leading-tight", ate && "text-muted-foreground line-through")}>
                    {rec?.name ?? "—"}
                  </span>
                </span>
              </div>
            );
          })}

          <div className="mt-1 border-t pt-1">
            {PROTOCOL_RULES.map((rule) => {
              const on = rules.includes(rule.key);
              return (
                <button
                  key={rule.key}
                  type="button"
                  onClick={() => toggleRule(rule.key)}
                  title={rule.detail}
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded border",
                      on ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40",
                    )}
                  >
                    {on && <CheckIcon className="size-2.5" />}
                  </span>
                  <RuleImage ruleKey={rule.key} className="size-6" />
                  <span className={cn("min-w-0 flex-1 truncate text-[11px]", on && "text-muted-foreground")}>
                    {rule.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
