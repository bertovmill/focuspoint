"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRightIcon,
  MessageCircleIcon,
  ListTodoIcon,
  FileTextIcon,
  ListChecksIcon,
  BookOpenIcon,
  BrainIcon,
  BrushIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  ImageIcon,
  GaugeIcon,
  TelescopeIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from "lucide-react";
import {
  BarbellIcon,
  CoinsIcon,
  CompassIcon,
  HandHeartIcon,
  HandsClappingIcon,
  PenNibIcon,
  PlantIcon,
  UsersThreeIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { PinButton } from "@/app/_components/pin-button";
import { WorkoutChart, type WorkoutLog } from "@/app/_components/workout-chart";
import { TrainingLog } from "@/app/_components/training-log";
import { GoalCelebration } from "@/app/_components/goal-celebration";
import { ScorecardCard } from "@/app/_components/scorecard-card";
import { DailyJournal } from "@/app/_components/daily-journal";
import { currentSlot } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export type HomeTarget =
  | "chat"
  | "tasks"
  | "notes"
  | "lists"
  | "calendar"
  | "journal-templates"
  | "dreams"
  | "schedule"
  | "media"
  | "sketches"
  | "measures"
  | "vision"
  | "family";

interface MeasureRow {
  category: string;
  recorded_date: string;
  data: Record<string, number | string | undefined>;
}

interface ReadingLog {
  book_title: string;
  pages: number;
  logged_date: string;
  is_estimate: boolean;
}

interface GithubPr {
  id: number;
  repo: string;
  merged_at: string;
}

interface Meal {
  id: number;
  meal_date: string;
  slot: string | null;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  feedback: "up" | "down" | null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const SECTIONS: { tab: HomeTarget; label: string; icon: typeof BookOpenIcon; hotkey: string }[] = [
  { tab: "chat", label: "Chat", icon: MessageCircleIcon, hotkey: "1" },
  { tab: "tasks", label: "Tasks", icon: ListTodoIcon, hotkey: "2" },
  { tab: "notes", label: "Notes", icon: FileTextIcon, hotkey: "3" },
  { tab: "lists", label: "Lists", icon: ListChecksIcon, hotkey: "4" },
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon, hotkey: "5" },
  { tab: "dreams", label: "Dreams", icon: BrainIcon, hotkey: "6" },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon, hotkey: "7" },
  { tab: "media", label: "Media", icon: ImageIcon, hotkey: "8" },
  { tab: "measures", label: "Measures", icon: GaugeIcon, hotkey: "9" },
  { tab: "vision", label: "Vision", icon: TelescopeIcon, hotkey: "0" },
  { tab: "sketches", label: "Sketches", icon: BrushIcon, hotkey: "s" },
  { tab: "calendar", label: "Calendar", icon: CalendarDaysIcon, hotkey: "g" },
];

/**
 * Daily artwork — one piece of "what it's all for" per day, rotating by day of year.
 * All images hand-verified Unsplash photos (hotlinking per Unsplash guidelines).
 * `place` (optional) is a Google Maps query — set it only for captions that name a
 * verifiable real location; those captions render as a maps link on the hero.
 */
