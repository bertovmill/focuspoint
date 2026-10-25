import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { gcalFetch, GoogleNotConnectedError } from "@/lib/google";
import { listHomeSections } from "@/lib/home-sections";
import { getPrinciples } from "@/lib/principles";
import { listTasks } from "@/lib/tasks";

// The day's strategy on Home's calendar (his ask, 2026-10-25): an AI-written
// plan — one line of theme, then a few suggested activities in the free gaps of
// his calendar, each tied to his Vision sections or Principles. Each activity is
// a suggestion until he keeps (✓) or drops (✕) it, and a kept one is ticked when
// done. "Rewrite" takes an optional note and replaces the suggestions, leaving
// what he kept. One row per day; nothing is written to Google Calendar.
// The table is also in ensureSchema (lib/db.ts); it's created lazily here
// because the read paths skip ensureSchema.

export interface StrategyBlock {
  /** "HH:MM", 24-hour, local time. */
  start: string;
  end: string;
  title: string;
  /** Which goal or principle it serves, in a few words. */
  why: string;
  state: BlockState;
  done: boolean;
}

export type BlockState = "suggested" | "kept" | "dropped";

export interface DayStrategy {
  day: string;
  theme: string;
  blocks: StrategyBlock[];
  updated_at: string | null;
}

const MODEL = "anthropic/claude-sonnet-4.6";

let ready: Promise<unknown> | null = null;

