"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { sessionMeta, type TrainingSession } from "@/lib/training";
import type { WorkoutTemplate } from "@/lib/workout-templates";
import { cn } from "@/lib/utils";

/**
 * Swap a session for another workout from the bank — just this one, or this one
 * and every later unfinished one (which also moves the default week over).
 */
export function SwapWorkoutDialog({
  session,
  open,
  onOpenChange,
  onSwapped,
}: {
  session: TrainingSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwapped: () => void;
}) {
  const [workouts, setWorkouts] = useState<WorkoutTemplate[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || workouts) return;
    fetch("/api/training/bank")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setWorkouts)
      .catch(() => {
        setWorkouts([]);
        toast.error("Couldn't load the workout bank");
      });
  }, [open, workouts]);

  const swap = async (scope: "one" | "following") => {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/training/sessions/${session.id}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workout_slug: pick, scope }),
      });
      if (!res.ok) throw new Error();
      toast.success(scope === "one" ? "Swapped for this day." : "Swapped from here on.");
      onOpenChange(false);
      setPick(null);
      onSwapped();
    } catch {
      toast.error("Couldn't swap that.");
    } finally {
      setBusy(false);
    }
  };

  const choices = (workouts ?? []).filter((w) => w.slug !== session.workout_slug);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap workout</DialogTitle>
          <DialogDescription>Replace “{session.title}” with another workout from the bank.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {!workouts ? (
            <Spinner className="mx-auto my-4" />
          ) : choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other workouts in the bank.</p>
          ) : (
            choices.map((w) => (
              <button
                key={w.slug}
                type="button"
                onClick={() => setPick(w.slug)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  pick === w.slug && "border-foreground bg-muted",
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", sessionMeta(w.session_type).color)} />
                <span className="font-medium">{w.name}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={!pick || busy} onClick={() => swap("one")}>
            Just this one
          </Button>
          <Button disabled={!pick || busy} onClick={() => swap("following")}>
            This and all following
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