const DAILY_ART: { url: string; caption: string; place?: string }[] = [
  { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80&fm=jpg", caption: "Peaks above the clouds" },
  { url: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1600&q=80&fm=jpg", caption: "Golden hour with good people" },
  { url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80&fm=jpg", caption: "Dinner done right" },
  { url: "https://images.unsplash.com/photo-1547153760-18fc86324498?w=1600&q=80&fm=jpg", caption: "Lost in the dance" },
  { url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80&fm=jpg", caption: "Lago di Braies, Dolomites", place: "Lago di Braies, Braies, Italy" },
  { url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1600&q=80&fm=jpg", caption: "The peloton rolls" },
  { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80&fm=jpg", caption: "Ocean morning" },
  { url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=80&fm=jpg", caption: "Shoulder to shoulder" },
  { url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1600&q=80&fm=jpg", caption: "Butterfly, full flight" },
  { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&q=80&fm=jpg", caption: "A sky full of stars" },
  { url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80&fm=jpg", caption: "A table waiting for friends" },
  { url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1600&q=80&fm=jpg", caption: "On your marks" },
  { url: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=80&fm=jpg", caption: "Out on the water" },
  { url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=80&fm=jpg", caption: "Confetti night" },
  { url: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=1600&q=80&fm=jpg", caption: "Still water, clear head" },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

/** The 8 forms of wealth — Berto's life philosophy. Icon + the section each card opens. */
const WEALTH_FORMS: { label: string; icon: PhosphorIcon; target: HomeTarget }[] = [
  { label: "Growth", icon: PlantIcon, target: "vision" },
  { label: "Wellness", icon: BarbellIcon, target: "measures" },
  { label: "Family", icon: UsersThreeIcon, target: "family" },
  { label: "Craft", icon: PenNibIcon, target: "vision" },
  { label: "Money", icon: CoinsIcon, target: "measures" },
  { label: "Community", icon: HandsClappingIcon, target: "vision" },
  { label: "Adventure", icon: CompassIcon, target: "dreams" },
  { label: "Service", icon: HandHeartIcon, target: "vision" },
];

export function HomeScreen({ onNavigate }: { onNavigate: (tab: HomeTarget) => void }) {
  // Per-form numeric goals (vision_items kind="goal", title = form label, content = target number).
  const [formGoals, setFormGoals] = useState<Record<string, { id: number; target: number; achieved: boolean }>>({});
  // Queue of forms whose goal was just crossed this session — shown one at a time as a full-screen celebration.
  const [celebrationQueue, setCelebrationQueue] = useState<{ label: string; targetLabel: string }[]>([]);
  const [todayMeal, setTodayMeal] = useState<Meal | null | undefined>(undefined);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [readingLogs, setReadingLogs] = useState<ReadingLog[]>([]);
  const [githubPrs, setGithubPrs] = useState<GithubPr[]>([]);
  const [savingsHistory, setSavingsHistory] = useState<MeasureRow[]>([]);
  const [memories, setMemories] = useState<{ created_at: string }[]>([]);
  const [communityContacts, setCommunityContacts] = useState<{ created_at: string }[]>([]);
  const [trips, setTrips] = useState<MeasureRow[]>([]);
  const [thankYous, setThankYous] = useState<{ thanked_date: string }[]>([]);
  const [artFailed, setArtFailed] = useState(false);
  const art = DAILY_ART[dayOfYear(new Date()) % DAILY_ART.length];

  const handleMealFeedback = async (feedback: "up" | "down") => {
    if (!todayMeal) return;
    const prev = todayMeal;
    const next = todayMeal.feedback === feedback ? null : feedback;
    setTodayMeal({ ...todayMeal, feedback: next });
    try {
      const res = await fetch(`/api/meals/${todayMeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTodayMeal(prev);
      toast.error("Couldn't save feedback.");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [goalRes, measuresRes, mealsRes, workoutsRes, readingRes, memoriesRes, communityRes, tripsRes, thanksRes, githubRes] =
          await Promise.all([
            fetch("/api/vision?kind=goal"),
            fetch("/api/measures?category=savings_snapshot&limit=400"),
            fetch("/api/meals?limit=3"),
            fetch("/api/workouts"),
            fetch("/api/reading"),
            fetch("/api/memories?limit=500"),
            fetch("/api/community"),
            fetch("/api/measures?category=trips&limit=500"),
            fetch("/api/thanks?limit=500"),
            fetch("/api/github"),
          ]);
        if (goalRes.ok) {
          const rows: { id: number; title: string | null; content: string | null; achieved: boolean }[] = await goalRes.json();
          const map: Record<string, { id: number; target: number; achieved: boolean }> = {};
          for (const row of rows) {
            const key = row.title?.trim().toLowerCase();
            const target = Number(row.content);
            // Rows are newest-first; keep the first (most recent/active) goal per form.
            if (key && Number.isFinite(target) && target > 0 && !(key in map)) {
              map[key] = { id: row.id, target, achieved: row.achieved };
            }
          }
          setFormGoals(map);
        }
        if (measuresRes.ok) {
          const rows: MeasureRow[] = await measuresRes.json();
          setSavingsHistory(rows);
        }
        if (mealsRes.ok) {
          const meals: Meal[] = await mealsRes.json();
          // Three recommendations a day now — show whichever sitting is live.
          const todays = meals.filter((m) => isToday(m.meal_date));
          const slot = currentSlot();
          setTodayMeal(todays.find((m) => m.slot === slot) ?? todays[0] ?? null);
        } else {
          setTodayMeal(null);
        }
        if (workoutsRes.ok) setWorkoutLogs(await workoutsRes.json());
        if (readingRes.ok) setReadingLogs(await readingRes.json());
        if (githubRes.ok) setGithubPrs(await githubRes.json());
        if (memoriesRes.ok) setMemories(await memoriesRes.json());
        if (communityRes.ok) setCommunityContacts(await communityRes.json());
        if (tripsRes.ok) setTrips(await tripsRes.json());
        if (thanksRes.ok) setThankYous(await thanksRes.json());
      } catch {
        setTodayMeal(null);
      }
    })();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const section = SECTIONS.find((s) => s.hotkey === e.key);
      if (section) {
        e.preventDefault();
        onNavigate(section.tab);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigate]);

  // One sparkline per form of wealth, all sharing the Month/Year/Decade toggle above the grid.
  // Growth/Wellness/Money/Family/Community/Adventure/Service reuse data already tracked elsewhere
  // (books, workouts, savings, memories, merged PRs, Luma subscribers, trips, thank-yous).
  const wealthSeries = useMemo(() => {
    const series: Record<string, { points: { t: number; value: number }[]; mode: "sum" | "last"; unit: string }> = {
      growth: {
        // Books finished, not pages — one point per reading_logs row. Page counts are
        // still recorded on each row, they just aren't what the goal is measured in.
        points: readingLogs.map((l) => ({ t: new Date(l.logged_date).getTime(), value: 1 })),
        mode: "sum",
        unit: "books",
      },
      wellness: {
        points: workoutLogs
          .filter((l) => l.exercise === "gym_hours")
          .map((l) => ({ t: new Date(l.logged_date).getTime(), value: Number(l.value) })),
        mode: "sum",
        unit: "hours",
      },
      money: {
        points: savingsHistory
          .map((m) => ({ t: new Date(m.recorded_date).getTime(), value: Number(m.data?.total_savings) }))
          .filter((p) => Number.isFinite(p.value)),
        mode: "last",
        unit: "$",
      },
      family: {
        points: memories.map((m) => ({ t: new Date(m.created_at).getTime(), value: 1 })),
        mode: "sum",
        unit: "memories",
      },
      craft: {
        // Merged pull requests, mirrored from GitHub by lib/github-sync.ts. Dated by
        // merge, not open: shipping is the signal. This replaced a count of thoughts
        // tagged "craft", which was only ever standing in until real tracking existed.
        points: githubPrs.map((p) => ({ t: new Date(p.merged_at).getTime(), value: 1 })),
        mode: "sum",
        unit: "PRs",
      },
      community: {
        points: communityContacts.map((c) => ({ t: new Date(c.created_at).getTime(), value: 1 })),
        mode: "sum",
        unit: "subscribers",
      },
      adventure: {
        points: trips.map((t) => ({ t: new Date(t.recorded_date).getTime(), value: 1 })),
        mode: "sum",
        unit: "trips",
      },
      service: {
        points: thankYous.map((t) => ({ t: new Date(t.thanked_date).getTime(), value: 1 })),
        mode: "sum",
        unit: "thank-yous",
      },
    };
    return series;
  }, [readingLogs, workoutLogs, savingsHistory, githubPrs, memories, communityContacts, trips, thankYous]);

  // All-time progress toward each form's goal — independent of the Month/Year/Decade toggle above.
  const wealthTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, { points, mode }] of Object.entries(wealthSeries)) {
      if (points.length === 0) continue;
      out[key] =
        mode === "sum" ? points.reduce((s, p) => s + p.value, 0) : points[points.length - 1].value;
    }
    return out;
  }, [wealthSeries]);

  // Fire a one-time full-screen celebration the moment a form's all-time total first crosses its goal.
  useEffect(() => {
    for (const [key, goal] of Object.entries(formGoals)) {
      if (goal.achieved) continue;
      const total = wealthTotals[key];
      if (total === undefined || total < goal.target) continue;
      const form = WEALTH_FORMS.find((f) => f.label.toLowerCase() === key);
      const unit = wealthSeries[key]?.unit ?? "";
      setFormGoals((prev) => ({ ...prev, [key]: { ...prev[key], achieved: true } }));
      setCelebrationQueue((prev) => [
        ...prev,
        { label: form?.label ?? key, targetLabel: `${goal.target.toLocaleString()} ${unit}`.trim() },
      ]);
      fetch(`/api/vision/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achieved: true }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formGoals, wealthTotals]);

  const header = (onImage: boolean) => (
    <>
      <button
        onClick={() => onNavigate("chat")}
        className="flex items-center gap-2.5 group"
        aria-label="Open chat with Cael"
      >
        <CaelAvatar size={36} />
        <div className="text-left">
          <p
            className={cn(
              "text-sm font-medium leading-tight transition-colors",
              onImage ? "text-white drop-shadow-sm group-hover:text-white/80" : "group-hover:text-primary",
            )}
          >
            Cael
          </p>
          <p
            className={cn(
              "text-[11px] leading-tight",
              onImage ? "text-white/75 drop-shadow-sm" : "text-muted-foreground",
            )}
          >
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-1">
        <PinButton
          iconClassName="size-3.5"
          className={onImage ? "text-white/80 hover:text-white hover:bg-white/15" : undefined}
        />
        <ModeToggle className={onImage ? "text-white/80 hover:text-white hover:bg-white/15" : undefined} />
      </div>
    </>
  );

  return (
    <>
      {celebrationQueue[0] && (
        <GoalCelebration
          formLabel={celebrationQueue[0].label}
          targetLabel={celebrationQueue[0].targetLabel}
          onClose={() => setCelebrationQueue((prev) => prev.slice(1))}
        />
      )}
    <div className="flex-1 overflow-y-auto min-h-0 pb-[var(--mobile-nav-h)] lg:pb-0">
      {/* Daily artwork — full-bleed hero with the header overlaid */}
      {!artFailed && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.url}
            alt={art.caption}
            onError={() => setArtFailed(true)}
            className="w-full h-52 sm:h-72 lg:h-80 object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute inset-x-0 top-0 mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
            {header(true)}
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-3 text-xs font-medium text-white/95">
            {art.place ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(art.place)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-white hover:underline underline-offset-2"
                title={`Open ${art.place} in Google Maps`}
              >
                {art.caption}
                <ArrowUpRightIcon className="size-3 opacity-80" />
              </a>
            ) : (
              art.caption
            )}
          </div>
        </div>
      )}

      <div className={cn("pb-24 lg:pb-12", artFailed ? "py-8" : "pt-10")}>
      <div className="mx-auto max-w-6xl px-6">
        {/* Header falls back into the page flow when the artwork fails to load */}
        {artFailed && <div className="flex items-center justify-between mb-10">{header(false)}</div>}

        {/* The daily scorecard — "did I win today?". First thing on the page because
            it's the one block that's actionable at 7am. */}
        <ScorecardCard />

        {/* The day in his own words, directly under the numbers that scored it —
            the metrics say what happened, this says why. */}
        <DailyJournal />

        {/* Today's meal — Mediterranean/Italian pick, informed by prior thumbs up/down */}
        {todayMeal && (
          <div className="mb-6">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
              {todayMeal.slot ? `Today's ${todayMeal.slot}` : "Today's meal"}
            </p>
            <Card className="overflow-hidden py-0 gap-0 rounded-xl shadow-none">
              {todayMeal.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={todayMeal.image_url}
                  alt={todayMeal.name}
                  className="w-full aspect-[16/9] object-cover"
                />
              )}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{todayMeal.name}</p>
                    {todayMeal.cuisine && (
                      <Badge variant="outline" className="mt-1.5">
                        {todayMeal.cuisine}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant={todayMeal.feedback === "up" ? "default" : "outline"}
                      aria-label="Liked it"
                      onClick={() => handleMealFeedback("up")}
                    >
                      <ThumbsUpIcon className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={todayMeal.feedback === "down" ? "default" : "outline"}
                      aria-label="Not for me"
                      onClick={() => handleMealFeedback("down")}
                    >
                      <ThumbsDownIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                {todayMeal.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                    {todayMeal.description}
                  </p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Training — the plain-text log of what was actually done each day, above the
            numeric chart. The note says what happened; the chart says how much. */}
        <div className="mb-6">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Training log
          </p>
          <TrainingLog />
        </div>

        {/* Training — 5 standard workouts, indexed to % change from the first logged number */}
        {workoutLogs.length > 0 && (
          <div className="mb-6">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Training
            </p>
            <Card className="rounded-xl px-5 py-4 shadow-none">
              <WorkoutChart logs={workoutLogs} />
            </Card>
          </div>
        )}

      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* Daily behaviors mantra */}
        <p className="text-xs text-muted-foreground mb-10 leading-relaxed">
          Today that means: <span className="text-foreground">save</span> ·{" "}
          <span className="text-foreground">improve the service</span> ·{" "}
          <span className="text-foreground">go above and beyond</span> ·{" "}
          <span className="text-foreground">skip the AI noise</span>
        </p>

      </div>
      </div>
    </div>
    </>
  );
}
