// Shape of the Google Calendar block written when a task is completed, so the
// calendar doubles as an audit trail of what actually got done in weeks prior.
// Deliberately import-free: the web routes (lib/task-calendar.ts) and the agent's
// complete_todo tool run under different module resolvers (Turbopack vs the eve
// runtime) that disagree on relative-import extensions, so this shared module
// takes the category label from its caller rather than importing the label map.

// Google's "Graphite" — deliberately dull so done-blocks read as a background
// layer next to real meetings.
const DONE_EVENT_COLOR_ID = "8";

// A task with no timer and no estimate still deserves a visible block, and a timer
// left running overnight shouldn't paint a multi-day bar across the week.
const MIN_DURATION_SECONDS = 5 * 60;
const MAX_DURATION_SECONDS = 8 * 60 * 60;
const FALLBACK_DURATION_SECONDS = 15 * 60;

export interface CompletedTaskForCalendar {
  title: string;
  time_spent_seconds?: number | null;
  estimated_minutes?: number | null;
  /** Human-readable category label ("Calls"), or null/undefined when uncategorized. */
  categoryLabel?: string | null;
}

function formatMinutes(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function clamp(seconds: number) {
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(seconds)));
}

/**
 * How long the block should be, and where the number came from — tracked timer
 * first, then the estimate, then a flat fallback.
 */
function resolveDuration(todo: CompletedTaskForCalendar): { seconds: number; source: string } {
  const tracked = Number(todo.time_spent_seconds ?? 0);
  if (Number.isFinite(tracked) && tracked > 0) {
    return { seconds: clamp(tracked), source: `${formatMinutes(tracked)} tracked` };
  }
  const estimate = Number(todo.estimated_minutes ?? 0);
  if (Number.isFinite(estimate) && estimate > 0) {
    const seconds = estimate * 60;
    return { seconds: clamp(seconds), source: `${formatMinutes(seconds)} estimated` };
  }
  return { seconds: FALLBACK_DURATION_SECONDS, source: "no time tracked" };
}

/** The Google Calendar event body for a finished task, ending at `completedAt`. */
export function buildDoneBlock(todo: CompletedTaskForCalendar, completedAt: Date = new Date()) {
  const { seconds, source } = resolveDuration(todo);
  const start = new Date(completedAt.getTime() - seconds * 1000);
  const description = [
    `Completed in focuspoint — ${source}.`,
    ...(todo.categoryLabel ? [`Category: ${todo.categoryLabel}`] : []),
  ].join("\n");

  return {
    summary: `✓ ${todo.title}`,
    description,
    colorId: DONE_EVENT_COLOR_ID,
    transparency: "transparent", // done-blocks are a record, not busy time
    start: { dateTime: start.toISOString() },
    end: { dateTime: completedAt.toISOString() },
  };
}
