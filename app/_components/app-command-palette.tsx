"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ActivityIcon,
  AppleIcon,
  AtSignIcon,
  BookMarkedIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BrushIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  DumbbellIcon,
  FileTextIcon,
  GaugeIcon,
  GlobeIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  ListChecksIcon,
  ListTodoIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquarePlusIcon,
  MoonIcon,
  PenLineIcon,
  PlusIcon,
  SunIcon,
  TelescopeIcon,
  UtensilsIcon,
} from "lucide-react";
import { CommandPalette, type PaletteGroup, type PaletteItem } from "@/app/_components/command-palette";
import { usePaletteHotkey } from "@/app/_components/use-palette-hotkey";
import { useThreads } from "@/app/_components/threads-provider";
import { noteTitleAndPreview } from "@/lib/note-title";
import { PUBLIC_HOST } from "@/lib/public-site";

type Icon = typeof HomeIcon;

// Every section, including the ones the nav rail no longer shows (Tasks, Vision,
// Measures, Calendar, …): the palette is how they stay one keystroke away.
const SECTIONS: { href: string; label: string; icon: Icon; keywords?: string[] }[] = [
  { href: "/", label: "Home", icon: HomeIcon, keywords: ["dashboard", "scorecard"] },
  { href: "/chat", label: "Chat", icon: MessageCircleIcon, keywords: ["cael"] },
  { href: "/notes", label: "Notes", icon: FileTextIcon, keywords: ["thoughts"] },
  { href: "/writing", label: "Writing", icon: PenLineIcon, keywords: ["posts", "articles", "blog"] },
  { href: "/writing?tab=tweets", label: "Tweets", icon: AtSignIcon, keywords: ["x", "twitter"] },
  { href: "/sketches", label: "Sketches", icon: BrushIcon, keywords: ["draw", "excalidraw"] },
  { href: "/training", label: "Training", icon: DumbbellIcon, keywords: ["workout", "run", "hyrox", "week"] },
  { href: "/training/workouts", label: "Workouts", icon: DumbbellIcon, keywords: ["bank", "templates"] },
  { href: "/meals", label: "Meals", icon: UtensilsIcon, keywords: ["food", "dinner", "groceries"] },
  { href: "/nutrition", label: "Nutrition", icon: AppleIcon, keywords: ["protein", "calories"] },
  { href: "/nutrition/plan", label: "Nutrition plan", icon: AppleIcon },
  { href: "/career", label: "Career", icon: BriefcaseIcon, keywords: ["work", "aucctus"] },
  { href: "/tasks", label: "Tasks", icon: ListTodoIcon, keywords: ["todos", "board", "canvas"] },
  { href: "/lists", label: "Lists", icon: ListChecksIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon, keywords: ["events"] },
  { href: "/journal", label: "Journal", icon: BookOpenIcon, keywords: ["templates"] },
  { href: "/schedule", label: "Schedule", icon: CalendarClockIcon, keywords: ["recurring"] },
  { href: "/media", label: "Media", icon: ImageIcon, keywords: ["photos", "images"] },
  { href: "/measures", label: "Measures", icon: GaugeIcon, keywords: ["metrics", "weight", "spend"] },
  { href: "/vision", label: "Vision", icon: TelescopeIcon, keywords: ["goals", "wealth", "2030"] },
  { href: "/family", label: "Family", icon: HeartIcon, keywords: ["memories"] },
  { href: "/manual", label: "Manual", icon: BookMarkedIcon, keywords: ["principles"] },
  { href: "/newsletter", label: "Newsletter", icon: MailIcon, keywords: ["subscribers"] },
  { href: "/traces", label: "Agent traces", icon: ActivityIcon, keywords: ["debug", "runs"] },
];

interface Index {
  notes: { id: number; content: string; created_at: string }[];
  todos: { id: number; title: string; in_progress?: boolean }[];
  sketches: { id: number; title: string | null; updated_at?: string }[];
  posts: { id: number; slug: string; title: string; status: "draft" | "published" }[];
  workouts: { slug: string; name: string }[];
}

async function getList<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

// Fetched when the palette opens, not before: five small reads, all of them
// already-existing routes. Sketches come back without their PNGs (`meta=1`).
async function loadIndex(): Promise<Index> {
  const [notes, todos, sketches, posts, workouts] = await Promise.all([
    getList<Index["notes"][number]>("/api/thoughts?limit=500"),
    getList<Index["todos"][number]>("/api/todos?limit=200"),
    getList<Index["sketches"][number]>("/api/sketches?meta=1"),
    getList<Index["posts"][number]>("/api/posts"),
    getList<Index["workouts"][number]>("/api/training/bank"),
  ]);
  return { notes, todos, sketches, posts, workouts };
}

function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", year: "numeric" });
}

