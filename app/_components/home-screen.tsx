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
import { PinButton } from "@/app/_components/pin-button";
import { WorkoutChart, type WorkoutLog } from "@/app/_components/workout-chart";
import { TrainingLog } from "@/app/_components/training-log";
import { DailyJournal } from "@/app/_components/daily-journal";
import { GoalCelebration } from "@/app/_components/goal-celebration";
import { ScorecardCard } from "@/app/_components/scorecard-card";
import { PrinciplesDoc } from "@/app/_components/principles-doc";
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
 * Daily hero — one of humanity's triumphant moments per day, rotating by day of year.
 * Images are public-domain / freely licensed Wikimedia Commons files (URLs verified);
 * `wiki` is the English Wikipedia article the caption links to.
 */
const WM = "https://upload.wikimedia.org/wikipedia/commons/";
const DAILY_ART: { url: string; moment: string; year: string; wiki: string }[] = [
  { url: `${WM}thumb/4/41/A_Man_on_the_Moon%2C_AS11-40-5903_%28cropped%29.jpg/1920px-A_Man_on_the_Moon%2C_AS11-40-5903_%28cropped%29.jpg`, moment: "Humans walk on the Moon", year: "1969", wiki: "Apollo_11" },
  { url: `${WM}e/e7/Great_Pyramid_of_Giza_-_Pyramid_of_Khufu.jpg`, moment: "The Great Pyramid rises at Giza", year: "c. 2560 BC", wiki: "Great_Pyramid_of_Giza" },
  { url: `${WM}thumb/8/86/First_flight2.jpg/1920px-First_flight2.jpg`, moment: "The Wright brothers fly at Kitty Hawk", year: "1903", wiki: "Wright_Flyer" },
  { url: `${WM}thumb/e/ee/Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg/1920px-Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg`, moment: "Magna Carta is sealed at Runnymede", year: "1215", wiki: "Magna_Carta" },
  { url: `${WM}thumb/a/a8/NASA-Apollo8-Dec24-Earthrise.jpg/1920px-NASA-Apollo8-Dec24-Earthrise.jpg`, moment: "Earthrise, seen from lunar orbit", year: "1968", wiki: "Earthrise" },
  { url: `${WM}3/3c/Stonehenge2007_07_30.jpg`, moment: "Stonehenge's great sarsens are raised", year: "c. 2500 BC", wiki: "Stonehenge" },
  { url: `${WM}b/b6/Gutenberg_Bible%2C_Lenox_Copy%2C_New_York_Public_Library%2C_2009._Pic_01.jpg`, moment: "Gutenberg prints the Bible", year: "c. 1455", wiki: "Gutenberg_Bible" },
  { url: `${WM}thumb/5/5f/Spirit_Of_St_Louis2.jpg/1920px-Spirit_Of_St_Louis2.jpg`, moment: "Lindbergh flies the Atlantic solo", year: "1927", wiki: "Spirit_of_St._Louis" },
  { url: `${WM}d/da/The_Parthenon_in_Athens.jpg`, moment: "The Parthenon is completed", year: "432 BC", wiki: "Parthenon" },
  { url: `${WM}thumb/1/1d/Sistine_Chapel_ceiling_02_%28brightened%29.jpg/1920px-Sistine_Chapel_ceiling_02_%28brightened%29.jpg`, moment: "Michelangelo finishes the Sistine ceiling", year: "1512", wiki: "Sistine_Chapel_ceiling" },
  { url: `${WM}thumb/f/f3/Curiosity_Self-Portrait_at_%27Big_Sky%27_Drilling_Site.jpg/1920px-Curiosity_Self-Portrait_at_%27Big_Sky%27_Drilling_Site.jpg`, moment: "Curiosity lands on Mars", year: "2012", wiki: "Curiosity_(rover)" },
  { url: `${WM}thumb/d/de/Colosseo_2020.jpg/1920px-Colosseo_2020.jpg`, moment: "The Colosseum opens in Rome", year: "AD 80", wiki: "Colosseum" },
  { url: `${WM}thumb/5/5d/East_and_West_Shaking_hands_at_the_laying_of_last_rail_Union_Pacific_Railroad_-_Restoration.jpg/1920px-East_and_West_Shaking_hands_at_the_laying_of_last_rail_Union_Pacific_Railroad_-_Restoration.jpg`, moment: "The golden spike joins a continent", year: "1869", wiki: "First_transcontinental_railroad" },
  { url: `${WM}thumb/c/c7/Cattedrale_di_Santa_Maria_del_Fiore_%E2%80%93_Il_Duomo_di_Firenze.jpg/1920px-Cattedrale_di_Santa_Maria_del_Fiore_%E2%80%93_Il_Duomo_di_Firenze.jpg`, moment: "Brunelleschi's dome crowns Florence", year: "1436", wiki: "Florence_Cathedral" },
  { url: `${WM}thumb/a/a6/Endurance_under_full_sail_Frank_Hurley_State_Library_NSW_a090012h.jpg/1920px-Endurance_under_full_sail_Frank_Hurley_State_Library_NSW_a090012h.jpg`, moment: "Shackleton brings all 28 men home", year: "1916", wiki: "Imperial_Trans-Antarctic_Expedition" },
  { url: `${WM}4/4a/Hagia_Sophia_%28228968325%29.jpeg`, moment: "Hagia Sophia is completed", year: "537", wiki: "Hagia_Sophia" },
  { url: `${WM}thumb/2/23/Rosetta_Stone.JPG/1920px-Rosetta_Stone.JPG`, moment: "Champollion cracks the Rosetta Stone", year: "1822", wiki: "Rosetta_Stone" },
  { url: `${WM}thumb/4/4a/Hubble_2009_close-up_2.jpg/1920px-Hubble_2009_close-up_2.jpg`, moment: "Hubble opens its eye on the universe", year: "1990", wiki: "Hubble_Space_Telescope" },
  { url: `${WM}thumb/f/f0/Brooklyn_Bridge_and_the_Lower_Manhattan_skyline_from_Pebble_Beach%2C_New_York.jpg/1920px-Brooklyn_Bridge_and_the_Lower_Manhattan_skyline_from_Pebble_Beach%2C_New_York.jpg`, moment: "The Brooklyn Bridge opens", year: "1883", wiki: "Brooklyn_Bridge" },
  { url: `${WM}4/41/Angkor_Wat.jpg`, moment: "Angkor Wat is completed", year: "c. 1150", wiki: "Angkor_Wat" },
  { url: `${WM}thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/1920px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg`, moment: "The Golden Gate Bridge opens", year: "1937", wiki: "Golden_Gate_Bridge" },
  { url: `${WM}c/c8/2017_Aerial_view_Hoover_Dam_4774.jpg`, moment: "Hoover Dam holds back the Colorado", year: "1936", wiki: "Hoover_Dam" },
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
        className="flex items-center group"
        aria-label="Open chat with Cael"
      >
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
              "text-xs leading-tight",
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
            alt={`${art.moment}, ${art.year}`}
            onError={() => setArtFailed(true)}
            className="w-full h-52 sm:h-72 lg:h-80 object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute inset-x-0 top-0 mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
            {header(true)}
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-6 pb-3 text-xs font-medium text-white/95">
            <a
              href={`https://en.wikipedia.org/wiki/${art.wiki}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-white hover:underline underline-offset-2"
              title="Read about it on Wikipedia"
            >
              {art.moment} · {art.year}
              <ArrowUpRightIcon className="size-3 opacity-80" />
            </a>
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

        {/* Today's meal — Mediterranean/Italian pick, informed by prior thumbs up/down */}
        {todayMeal && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Training log
          </p>
          <TrainingLog />
        </div>

        {/* Daily journal — 250 words of whatever is on his mind, right under the
            training log. The word target lives in daily-journal.tsx. */}
        <DailyJournal />

        {/* Training — 5 standard workouts, indexed to % change from the first logged number */}
        {workoutLogs.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Training
            </p>
            <Card className="rounded-3xl px-5 py-5 shadow-none">
              <WorkoutChart logs={workoutLogs} />
            </Card>
          </div>
        )}

      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* Principles — his own Notion-style page under the dashboard. It opens
            on the four behaviours that used to be a hardcoded mantra line here. */}
        <PrinciplesDoc />
      </div>
      </div>
    </div>
    </>
  );
}
