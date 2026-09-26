"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { INTENSITIES, SESSION_TYPES, type TrainingSession } from "@/lib/training";
import { shortDayLabel } from "@/lib/nutrition";

export interface SessionDraft {
  session_date: string;
  type: string;
  title: string;
  target_km: string;
  target_minutes: string;
  intensity: string;
  notes: string;
}

/** Add or edit one session. `target` is a date (new) or an existing session. */
export function SessionEditor({
  target,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  target: { date: string } | TrainingSession | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: SessionDraft, id?: number) => void;
  onDelete?: (id: number) => void;
}) {
  const existing = target && "id" in target ? target : null;
  const [d, setD] = useState<SessionDraft>(empty(""));

  useEffect(() => {
    if (!target) return;
    if (existing) {
      setD({
        session_date: existing.session_date,
        type: existing.type,
        title: existing.title,
        target_km: existing.target_km?.toString() ?? "",
        target_minutes: existing.target_minutes?.toString() ?? "",
        intensity: existing.intensity ?? "moderate",
        notes: existing.notes ?? "",
      });
    } else if ("date" in target) {
      setD(empty(target.date));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const isRun = ["long_run", "intervals", "easy"].includes(d.type);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">
            {existing ? "Edit session" : "Add session"}{d.session_date ? ` · ${shortDayLabel(d.session_date)}` : ""}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(d, existing?.id);
          }}
        >
          <div className="flex flex-wrap gap-1">
            {SESSION_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setD((x) => ({ ...x, type: t.key, title: x.title || "" }))}
                className={`rounded-full border px-2.5 py-1 text-xs ${d.type === t.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input
            autoFocus
            placeholder={SESSION_TYPES.find((t) => t.key === d.type)?.label ?? "Title"}
            value={d.title}
            onChange={(e) => setD((x) => ({ ...x, title: e.target.value }))}
          />
          {d.type !== "rest" && (
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                placeholder="km"
                disabled={!isRun}
                value={d.target_km}
                onChange={(e) => setD((x) => ({ ...x, target_km: e.target.value }))}
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="minutes"
                value={d.target_minutes}
                onChange={(e) => setD((x) => ({ ...x, target_minutes: e.target.value }))}
              />
              <select
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={d.intensity}
                onChange={(e) => setD((x) => ({ ...x, intensity: e.target.value }))}
                aria-label="Intensity"
              >
                {INTENSITIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          )}
          <textarea
            className="w-full min-h-16 rounded-md border bg-transparent px-3 py-2 text-sm"
            placeholder="Notes — the point of the session, how to run it"
            value={d.notes}
            onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))}
          />
          <Input type="date" value={d.session_date} onChange={(e) => setD((x) => ({ ...x, session_date: e.target.value }))} aria-label="Date" />
          <div className="flex items-center gap-2 pt-1">
            {existing && onDelete && (
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => onDelete(existing.id)}>
                Delete
              </Button>
            )}
            <Button type="submit" size="sm" className="ml-auto h-8 text-xs" disabled={saving || !d.session_date}>
              {saving ? <Spinner className="size-3" /> : existing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function empty(date: string): SessionDraft {
  return { session_date: date, type: "long_run", title: "", target_km: "", target_minutes: "", intensity: "moderate", notes: "" };
}
