// The task row shape, shared by the dashboard and the Tasks canvas. It mirrors the
// columns the /api/todos routes select — keep the two in step.
import { isLaneCategory, type TaskCategory } from "@/lib/task-categories";
import type { CardColor } from "@/lib/task-colors";

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  in_progress: boolean;
  waiting: boolean;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  created_at: string;
  completed_at?: string | null;
  timer_started_at?: string | null;
  time_spent_seconds?: number;
  task_number?: number | null;
  estimated_minutes?: number | null;
  category?: TaskCategory | null;
  // Cosmetic card colour set from the canvas right-click menu. Null = plain card.
  color?: CardColor | null;
  // Position of the task's card on the Tasks canvas, in Excalidraw scene coordinates.
  // Null on both = never placed; the canvas drops it into the inbox column and saves
  // wherever it landed.
  canvas_x?: number | null;
  canvas_y?: number | null;
  // Set when this task belongs to a content piece (see the Content lane). The piece
  // itself is a category='content' row with parent_id null.
  parent_id?: number | null;
}

// A piece is a top-level task in one of the pipeline categories (Content, Code,
// Community, Sales); its children are the steps to ship it. Both live in the pinned
// pipeline panel, not as free-floating canvas cards.
export function isLanePiece(t: Todo) {
  return t.parent_id == null && isLaneCategory(t.category);
}

export function isInLane(t: Todo) {
  return isLanePiece(t) || t.parent_id != null;
}

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

// 0 = no estimate. Presets only — matches the priority/recurrence chip pattern.
export const ESTIMATE_OPTIONS = [15, 30, 60, 120] as const;

export function formatEstimateLabel(minutes: number) {
  if (minutes === 0) return "None";
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

// mm:ss (or h:mm:ss past 99 minutes) for the timer countdown badge.
export function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = hrs > 0 ? String(mins).padStart(2, "0") : String(mins);
  const ss = String(secs).padStart(2, "0");
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Missing completed_at counts as today: an un-completed task is trivially "not stale".
export function isTodayIso(iso: string | null | undefined) {
  if (!iso) return true;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isDoneToday(t: Todo) {
  return Boolean(t.completed_at) && isTodayIso(t.completed_at);
}

// Seconds of the estimate still on the clock, or null when there's nothing to count
// down. `nowMs` is passed in so a ticking parent drives every card off one clock.
export function remainingSeconds(t: Todo, nowMs: number) {
  if (!t.estimated_minutes) return null;
  const spent = t.time_spent_seconds ?? 0;
  const live = t.timer_started_at ? (nowMs - new Date(t.timer_started_at).getTime()) / 1000 : 0;
  return t.estimated_minutes * 60 - (spent + live);
}

// How far a task has burned through its estimate, 0..1 (clamped), or null when
// there's no estimate to measure against. Drives the fill ring in the pinned view.
export function estimateProgress(t: Todo, nowMs: number) {
  if (!t.estimated_minutes) return null;
  const spent = t.time_spent_seconds ?? 0;
  const live = t.timer_started_at ? (nowMs - new Date(t.timer_started_at).getTime()) / 1000 : 0;
  return Math.min(1, Math.max(0, (spent + live) / (t.estimated_minutes * 60)));
}
