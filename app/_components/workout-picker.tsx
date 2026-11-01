"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Actuals, sessionDetailsHref } from "@/app/_components/session-editor";
import { formatPace, sessionMeta, type TrainingSession } from "@/lib/training";
import { SessionTypeIcon } from "./session-type-icon";
import type { WorkoutTemplate } from "@/lib/workout-templates";
import { weekStartISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/** Rest isn't a bank workout; the swap API takes this slug to make the day a rest day. */
const REST = "rest";

function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function planLabel(w: WorkoutTemplate) {
  const p = w.plan ?? {};
  return [sessionMeta(w.session_type).short, p.km && `${p.km} km`, p.pace_sec && `${formatPace(p.pace_sec)}/km`, !p.km && p.minutes && `${p.minutes} min`]
    .filter(Boolean)
    .join(" · ");
}

/**
 * /training/sessions/<id> — tapping a day's workout opens this: the workouts he actually
 * does (the bank) plus Rest, to swap the day for one of them, just this day or every week
 * after (Berto, 2026-11-01; replaced the type/title/notes form, now under "Edit details").
 */
export function WorkoutPicker({ id }: { id: number }) {
  const router = useRouter();
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutTemplate[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/training/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSession)
      .catch(() => toast.error("Couldn't find that session."));
    fetch("/api/training/bank")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setWorkouts)
      .catch(() => {
        setWorkouts([]);
        toast.error("Couldn't load your workouts.");
      });
  }, [id]);

  if (!session || !workouts) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const back = `/training?week=${weekStartISO(session.session_date)}`;
  const current = session.workout_slug ?? (session.type === "rest" ? REST : null);
  const changed = pick !== null && pick !== current;

  const swap = async (scope: "one" | "following") => {
    if (!changed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/training/sessions/${id}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workout_slug: pick, scope }),
      });
      if (!res.ok) throw new Error();
      toast.success(scope === "one" ? "Swapped for this day." : "Swapped from here on.");
      router.push(back);
    } catch {
      toast.error("Couldn't swap that.");
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/training/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push(back);
    } catch {
      toast.error("Couldn't remove that.");
      setBusy(false);
    }
  };

  const choices: { slug: string; name: string; label: string; type: string }[] = [
    ...workouts.map((w) => ({ slug: w.slug, name: w.name, label: planLabel(w), type: w.session_type as string })),
    { slug: REST, name: "Rest", label: "Day off", type: "rest" },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-16">
      <header className="space-y-2">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Training
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{longDate(session.session_date)}</h1>
        <p className="text-lg text-muted-foreground">Now: {session.title}</p>
      </header>

      {session.done && <Actuals s={session} />}

      <div className="space-y-1.5">
        {choices.map((c) => {
          const selected = (pick ?? current) === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setPick(c.slug)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                selected ? "bg-muted dark:bg-muted/70" : "hover:bg-muted/50",
              )}
            >
              <SessionTypeIcon type={c.type} className="size-5" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium leading-snug">{c.name}</span>
                <span className="block text-sm tabular-nums text-muted-foreground">{c.label}</span>
              </span>
              {selected && <CheckIcon className="size-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      {changed && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => swap("one")}
            className="h-11 rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90 disabled:opacity-40"
          >
            Just this day
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => swap("following")}
            className="h-11 rounded-lg text-base font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
          >
            This and every week after
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 text-sm">
        <Link href={sessionDetailsHref(id)} className="text-muted-foreground hover:text-foreground">
          Edit details
        </Link>
        <button type="button" disabled={busy} onClick={remove} className="text-muted-foreground hover:text-destructive">
          Remove from this day
        </button>
      </div>
    </div>
  );
}