/**
 * `/` or ⌘K anywhere in the app: jump to any section, or straight into a note,
 * task, chat, sketch, post or workout by name (Berto, 2026-10-11: "basically any
 * part of the site"). Idle it lists the sections, a few actions and the latest
 * chats; typing searches everything.
 */
export function AppCommandPalette({ onNewChat, onNewTask }: { onNewChat: () => void; onNewTask: () => void }) {
  const router = useRouter();
  const { threads, switchTo } = useThreads();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  usePaletteHotkey(setOpen);

  const [index, setIndex] = useState<Index | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadIndex()
      .then((next) => {
        if (!cancelled) setIndex(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const go = (href: string) => () => router.push(href);
    const dark = resolvedTheme === "dark";

    const sections: PaletteItem[] = SECTIONS.map((s) => ({
      id: `section:${s.href}`,
      label: s.label,
      icon: <s.icon />,
      keywords: s.keywords,
      onSelect: go(s.href),
    }));

    const actions: PaletteItem[] = [
      { id: "action:new-chat", label: "New chat", hint: "C", icon: <MessageSquarePlusIcon />, keywords: ["cael", "ask"], onSelect: onNewChat },
      { id: "action:new-task", label: "New task", hint: "N", icon: <PlusIcon />, keywords: ["todo", "add"], onSelect: onNewTask },
      {
        id: "action:theme",
        label: dark ? "Switch to light mode" : "Switch to dark mode",
        icon: dark ? <SunIcon /> : <MoonIcon />,
        keywords: ["theme", "appearance", "dark", "light"],
        onSelect: () => setTheme(dark ? "light" : "dark"),
      },
      {
        id: "action:public-site",
        label: `Open ${PUBLIC_HOST}`,
        icon: <GlobeIcon />,
        keywords: ["public", "website", "site"],
        external: true,
        onSelect: () => window.open(`https://${PUBLIC_HOST}`, "_blank", "noopener,noreferrer"),
      },
    ];

    const chats: PaletteItem[] = threads
      .filter((t) => t.title)
      .map((t) => ({
        id: `chat:${t.id}`,
        label: t.title,
        icon: <MessageCircleIcon />,
        onSelect: () => {
          switchTo(t.id);
          // The thread param keeps the chat page from opening a blank thread on arrival.
          router.push(`/chat?thread=${t.id}`);
        },
      }));

    const notes: PaletteItem[] = (index?.notes ?? []).map((n) => {
      const { title, preview } = noteTitleAndPreview(n.content);
      return {
        id: `note:${n.id}`,
        label: title,
        hint: shortDate(n.created_at),
        icon: <FileTextIcon />,
        // The first ~80 characters of the body, so a note is findable by what's in it.
        keywords: preview ? [preview.slice(0, 80)] : undefined,
        onSelect: go(`/notes?note=${n.id}`),
      };
    });

    const tasks: PaletteItem[] = (index?.todos ?? []).map((t) => ({
      id: `task:${t.id}`,
      label: t.title,
      hint: t.in_progress ? "In progress" : undefined,
      icon: <ListTodoIcon />,
      onSelect: go("/tasks"),
    }));

    const sketches: PaletteItem[] = (index?.sketches ?? []).map((s) => ({
      id: `sketch:${s.id}`,
      label: s.title?.trim() || "Untitled sketch",
      hint: shortDate(s.updated_at),
      icon: <BrushIcon />,
      onSelect: go(`/sketches?sketch=${s.id}`),
    }));

    const posts: PaletteItem[] = (index?.posts ?? []).map((p) => ({
      id: `post:${p.id}`,
      label: p.title,
      hint: p.status === "draft" ? "Draft" : "Published",
      icon: <PenLineIcon />,
      keywords: [p.slug],
      onSelect: go(`/writing?post=${encodeURIComponent(p.slug)}`),
    }));

    const workouts: PaletteItem[] = (index?.workouts ?? []).map((w) => ({
      id: `workout:${w.slug}`,
      label: w.name,
      icon: <DumbbellIcon />,
      keywords: [w.slug.replace(/-/g, " ")],
      onSelect: go(`/training/workouts/${w.slug}`),
    }));

    return [
      { heading: "Sections", items: sections },
      { heading: "Actions", items: actions },
      { heading: "Chats", items: chats, idleLimit: 5 },
      { heading: "Notes", items: notes, whenTyping: true },
      { heading: "Tasks", items: tasks, whenTyping: true },
      { heading: "Writing", items: posts, whenTyping: true },
      { heading: "Sketches", items: sketches, whenTyping: true },
      { heading: "Workouts", items: workouts, whenTyping: true },
    ];
  }, [index, threads, switchTo, router, resolvedTheme, setTheme, onNewChat, onNewTask]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      placeholder="Jump to a section, note, task, chat, post…"
      loading={loading && !index}
      title="Jump to"
    />
  );
}
