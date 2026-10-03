"use client";

import { useEffect, useState } from "react";
import { PlusIcon, ThumbsDownIcon, ThumbsUpIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MEAL_SLOTS, slotLabel, todayISO } from "@/lib/nutrition";
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
 * Same nutrition_meals rows Cael's log_meal tool writes. The suggestion prompt
 * reads them as {{liked_meals}} / {{disliked_meals}} (lib/meal-prompt.ts), so
 * this is the main way to steer what Cael suggests.
 */
export function MealLog() {
  const [meals, setMeals] = useState<LoggedMeal[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slot, setSlot] = useState("dinner");
  const [date, setDate] = useState(todayISO());
  const [liked, setLiked] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: number; notes: string } | null>(null);

  useEffect(() => {
    fetch("/api/nutrition/meals?limit=60")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LoggedMeal[]) => setMeals(rows.map((m) => ({ ...m, eaten_date: String(m.eaten_date).slice(0, 10) }))))
      .catch(() => setMeals([]));
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/nutrition/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slot, eaten_date: date, felt_good: liked, notes }),
      });
      if (!res.ok) throw new Error();
      const row = (await res.json()) as LoggedMeal;
      setMeals((ms) =>
        [{ ...row, eaten_date: String(row.eaten_date).slice(0, 10) }, ...(ms ?? [])].sort((a, b) =>
          b.eaten_date.localeCompare(a.eaten_date),
        ),
      );
      setName("");
      setNotes("");
      setLiked(true);
      setOpen(false);
    } catch {
      toast.error("Couldn't log that meal.");
    } finally {
      setSaving(false);
    }
  };

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
            What you ate, whether you liked it, and why. Cael plans from this.
          </p>
        </div>
        <Button size="sm" variant={open ? "default" : "outline"} className="h-9 gap-1 text-sm" onClick={() => setOpen((v) => !v)}>
          <PlusIcon className="size-3.5" />
          Log a meal
        </Button>
      </div>

      {open && (
        <form onSubmit={add} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_120px_150px]">
          <input autoFocus className={field} placeholder="What did you eat?" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={field} value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Sitting">
            {MEAL_SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date eaten" />
          <div className="flex gap-2 sm:col-span-3">
            <LikeToggle liked={liked} onChange={setLiked} />
          </div>
          <textarea
            className={cn(field, "min-h-20 sm:col-span-3")}
            placeholder="Notes — what made it good or bad, what you'd change…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" size="sm" variant="ghost" className="h-9 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-9 text-sm" disabled={saving || !name.trim()}>
              {saving ? <Spinner className="size-3" /> : "Log meal"}
            </Button>
          </div>
        </form>
      )}

      {meals === null ? (
        <div className="flex justify-center p-4">
          <Spinner className="size-4" />
        </div>
      ) : meals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nothing logged yet. Log a meal you loved and Cael will aim for more like it.
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

function LikeToggle({ liked, onChange }: { liked: boolean; onChange: (v: boolean) => void }) {
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={liked ? "default" : "outline"}
        className="h-9 gap-1.5 text-sm"
        onClick={() => onChange(true)}
        aria-pressed={liked}
      >
        <ThumbsUpIcon className="size-3.5" />
        Liked it
      </Button>
      <Button
        type="button"
        size="sm"
        variant={!liked ? "default" : "outline"}
        className="h-9 gap-1.5 text-sm"
        onClick={() => onChange(false)}
        aria-pressed={!liked}
      >
        <ThumbsDownIcon className="size-3.5" />
        Didn&apos;t
      </Button>
    </>
  );
}