function ensureTable() {
  ready ??= getDb()`
    CREATE TABLE IF NOT EXISTS day_strategies (
      day DATE PRIMARY KEY,
      theme TEXT NOT NULL,
      blocks JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

function toStrategy(row: Record<string, unknown>): DayStrategy {
  // Rows from before per-activity keeping had one yes for the whole plan (`status`).
  const keptAll = row.status === "accepted";
  return {
    day: String(row.day),
    theme: String(row.theme),
    blocks: ((row.blocks as Partial<StrategyBlock>[]) ?? []).map((b) => ({
      start: String(b.start),
      end: String(b.end),
      title: String(b.title ?? ""),
      why: String(b.why ?? ""),
      state: b.state ?? (keptAll ? "kept" : "suggested"),
      done: Boolean(b.done),
    })),
    updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

export async function getDayStrategy(day: string): Promise<DayStrategy | null> {
  await ensureTable();
  const [row] = await getDb()`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, theme, blocks, status, updated_at
    FROM day_strategies WHERE day = ${day}
  `;
  return row ? toStrategy(row) : null;
}

// `status` is left at 'proposed' now that keeping is per activity (see toStrategy).
async function saveDayStrategy(day: string, theme: string, blocks: StrategyBlock[]) {
  await ensureTable();
  await getDb()`
    INSERT INTO day_strategies (day, theme, blocks, status) VALUES (${day}, ${theme}, ${JSON.stringify(blocks)}, 'proposed')
    ON CONFLICT (day) DO UPDATE SET theme = EXCLUDED.theme, blocks = EXCLUDED.blocks, status = 'proposed', updated_at = NOW()
  `;
  return (await getDayStrategy(day))!;
}

/** Keeps, drops or ticks one activity (by its index in `blocks`). Null if the day or activity isn't there. */
export async function updateStrategyBlock(
  day: string,
  index: number,
  patch: Partial<Pick<StrategyBlock, "state" | "done">>,
): Promise<DayStrategy | null> {
  const current = await getDayStrategy(day);
  if (!current || !current.blocks[index]) return null;
  const blocks = current.blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
  return saveDayStrategy(day, current.theme, blocks);
}

/** The day being planned, as the browser sees it: its date, local-midnight bounds and time zone. */
export interface PlanWindow {
  day: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

const schema = z.object({
  theme: z.string().describe("One short line: what today is about. No more than 12 words."),
  blocks: z
    .array(
      z.object({
        start: z.string().describe("Start time, 24-hour HH:MM, local time"),
        end: z.string().describe("End time, 24-hour HH:MM, local time"),
        title: z.string().describe("What to do, as a short imperative. Under 8 words."),
        why: z.string().describe("The goal or principle it serves, in his words where possible. Under 10 words."),
      }),
    )
    .describe("3 to 5 new blocks (fewer if he's already keeping some), in time order, all inside free time."),
});

async function calendarLines(w: PlanWindow): Promise<string[]> {
  try {
    const params = new URLSearchParams({ timeMin: w.timeMin, timeMax: w.timeMax, singleEvents: "true", orderBy: "startTime" });
    const res = await gcalFetch(`/calendars/primary/events?${params}`);
    if (!res.ok) return [];
    const { items } = (await res.json()) as {
      items: { summary?: string; start?: { date?: string; dateTime?: string }; end?: { dateTime?: string } }[];
    };
    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: w.timeZone });
    return items.map((e) =>
      e.start?.dateTime
        ? `- ${time(e.start.dateTime)}–${e.end?.dateTime ? time(e.end.dateTime) : "?"} ${e.summary ?? "(busy)"}`
        : `- all day: ${e.summary ?? "(busy)"}`,
    );
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return [];
    throw err;
  }
}

/**
 * Writes a fresh strategy for the day and saves it as proposed, replacing any
 * earlier one. `feedback` is his note on what to change, when he said no.
 */
export async function generateDayStrategy(w: PlanWindow, feedback?: string): Promise<DayStrategy> {
  const [sections, principles, tasks, calendar, previous] = await Promise.all([
    listHomeSections(),
    getPrinciples(),
    listTasks("open", 40),
    calendarLines(w),
    getDayStrategy(w.day),
  ]);

  const kept = previous?.blocks.filter((b) => b.state === "kept") ?? [];

  const nowLocal = new Date().toLocaleString("en-GB", { timeZone: w.timeZone, weekday: "long", hour: "2-digit", minute: "2-digit" });
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: w.timeZone });
  const isToday = todayLocal === w.day;
  const weekday = new Date(`${w.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  const prompt = [
    `Plan ${weekday} (${w.day}) for Berto.${isToday ? ` It is now ${nowLocal}; only plan from now on.` : ""}`,
    `His day runs roughly 06:00–22:00.`,
    `## His vision\n${sections.map((s) => `### ${s.title}\n${s.content.trim() || "(empty)"}`).join("\n\n") || "(none written yet)"}`,
    `## His principles\n${principles.content.trim() || "(none written yet)"}`,
    `## Calendar (busy — never overlap these)\n${[...calendar, ...kept.map((b) => `- ${b.start}–${b.end} ${b.title} (he's keeping this from your last plan)`)].join("\n") || "(nothing scheduled)"}`,
    `## Open tasks\n${
      tasks
        .map((t) => `- ${t.title}${t.priority ? ` [${t.priority}]` : ""}${t.due_date ? ` due ${String(t.due_date).slice(0, 10)}` : ""}${t.in_progress ? " (in progress)" : ""}`)
        .join("\n") || "(none)"
    }`,
    previous && feedback
      ? `## Your last plan, which he asked you to rewrite\nTheme: ${previous.theme}\n${previous.blocks.map((b) => `- ${b.start}–${b.end} ${b.title} (${b.state})`).join("\n")}\n\nHis note: ${feedback}`
      : feedback
        ? `## His note on what he wants\n${feedback}`
        : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { output } = await generateText({
    model: MODEL,
    system:
      "You are Cael, Berto's life agent. Write a simple execution strategy for his day: a theme and 3–5 time blocks placed only in his free time. " +
      "Pick the few things that move his vision forward most, guided by his principles; favour deep work on his most important tasks over busywork. " +
      "Leave some breathing room. Be concrete and plain-spoken — no hype, no emoji. If he left a note, follow it.",
    prompt,
    output: Output.object({ schema }),
    temperature: 0.5,
    maxOutputTokens: 1200,
  });

  const blocks = output.blocks
    .filter((b) => /^\d{1,2}:\d{2}$/.test(b.start) && /^\d{1,2}:\d{2}$/.test(b.end))
    .map((b): StrategyBlock => ({ ...b, start: b.start.padStart(5, "0"), end: b.end.padStart(5, "0"), state: "suggested", done: false }));
  // What he kept stays; the new suggestions fill in around it.
  return saveDayStrategy(w.day, output.theme.trim(), [...kept, ...blocks].sort((a, b) => a.start.localeCompare(b.start)));
}
