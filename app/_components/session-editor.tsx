"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { INTENSITIES, SESSION_TYPES, formatPace, minutesAtPace, parsePace, type PaceSuggestion, type TrainingSession } from "@/lib/training";
import { weekStartISO } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export interface SessionDraft {
  session_date: string;
  type: string;
  title: string;
  target_km: string;
  target_minutes: string;
  /** "5:30" — min:sec per km. */
  target_pace: string;
  intensity: string;
  notes: string;
}

export function sessionHref(id: number) {
  return `/training/sessions/${id}`;
}

export function newSessionHref(date: string) {
  return `/training/sessions/new/${date}`;
}

/** Back to the week the session sits in. */
function weekHref(date: string) {
  return date ? `/training?week=${weekStartISO(date)}` : "/training";
}

function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/**
 * /training/sessions/<id> and /training/sessions/new/<date> — add or edit one
 * session as its own page (it was a modal; Berto, 2026-10-04). Runs get a pace
 * suggested from his Fitbit runs. Editing an existing session saves as you type;
 * a new one is created with Add.
 */
export function SessionPage({ id, date }: { id?: number; date?: string }) {
  const router = useRouter();
  const [existing, setExisting] = useState<TrainingSession | null>(null);
  const [d, setD] = useState<SessionDraft | null>(id ? null : empty(date ?? ""));
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, PaceSuggestion | null>>({});

  useEffect(() => {
    fetch("/api/training/pace-suggestions")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setSuggestions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/training/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: TrainingSession) => {
        setExisting(s);
        setD({
          session_date: s.session_date,
          type: s.type,
          title: s.title,
          target_km: s.target_km?.toString() ?? "",
          target_minutes: s.target_minutes?.toString() ?? "",
          // Older runs were planned as km + minutes; show that as a pace so it carries over.
          target_pace: s.target_pace_sec
            ? formatPace(s.target_pace_sec)
            : s.target_km && s.target_minutes
              ? formatPace((s.target_minutes * 60) / s.target_km)
              : "",
          intensity: s.intensity ?? "moderate",
          notes: s.notes ?? "",
        });
      })
      .catch(() => toast.error("Couldn't find that session."));
  }, [id]);

  // Autosave an existing session ~0.6s after the last change. `saved` is the last
  // body the server has, so loading the session doesn't count as a change.
  const saved = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    if (!id || !d) return;
    const body = payload(d);
    if (saved.current === null) {
      saved.current = body;
      return;
    }
    if (body === saved.current || !d.session_date || badPace(d)) return;
    pending.current = body;
    const t = setTimeout(async () => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/training/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        if (!res.ok) throw new Error();
        saved.current = body;
        if (pending.current === body) pending.current = null;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [id, d]);
  // Leaving mid-debounce still saves the last edit.
  useEffect(
    () => () => {
      if (id && pending.current) {
        fetch(`/api/training/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: pending.current, keepalive: true }).catch(() => {});
      }
    },
    [id],
  );

  if (!d) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const isRun = isRunType(d.type);
  const paceSec = parsePace(d.target_pace);
  const paceBad = d.target_pace.trim() !== "" && paceSec === null;
  const runMinutes = minutesAtPace(d.target_km === "" ? null : Number(d.target_km), paceSec);
  const suggestion = isRun ? suggestions[d.type] : null;
  const back = weekHref(existing?.session_date ?? d.session_date);
  const set = (patch: Partial<SessionDraft>) => setD((x) => (x ? { ...x, ...patch } : x));

  // New sessions only — existing ones autosave (above).
  const save = async () => {
    if (paceBad) return;
    setSaving(true);
    try {
      const res = await fetch("/api/training/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload(d),
      });
      if (!res.ok) throw new Error();
      router.push(weekHref(d.session_date));
    } catch {
      toast.error("Couldn't save that session.");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/training/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push(back);
    } catch {
      toast.error("Couldn't delete that.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-16">
      <header className="space-y-2">
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Training
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{existing ? "Edit session" : "Add session"}</h1>
        {d.session_date && <p className="text-lg text-muted-foreground">{longDate(d.session_date)}</p>}
      </header>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!existing) save();
        }}
      >
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {SESSION_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => set({ type: t.key })}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm",
                  d.type === t.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title">
          <Input
            className="h-12 text-base"
            placeholder={SESSION_TYPES.find((t) => t.key === d.type)?.label ?? "Title"}
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>

        {d.type !== "rest" && (
          <div className="grid grid-cols-2 gap-3">
            {isRun ? (
              <>
                <Field label="Distance (km)">
                  <Input
                    className="h-12 text-base"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    placeholder="20"
                    value={d.target_km}
                    onChange={(e) => set({ target_km: e.target.value })}
                  />
                </Field>
                <Field label="Pace (per km)">
                  <Input
                    className="h-12 text-base"
                    inputMode="decimal"
                    placeholder={suggestion ? formatPace(suggestion.pace_sec) : "5:30"}
                    aria-invalid={paceBad || undefined}
                    value={d.target_pace}
                    onChange={(e) => set({ target_pace: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field label="Minutes">
                <Input
                  className="h-12 text-base"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="60"
                  value={d.target_minutes}
                  onChange={(e) => set({ target_minutes: e.target.value })}
                />
              </Field>
            )}
            <Field label="Intensity" className={isRun ? "col-span-2" : undefined}>
              <div className="flex gap-2">
                {INTENSITIES.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => set({ intensity: i })}
                    className={cn(
                      "h-10 flex-1 rounded-lg border text-sm capitalize",
                      d.intensity === i ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {isRun && (paceBad || runMinutes !== null) && (
          <p className={cn("-mt-2 text-sm", paceBad ? "text-destructive" : "text-muted-foreground")}>
            {paceBad ? "Pace as min:sec per km, e.g. 5:30" : `≈ ${fmtDuration(runMinutes!)} at that pace`}
          </p>
        )}

        {isRun && !suggestion && d.type !== "intervals" && (
          <p className="-mt-2 text-sm text-muted-foreground">
            No recent runs on your Fitbit to suggest a pace from yet.
          </p>
        )}

        {suggestion && (
          <div id="pace-suggestion" className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-sm">
              <p>
                <span className="font-semibold tabular-nums">{formatPace(suggestion.pace_sec)}/km</span> suggested
              </p>
              <p className="text-muted-foreground">{suggestion.basis}</p>
            </div>
            <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => set({ target_pace: formatPace(suggestion.pace_sec) })}>
              Use
            </Button>
          </div>
        )}

        <Field label="Notes">
          <textarea
            className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-base"
            placeholder="The point of the session, how to run it"
            value={d.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>

        <Field label="Date">
          <Input className="h-12 text-base" type="date" value={d.session_date} onChange={(e) => set({ session_date: e.target.value })} />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          {existing && (
            <Button type="button" variant="ghost" className="h-12 text-base text-destructive" disabled={saving} onClick={remove}>
              Delete
            </Button>
          )}
          {existing ? (
            <>
              <span className={cn("ml-auto text-sm", status === "error" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save — check your connection" : ""}
              </span>
              <Button asChild variant="outline" className="h-12 min-w-28 text-base">
                <Link href={weekHref(d.session_date)}>Done</Link>
              </Button>
            </>
          ) : (
            <Button type="submit" className="ml-auto h-12 min-w-28 text-base" disabled={saving || !d.session_date || paceBad}>
              {saving ? <Spinner className="size-4" /> : "Add"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function isRunType(type: string) {
  return ["long_run", "intervals", "easy"].includes(type);
}

function badPace(d: SessionDraft) {
  return d.target_pace.trim() !== "" && parsePace(d.target_pace) === null;
}

/** The request body for a draft. Runs are planned by distance + pace; anything else by minutes. */
function payload(d: SessionDraft): string {
  const run = isRunType(d.type);
  return JSON.stringify({
    session_date: d.session_date,
    type: d.type,
    title: d.title,
    target_km: run && d.target_km !== "" ? Number(d.target_km) : null,
    target_minutes: !run && d.target_minutes !== "" ? Number(d.target_minutes) : null,
    target_pace_sec: run && d.target_pace !== "" ? parsePace(d.target_pace) : null,
    intensity: d.intensity,
    notes: d.notes,
  });
}

function empty(date: string): SessionDraft {
  return { session_date: date, type: "long_run", title: "", target_km: "", target_minutes: "", target_pace: "", intensity: "moderate", notes: "" };
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  return h ? `${h}h ${String(min % 60).padStart(2, "0")}m` : `${min} min`;
}
