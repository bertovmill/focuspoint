"use client";

import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { CheckIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent } from "@/components/ui/popover";
import type { MealRating } from "@/lib/nutrition-plan";
import { cn } from "@/lib/utils";

/**
 * 👍/👎 on a bank meal, then one optional line on why. Nothing is sent until
 * the line is in (Enter) or skipped (Esc, tapping away), so the reason and the
 * rating land together and the follow-up work (taste profile, a replacement
 * for a 👎 meal) sees both. Tapping the lit thumb again takes the rating off.
 * `compact` is the Home pick card; the full size sits on the recipe page.
 */
export function MealFeedback({
  recipeId,
  rating: initialRating,
  reason: initialReason,
  compact = false,
  onChange,
  className,
}: {
  recipeId: number;
  rating: MealRating | null;
  reason: string | null;
  compact?: boolean;
  onChange?: (rating: MealRating | null, reason: string | null) => void;
  className?: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [reason, setReason] = useState(initialReason);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const saved = useRef({ rating: initialRating, reason: initialReason });
  // The unsent rating while the line is being typed, so leaving the page still saves it.
  const unsent = useRef<{ rating: MealRating; reason: string } | null>(null);

  useEffect(() => {
    setRating(initialRating);
    setReason(initialReason);
    saved.current = { rating: initialRating, reason: initialReason };
  }, [recipeId, initialRating, initialReason]);

  const put = async (next: MealRating | null, why: string | null) => {
    const was = saved.current.rating;
    setRating(next);
    setReason(why);
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipeId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next, reason: why }),
      });
      if (!res.ok) throw new Error();
      saved.current = { rating: next, reason: why };
      onChange?.(next, why);
      if (next === "down" && was !== "down") {
        toast("Got it. It's out of the rotation, and Cael is writing a new one for this sitting.");
      }
    } catch {
      setRating(saved.current.rating);
      setReason(saved.current.reason);
      toast.error("Couldn't save that.");
    }
  };

  const tap = (value: MealRating) => {
    if (rating === value && !asking) {
      put(null, null);
      return;
    }
    setRating(value);
    setDraft(rating === value ? (reason ?? "") : "");
    setAsking(true);
    unsent.current = { rating: value, reason: "" };
  };

  const finish = (why: string) => {
    const pending = unsent.current;
    if (!pending) return;
    unsent.current = null;
    setAsking(false);
    put(pending.rating, why.trim() || null);
  };

  useEffect(
    () => () => {
      const pending = unsent.current;
      if (!pending) return;
      fetch(`/api/nutrition/recipes/${recipeId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: pending.rating, reason: pending.reason || null }),
        keepalive: true,
      }).catch(() => {});
    },
    [recipeId],
  );

  const thumb = (value: MealRating) => {
    const Icon = value === "up" ? ThumbsUpIcon : ThumbsDownIcon;
    const on = rating === value;
    return (
      <button
        type="button"
        onClick={() => tap(value)}
        aria-pressed={on}
        aria-label={value === "up" ? "I liked this meal" : "I didn't like this meal"}
        className={cn(
          "flex items-center justify-center rounded-full border transition-colors",
          compact ? "size-7" : "h-9 gap-1.5 px-3 text-sm",
          on
            ? value === "up"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-rose-600 bg-rose-600 text-white"
            : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-4"} />
        {!compact && <span>{value === "up" ? "Liked it" : "Not for me"}</span>}
      </button>
    );
  };

  return (
    <div className={className}>
      <Popover open={asking} onOpenChange={(open) => !open && finish(draft)}>
        <PopoverPrimitive.Anchor asChild>
          <div className="flex items-center gap-1.5">
            {!compact && <span className="mr-1 text-sm text-muted-foreground">How was it?</span>}
            {thumb("up")}
            {thumb("down")}
          </div>
        </PopoverPrimitive.Anchor>
        <PopoverContent align="start" className="w-72 p-2">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              finish(draft);
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={280}
              onChange={(e) => {
                setDraft(e.target.value);
                if (unsent.current) unsent.current.reason = e.target.value;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  finish("");
                }
              }}
              placeholder={rating === "up" ? "What did you love? (optional)" : "What didn't work? (optional)"}
              className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <button
              type="submit"
              aria-label="Save"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
            >
              <CheckIcon className="size-4" />
            </button>
          </form>
        </PopoverContent>
      </Popover>
      {!compact && reason && !asking && (
        <p className="mt-2 font-serif text-sm italic text-muted-foreground">&ldquo;{reason}&rdquo;</p>
      )}
    </div>
  );
}
