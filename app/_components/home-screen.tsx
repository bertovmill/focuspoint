"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  MessageCircleIcon,
  ListTodoIcon,
  FileTextIcon,
  ListChecksIcon,
  BookOpenIcon,
  BrainIcon,
  CalendarClockIcon,
  ImageIcon,
  GaugeIcon,
  TelescopeIcon,
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
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { PinButton } from "@/app/_components/pin-button";
import { cn } from "@/lib/utils";

export type HomeTarget =
  | "chat"
  | "tasks"
  | "notes"
  | "lists"
  | "journal-templates"
  | "dreams"
  | "schedule"
  | "media"
  | "measures"
  | "vision";

interface MeasureRow {
  category: string;
  recorded_date: string;
  data: Record<string, number | string | undefined>;
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
  { label: "Family", icon: UsersThreeIcon, target: "vision" },
  { label: "Craft", icon: PenNibIcon, target: "vision" },
  { label: "Money", icon: CoinsIcon, target: "measures" },
  { label: "Community", icon: HandsClappingIcon, target: "vision" },
  { label: "Adventure", icon: CompassIcon, target: "dreams" },
  { label: "Service", icon: HandHeartIcon, target: "vision" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ onNavigate }: { onNavigate: (tab: HomeTarget) => void }) {
  // Vision text per form of wealth, keyed by lowercased form label. Sourced from
  // vision statements whose Area/title matches the form name. null = still loading.
  const [formVisions, setFormVisions] = useState<Record<string, string> | null>(null);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [savings, setSavings] = useState<{ total: number; goal: number | null } | null>(null);
  const [artFailed, setArtFailed] = useState(false);
  const art = DAILY_ART[dayOfYear(new Date()) % DAILY_ART.length];

  useEffect(() => {
    (async () => {
      try {
        const [visionRes, todosRes, measuresRes] = await Promise.all([
          fetch("/api/vision?kind=statement"),
          fetch("/api/todos?limit=200"),
          fetch("/api/measures?category=savings_snapshot&limit=1"),
        ]);
        if (visionRes.ok) {
          const rows: { title: string | null; content: string | null }[] = await visionRes.json();
          const map: Record<string, string> = {};
          for (const row of rows) {
            const key = row.title?.trim().toLowerCase();
            // Rows are newest-first; keep the first (most recent) statement per form.
            if (key && row.content && !(key in map)) map[key] = row.content;
          }
          setFormVisions(map);
        } else {
          setFormVisions({});
        }
        if (todosRes.ok) {
          const todos: { completed: boolean }[] = await todosRes.json();
          setOpenTasks(todos.filter((t) => !t.completed).length);
        }
        if (measuresRes.ok) {
          const rows: MeasureRow[] = await measuresRes.json();
          const latest = rows[0];
          const total = Number(latest?.data?.total_savings);
          if (Number.isFinite(total)) {
            const goal = Number(latest?.data?.goal);
            setSavings({ total, goal: Number.isFinite(goal) && goal > 0 ? goal : null });
          }
        }
      } catch {
        setFormVisions({});
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
    <div className="flex-1 overflow-y-auto min-h-0">
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
          <div className="absolute inset-x-0 top-0 mx-auto max-w-2xl px-6 py-5 flex items-center justify-between">
            {header(true)}
          </div>
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-6 pb-3 text-xs font-medium text-white/95">
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

      <div className={cn("mx-auto max-w-2xl px-6 pb-24 lg:pb-12", artFailed ? "py-8" : "pt-10")}>
        {/* Header falls back into the page flow when the artwork fails to load */}
        {artFailed && <div className="flex items-center justify-between mb-10">{header(false)}</div>}

        {/* 8 forms of wealth */}
        <div className="mb-10">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
            {greeting()}, Berto — your 8 forms of wealth
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WEALTH_FORMS.map(({ label, icon: Icon, target }) => (
              <button key={label} onClick={() => onNavigate(target)} className="text-left">
                <Card className="gap-2 h-full rounded-xl px-4 py-3.5 shadow-none hover:border-primary/40 transition-colors">
                  <Icon size={22} weight="duotone" className="text-primary" />
                  <p className="text-sm font-medium leading-snug">{label}</p>
                  {label === "Money" && savings && (
                    <div className="mt-auto">
                      {savings.goal && (
                        <div
                          className="h-1.5 rounded-full overflow-hidden mb-1"
                          style={{ background: "var(--chart-track)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (savings.total / savings.goal) * 100)}%`,
                              background: "var(--chart-essential)",
                            }}
                          />
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        ${Math.round(savings.total).toLocaleString()}
                        {savings.goal ? ` of $${(savings.goal / 1000).toFixed(0)}K` : ""}
                      </p>
                    </div>
                  )}
                </Card>
              </button>
            ))}
          </div>
        </div>

        {/* Vision — the ideal state for each form of wealth */}
        <div className="mb-10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Vision
          </p>
          {formVisions === null ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {WEALTH_FORMS.map(({ label, icon: Icon }) => {
                const vision = formVisions[label.toLowerCase()];
                return (
                  <button
                    key={label}
                    onClick={() => onNavigate("vision")}
                    className="flex w-full items-start gap-3 text-left group"
                    aria-label={vision ? `${label} vision` : `Write your vision for ${label}`}
                  >
                    <Icon size={18} weight="duotone" className="text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                        {label}
                      </p>
                      {vision ? (
                        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{vision}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground/60 italic leading-relaxed mt-0.5">
                          Write your vision for {label}…
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily behaviors mantra */}
        <p className="text-xs text-muted-foreground mb-10 leading-relaxed">
          Today that means: <span className="text-foreground">save</span> ·{" "}
          <span className="text-foreground">improve the service</span> ·{" "}
          <span className="text-foreground">go above and beyond</span> ·{" "}
          <span className="text-foreground">skip the AI noise</span>
        </p>

        {/* Sections */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Go to
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SECTIONS.map(({ tab, label, icon: Icon, hotkey }) => (
            <button key={tab} onClick={() => onNavigate(tab)} className="text-left">
              <Card
                className={cn(
                  "flex-row items-center gap-3 rounded-xl px-4 py-3 shadow-none",
                  "hover:border-primary/40 transition-colors",
                )}
              >
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1">{label}</span>
                {tab === "tasks" && openTasks !== null && openTasks > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{openTasks}</span>
                )}
                <kbd className="hidden sm:inline-flex items-center justify-center size-5 rounded border border-border text-[10px] font-medium text-muted-foreground shrink-0">
                  {hotkey}
                </kbd>
              </Card>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
