// The day planner behind the "Today" card on Home: daily habits from the
// Principles doc, slotted into the free gaps in today's Google Calendar.
//
// Berto's calls (2026-10-04): the habit list lives as a "## Daily habits" section
// in the Principles doc (plain text he edits, no separate editor); placement is
// simple rules, not an LLM — each habit has a preferred window and takes the first
// free gap that fits; the plan is shown on Home only, never written to the
// calendar; and the timeline itself is the checklist (the old habit row came off
// the scorecard on 2026-09-30).
//
// Everything here is pure and works in minutes since local midnight, so the
// route does the timezone conversion once and this file never touches a Date.

export type HabitWindow = { start: number; end: number; label: string };

export type DailyHabit = {
  /** Stable slug of the name; the key ticks are stored under. */
  key: string;
  name: string;
  minutes: number;
  window: HabitWindow;
};

export type Busy = { start: number; end: number };

export type PlannedHabit = DailyHabit & {
  /** Minutes since local midnight, or null when no gap was big enough today. */
  start: number | null;
  end: number | null;
};

const h = (hours: number, mins = 0) => hours * 60 + mins;

/** The planner never schedules before or after these. */
export const DAY_START = h(6);
export const DAY_END = h(22);

const NAMED_WINDOWS: Record<string, HabitWindow> = {
  morning: { start: h(6), end: h(11), label: "morning" },
  midday: { start: h(11, 30), end: h(14, 30), label: "midday" },
  lunch: { start: h(11, 30), end: h(14, 30), label: "midday" },
  noon: { start: h(11, 30), end: h(14, 30), label: "midday" },
  afternoon: { start: h(13), end: h(17), label: "afternoon" },
  evening: { start: h(17), end: h(21, 30), label: "evening" },
  night: { start: h(19), end: h(DAY_END / 60), label: "evening" },
};
const ANYTIME: HabitWindow = { start: h(7), end: h(21, 30), label: "anytime" };

/** An explicit "1pm" means start there, with a three-hour grace if a meeting is in the way. */
const AT_TIME_GRACE = 180;

const DEFAULT_MINUTES = 30;

export const HABITS_HEADING = "Daily habits";

/** What the section is seeded with, and what the planner falls back on if it's missing. */
export const DEFAULT_HABITS_MARKDOWN = [
  `## ${HABITS_HEADING}`,
  "",
  "- Meditation — 15 min — morning",
  "- Reading — 30 min — morning",
  "- Workout — 60 min — morning",
  "- Nap — 20 min — 1pm",
].join("\n");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDuration(text: string): number | null {
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const mins = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (!hours && !mins) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0)) || null;
}

function parseWindow(text: string): HabitWindow | null {
  // "1pm", "1:30 pm", "7am"
  const ampm = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  // "13:00", "7:30" — only with a colon, so "20 min" can't read as 8pm
  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  let at: number | null = null;
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === "pm") hour += 12;
    at = h(hour, Number(ampm[2] ?? 0));
  } else if (clock) {
    at = h(Number(clock[1]), Number(clock[2]));
  }
  if (at !== null) return { start: at, end: Math.min(at + AT_TIME_GRACE, DAY_END), label: formatTime(at) };

  // "morn\w*" so a typo like "mornign" still lands in the morning.
  const word = text.toLowerCase().match(/\b(morn\w*|midday|lunch|noon|afternoon|evening|night)\b/);
  if (!word) return null;
  return word[1].startsWith("morn") ? NAMED_WINDOWS.morning : NAMED_WINDOWS[word[1]];
}

/** One list item → a habit. "Meditation — 15 min — morning", "Nap 20m at 1pm", "Reading". */
export function parseHabitLine(raw: string): DailyHabit | null {
  const text = raw
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "") // list marker
    .replace(/^\[[ xX]\]\s*/, "") // task checkbox
    .replace(/\\([^\w\s])/g, "$1") // markdown escapes from the editor
    .replace(/[*_`]/g, "")
    .trim();
  if (!text) return null;

  // The name is everything before the first separator or the first number.
  const name = text
    .split(/\s+[—–\-|·:,]\s+|\s*[—–|·]\s*|,\s*/)[0]
    .replace(/\s+(?:at|for|in the|around|~)?\s*\d.*$/i, "")
    .replace(/\s+(?:in the\s+)?(?:morning|midday|lunch|noon|afternoon|evening|night)\b.*$/i, "")
    .replace(/[\s:;,.]+$/, "")
    .trim();
  if (!name) return null;

  return {
    key: slugify(name),
    name,
    minutes: parseDuration(text) ?? DEFAULT_MINUTES,
    window: parseWindow(text) ?? ANYTIME,
  };
}

/**
 * The habits under the first heading that mentions habits — "Daily habits", "On
 * habits", any level, any case — up to the next heading. Null when the doc has no such section, so the caller can fall
 * back to the defaults and say so.
 */
export function parseDailyHabits(markdown: string): DailyHabit[] | null {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => /^#{1,6}\s+.*\bhabits?\b/i.test(l.trim()));
  if (startIdx === -1) return null;

  const habits: DailyHabit[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(startIdx + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) continue;
    const habit = parseHabitLine(line);
    if (habit && !seen.has(habit.key)) {
      seen.add(habit.key);
      habits.push(habit);
    }
  }
  return habits;
}

function merge(busy: Busy[]): Busy[] {
  const sorted = busy
    .map((b) => ({ start: Math.max(b.start, DAY_START), end: Math.min(b.end, DAY_END) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

/** Earliest start in [from, until] where `minutes` fits clear of everything busy. */
function firstFit(busy: Busy[], minutes: number, from: number, until: number): number | null {
  let cursor = from;
  for (const b of busy) {
    if (b.end <= cursor) continue;
    if (b.start >= cursor + minutes) break;
    cursor = b.end;
  }
  return cursor + minutes <= Math.min(until, DAY_END) ? cursor : null;
}

/**
 * Place each habit, in the order they're listed, into the first free gap inside
 * its window; failing that, the first gap later in the day. Placed habits become
 * busy for the ones after them.
 */
export function planDay(habits: DailyHabit[], events: Busy[]): PlannedHabit[] {
  let busy = merge(events);
  const placed: PlannedHabit[] = [];
  for (const habit of habits) {
    const start =
      firstFit(busy, habit.minutes, Math.max(habit.window.start, DAY_START), habit.window.end) ??
      firstFit(busy, habit.minutes, habit.window.end, DAY_END);
    if (start === null) {
      placed.push({ ...habit, start: null, end: null });
      continue;
    }
    placed.push({ ...habit, start, end: start + habit.minutes });
    busy = merge([...busy, { start, end: start + habit.minutes }]);
  }
  return placed;
}

/** 780 → "1pm", 450 → "7:30am". */
export function formatTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const min = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  return `${hour12}${min ? `:${String(min).padStart(2, "0")}` : ""}${hour24 < 12 ? "am" : "pm"}`;
}
