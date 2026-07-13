"use client";

import { useEffect, useState } from "react";
import {
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
  TrendingUpIcon,
  HeartPulseIcon,
  UsersIcon,
  SparklesIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { CaelAvatar } from "@/app/_components/cael-avatar";
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

interface VisionStatement {
  id: number;
  kind: string;
  title: string | null;
  content: string | null;
}

interface MeasureRow {
  category: string;
  recorded_date: string;
  data: Record<string, number | string | undefined>;
}

const SECTIONS: { tab: HomeTarget; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "chat", label: "Chat", icon: MessageCircleIcon },
  { tab: "tasks", label: "Tasks", icon: ListTodoIcon },
  { tab: "notes", label: "Notes", icon: FileTextIcon },
  { tab: "lists", label: "Lists", icon: ListChecksIcon },
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon },
  { tab: "dreams", label: "Dreams", icon: BrainIcon },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon },
  { tab: "media", label: "Media", icon: ImageIcon },
  { tab: "measures", label: "Measures", icon: GaugeIcon },
  { tab: "vision", label: "Vision", icon: TelescopeIcon },
];

/** Match a pillar statement to an icon + the section it should open. */
function pillarMeta(title: string): { icon: typeof BookOpenIcon; target: HomeTarget } {
  const t = title.toLowerCase();
  if (/invest|saving|money|million|spend/.test(t)) return { icon: TrendingUpIcon, target: "measures" };
  if (/mood|body|physical|fitness|health|energy|sleep/.test(t)) return { icon: HeartPulseIcon, target: "measures" };
  if (/loved|friend|family|relationship|circle|people/.test(t)) return { icon: UsersIcon, target: "vision" };
  return { icon: SparklesIcon, target: "vision" };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ onNavigate }: { onNavigate: (tab: HomeTarget) => void }) {
  const [statements, setStatements] = useState<VisionStatement[] | null>(null);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [savings, setSavings] = useState<{ total: number; goal: number | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [visionRes, todosRes, measuresRes] = await Promise.all([
          fetch("/api/vision?kind=statement"),
          fetch("/api/todos?limit=200"),
          fetch("/api/measures?category=savings_snapshot&limit=1"),
        ]);
        if (visionRes.ok) setStatements(await visionRes.json());
        else setStatements([]);
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
        setStatements([]);
      }
    })();
  }, []);

  const loading = statements === null;
  const hero =
    statements?.find((s) => s.title?.toLowerCase().includes("freedom")) ?? statements?.[0];
  const pillars = (statements ?? []).filter((s) => s.id !== hero?.id && s.title).slice(0, 3);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="mx-auto max-w-2xl px-6 py-8 pb-24 lg:pb-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => onNavigate("chat")}
            className="flex items-center gap-2.5 group"
            aria-label="Open chat with Cael"
          >
            <CaelAvatar size={36} />
            <div className="text-left">
              <p className="text-sm font-medium leading-tight group-hover:text-primary transition-colors">Cael</p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          </button>
          <ModeToggle />
        </div>

        {/* Truest vision — hero */}
        {loading ? (
          <div className="space-y-3 mb-10">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-5 w-3/4 rounded-lg" />
          </div>
        ) : (
          <button
            onClick={() => onNavigate("vision")}
            className="block w-full text-left mb-10 group"
            aria-label="Open vision"
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
              {greeting()}, Berto — your truest vision
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight group-hover:text-primary transition-colors">
              {hero?.title ?? "Freedom, Happiness, Health"}
            </h1>
            {hero?.content && (
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-lg">{hero.content}</p>
            )}
          </button>
        )}

        {/* Pillars */}
        {pillars.length > 0 && (
          <div className="mb-10">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              The pillars
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {pillars.map((p) => {
                const { icon: Icon, target } = pillarMeta(p.title!);
                const isInvest = target === "measures" && /invest|million|saving/.test(p.title!.toLowerCase());
                return (
                  <button key={p.id} onClick={() => onNavigate(target)} className="text-left">
                    <Card className="gap-2 h-full rounded-xl px-4 py-3.5 shadow-none hover:border-primary/40 transition-colors">
                      <Icon className="size-4 text-primary" />
                      <p className="text-sm font-medium leading-snug">{p.title}</p>
                      {isInvest && savings ? (
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
                      ) : (
                        p.content && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-auto line-clamp-2">
                            {p.content}
                          </p>
                        )
                      )}
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
          {SECTIONS.map(({ tab, label, icon: Icon }) => (
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
              </Card>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
