"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLinkIcon, Loader2Icon, PenLineIcon, RefreshCwIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ReadingPick, ReadingRating } from "@/lib/reading-picks";

/**
 * /writing?tab=reading — the evening reading loop (lib/reading-picks.ts).
 * Tonight's pick on top with 👍/👎 and a one-liner, then past picks, then the
 * interest profile those ratings rewrite. The 7pm cron makes the pick; the
 * buttons here can make or swap it early.
 */
export function ReadingPicks({ tabs }: { tabs: React.ReactNode }) {
  const [picks, setPicks] = useState<ReadingPick[] | null>(null);
  const [profile, setProfile] = useState("");
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    fetch("/api/reading-picks")
      .then((r) => r.json())
      .then((d) => {
        setPicks(Array.isArray(d.picks) ? d.picks : []);
        setProfile(d.profile ?? "");
      })
      .catch(() => setPicks([]));
  }, []);
  useEffect(load, [load]);

  const pick = async (force: boolean) => {
    setPicking(true);
    try {
      const res = await fetch("/api/reading-picks", { method: "POST", body: JSON.stringify({ force }) });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast.error("Couldn't pick a read");
    } finally {
      setPicking(false);
    }
  };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const tonight = picks?.find((p) => p.date === today) ?? null;
  const past = picks?.filter((p) => p !== tonight) ?? [];

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Writing</h1>
          <p className="text-sm text-muted-foreground">
            One read every evening at 7pm. Rate it so tomorrow&apos;s gets better, then tweet your take.
          </p>
        </header>
        {tabs}

        <section id="tonight" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Tonight</h2>
          {picks === null ? (
            <Skeleton className="h-36 w-full" />
          ) : tonight ? (
            <PickCard pick={tonight} onSaved={load} big />
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
              Tonight&apos;s pick lands at 7pm.
              <Button size="sm" onClick={() => pick(false)} disabled={picking}>
                {picking && <Loader2Icon className="size-4 animate-spin" />}
                Pick one now
              </Button>
            </div>
          )}
          {tonight && !tonight.rating && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => pick(true)} disabled={picking}>
              {picking ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
              Not feeling it, swap
            </Button>
          )}
        </section>

        {past.length > 0 && (
          <section id="past-picks" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Past picks</h2>
            {past.map((p) => (
              <PickCard key={p.id} pick={p} onSaved={load} />
            ))}
          </section>
        )}

        <ProfileEditor profile={profile} onSaved={setProfile} />
      </div>
    </div>
  );
}

function PickCard({ pick, onSaved, big = false }: { pick: ReadingPick; onSaved: () => void; big?: boolean }) {
  const [rating, setRating] = useState<ReadingRating | null>(pick.rating);
  const [feedback, setFeedback] = useState(pick.feedback ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRating(pick.rating);
    setFeedback(pick.feedback ?? "");
  }, [pick.rating, pick.feedback]);

  const save = async (body: { rating?: ReadingRating | null; feedback?: string }) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reading-picks/${pick.id}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      onSaved();
      if (body.feedback !== undefined) toast.success("Saved. Cael is updating your interests.");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const thumb = (r: ReadingRating) => {
    const next = rating === r ? null : r;
    setRating(next);
    save({ rating: next });
  };

  return (
    <article className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={pick.url}
            target="_blank"
            rel="noreferrer"
            className={cn("font-medium underline-offset-4 hover:underline", big ? "text-base" : "text-sm")}
          >
            {pick.title}
            <ExternalLinkIcon className="ml-1 inline size-3.5 text-muted-foreground" />
          </a>
          <div className="text-xs text-muted-foreground">
            {pick.source} · {pick.date}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Liked it"
            aria-pressed={rating === "up"}
            onClick={() => thumb("up")}
            className={cn(rating === "up" && "bg-muted text-foreground")}
          >
            <ThumbsUpIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Didn't like it"
            aria-pressed={rating === "down"}
            onClick={() => thumb("down")}
            className={cn(rating === "down" && "bg-muted text-foreground")}
          >
            <ThumbsDownIcon className="size-4" />
          </Button>
        </div>
      </div>
      {big && (
        <>
          <p className="text-sm">{pick.why}</p>
          <p className="text-sm text-muted-foreground">
            <PenLineIcon className="mr-1 inline size-3.5" />
            After: {pick.prompt}
          </p>
        </>
      )}
      {(big || rating || pick.feedback) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What did you think? What do you want more or less of?"
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saving || feedback === (pick.feedback ?? "")}
            onClick={() => save({ feedback })}
          >
            {saving && <Loader2Icon className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </article>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: string; onSaved: (p: string) => void }) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(profile), [profile]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/reading-picks/profile", { method: "PUT", body: JSON.stringify({ content: draft }) });
      if (!res.ok) throw new Error();
      onSaved((await res.json()).profile);
      toast.success("Interest profile saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="interest-profile" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">What Cael thinks you&apos;re into</h2>
      <p className="text-xs text-muted-foreground">
        Rewritten from your ratings, tweets, articles and books. Lines you add yourself are always kept.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        placeholder="Empty until the first pick. Add anything you already know you want to read about."
        className="font-mono text-xs"
      />
      <Button size="sm" variant="outline" className="w-fit" disabled={saving || draft === profile} onClick={save}>
        {saving && <Loader2Icon className="size-4 animate-spin" />}
        Save
      </Button>
    </section>
  );
}
