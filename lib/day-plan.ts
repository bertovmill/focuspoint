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
  /**
   * Why it matters, in Berto's own words only — never generated (his call,
   * 2026-10-04). Indented sub-bullets under the habit line; failing that, the
   * lines of a matching "On …" section ("Nap" → "On napping"). Empty if neither.
   */
  why: string[];
};

export type Busy = { start: number; end: number };

export type PlannedHabit = DailyHabit & {
  /** Minutes since local midnight, or null when no gap was big enough today. */
  start: number | null;
  end: number | null;
};

const h = (hours: number, mins = 0) => hours * 60 + mins;

/**
 * When the day starts. Berto usually starts around 5:30 but not always, and he
 * doesn't open Cael in the morning — so it's a standing setting he adjusts on the
 * card (app_settings `day_plan.start`), not a "I'm up" tap. The morning window
 * opens here and nothing is scheduled before it.
 */
export const DEFAULT_DAY_START = h(5, 30);
export const DAY_END = h(22);

const NAMED_WINDOWS: Record<string, HabitWindow> = {
  // Its start is replaced by the day start at plan time (see planDay).
  morning: { start: DEFAULT_DAY_START, end: h(11), label: "morning" },
  midday: { start: h(11, 30), end: h(14, 30), label: "midday" },
  lunch: { start: h(11, 30), end: h(14, 30), label: "midday" },
  noon: { start: h(11, 30), end: h(14, 30), label: "midday" },
  afternoon: { start: h(13), end: h(17), label: "afternoon" },
  evening: { start: h(17), end: h(21, 30), label: "evening" },
  night: { start: h(19), end: h(DAY_END / 60), label: "evening" },
};
// Its start is replaced by the day start at plan time (see planDay).
const ANYTIME: HabitWindow = { start: DEFAULT_DAY_START, end: h(21, 30), label: "anytime" };

/** An explicit "1pm" means start there, with a three-hour grace if a meeting is in the way. */
const AT_TIME_GRACE = 180;

const DEFAULT_MINUTES = 30;

export const HABITS_HEADING = "Daily habits";
/** The section heading the habits sit under — "Daily habits", "On habits", any level. */
const HABITS_HEADING_RE = /^#{1,6}\s+.*\bhabits?\b/i;

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
    why: [],
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
  const startIdx = lines.findIndex((l) => HABITS_HEADING_RE.test(l.trim()));
  if (startIdx === -1) return null;

  const habits: DailyHabit[] = [];
  const seen = new Set<string>();
  let last: DailyHabit | null = null;
  for (const line of lines.slice(startIdx + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) continue;
    // Indented under a habit = that habit's "why", not a habit of its own.
    if (/^\s+/.test(line)) {
      const text = cleanLine(line);
      if (last && text) last.why.push(text);
      continue;
    }
    const habit = parseHabitLine(line);
    last = null;
    if (habit && !seen.has(habit.key)) {
      seen.add(habit.key);
      habits.push(habit);
      last = habit;
    }
  }
  for (const habit of habits) {
    if (habit.why.length === 0) habit.why = matchingSection(lines, habit.name);
  }
  return habits;
}

/**
 * The doc with one habit pinned to a clock time — "Nap — 20 min — 1pm" → "… — 2pm",
 * "Meditate — 20 min — morning" → "… — 6am", "Nap 20 mins sometime midday" →
 * "… sometime at 12:30pm". Only the text after the name is
 * touched, so "Evening walk" keeps its name. Replaces the line's time or window
 * word, else appends one. Null when no habit line has that key. Changing a time
 * on the Today card is permanent (Berto's call, 2026-10-04), so it lands here,
 * in the doc he already edits, rather than in a setting the doc can't show.
 */
export function setHabitTime(markdown: string, key: string, minutes: number): string | null {
  const lines = markdown.split("\n");
  const startIdx = lines.findIndex((l) => HABITS_HEADING_RE.test(l.trim()));
  if (startIdx === -1) return null;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (!/^(?:[-*+]|\d+[.)])\s+/.test(line)) continue; // indented = a "why", not a habit
    const habit = parseHabitLine(line);
    if (habit?.key !== key) continue;

    const at = line.indexOf(habit.name);
    const cut = at === -1 ? 0 : at + habit.name.length;
    const head = line.slice(0, cut);
    const tail = line.slice(cut);
    const time = formatTime(minutes);
    const clockRe = /\b\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i;
    const wordRe = /\b(?:in the\s+)?(?:morn\w*|midday|lunch|noon|afternoon|evening|night)\b/i;
    lines[i] = clockRe.test(tail)
      ? head + tail.replace(clockRe, time)
      : wordRe.test(tail)
        ? // "— morning" → "— 6am"; prose like "first thing in the morning" → "first thing at 6am"
          head + tail.replace(wordRe, /\s[—–|·-]\s/.test(tail) ? time : `at ${time}`)
        : `${line.trimEnd()} — ${time}`;
    return lines.join("\n");
  }
  return null;
}

function cleanLine(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/\\([^\w\s])/g, "$1")
    .trim();
}

/**
 * The lines of an "On <word>" section whose word shares the habit name's stem —
 * "Nap" → "On napping", "Meditate" → "On meditation". Prefix match on the first
 * word minus a trailing "e", at least three letters, so short names can't match
 * everything.
 */
function matchingSection(lines: string[], name: string): string[] {
  const stem = name.toLowerCase().split(/\s+/)[0].replace(/e$/, "");
  if (stem.length < 3) return [];
  const idx = lines.findIndex((l) => {
    const m = l.trim().match(/^#{1,6}\s+on\s+(\w+)/i);
    return Boolean(m && m[1].toLowerCase().startsWith(stem));
  });
  if (idx === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(idx + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    const text = cleanLine(line);
    if (text) out.push(text);
  }
  return out;
}

function merge(busy: Busy[]): Busy[] {
  const sorted = busy
    .map((b) => ({ start: Math.max(b.start, 0), end: Math.min(b.end, DAY_END) }))
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
export function planDay(habits: DailyHabit[], events: Busy[], dayStart = DEFAULT_DAY_START): PlannedHabit[] {
  let busy = merge(events);
  const placed: PlannedHabit[] = [];
  for (const habit of habits) {
    // "Morning" means from whenever the day starts, and keeps at least five hours;
    // a habit with no time can go any time after the day starts.
    const window =
      habit.window.label === "morning"
        ? { ...habit.window, start: dayStart, end: Math.max(habit.window.end, dayStart + 300) }
        : habit.window.label === "anytime"
          ? { ...habit.window, start: dayStart }
          : habit.window;
    const start =
      firstFit(busy, habit.minutes, Math.max(window.start, dayStart), window.end) ??
      firstFit(busy, habit.minutes, Math.max(window.end, dayStart), DAY_END);
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

/** "05:30" → 330; null for anything that isn't a clock time. */
export function parseClock(value: string): number | null {
  const m = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? h(Number(m[1]), Number(m[2])) : null;
}

/** 330 → "05:30", the value an <input type="time"> takes. */
export function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
