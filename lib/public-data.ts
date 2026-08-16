import "server-only";
import { getDb } from "@/lib/db";
import { fetchLumaContacts } from "@/lib/luma";

/**
 * The only door between Cael's private database and bertomill.com.
 *
 * Every query here is written out by hand and returns an aggregate — a count, a
 * sum, a percentage. Nothing that could carry a task title, a journal entry, a
 * thought or a dollar figure crosses this boundary. The public pages import from
 * this file and nowhere else; they never touch `getDb()` directly.
 */

/** A form of wealth, as shown on the public build-in-public page. */
export interface PublicWealthForm {
  key: string;
  label: string;
  /** What the number counts — "books", "hours", "trips". */
  unit: string;
  /** All-time total. `null` when the figure itself is private (see `redacted`). */
  total: number | null;
  target: number;
  /** False when no goal has been set for this form yet — show the count, not a bar. */
  hasTarget: boolean;
  /** 0–100, clamped. Always safe to show, even when `total` is withheld. */
  percent: number;
  /** True when only the percentage is public — the underlying number is not. */
  redacted: boolean;
}

/** Money is tracked as a savings balance. The ratio is public; the balance is not. */
const REDACTED_FORMS = new Set(["money"]);

const FORM_ORDER = ["growth", "wellness", "family", "craft", "money", "community", "adventure", "service"] as const;

const FORM_LABELS: Record<string, string> = {
  growth: "Growth",
  wellness: "Wellness",
  family: "Family",
  craft: "Craft",
  money: "Money",
  community: "Community",
  adventure: "Adventure",
  service: "Service",
};

const FORM_UNITS: Record<string, string> = {
  growth: "books",
  wellness: "hours",
  family: "memories",
  craft: "notes",
  money: "saved",
  community: "subscribers",
  adventure: "trips",
  service: "thank-yous",
};

function pct(total: number, target: number) {
  if (!target || !Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(100, Math.round((total / target) * 100)));
}

/**
 * All-time progress against each of the 8 goals, matching what the private
 * dashboard computes (`app/_components/home-screen.tsx`) so the two never disagree.
 */
export async function getWealthForms(): Promise<PublicWealthForm[]> {
  const sql = getDb();

  const [goals, books, gymHours, memories, craftNotes, savings, savingsGoal, trips, thanks] = await Promise.all([
    sql`SELECT title, content FROM vision_items WHERE kind = 'goal'`,
    sql`SELECT COUNT(*)::int AS n FROM reading_logs`,
    sql`SELECT COALESCE(SUM(value), 0)::float AS n FROM workout_logs WHERE exercise = 'gym_hours'`,
    sql`SELECT COUNT(*)::int AS n FROM memories`,
    sql`SELECT COUNT(*)::int AS n FROM thoughts WHERE 'craft' = ANY(SELECT lower(t) FROM unnest(tags) AS t)`,
    sql`SELECT data->>'total_savings' AS v FROM measures WHERE category = 'savings_snapshot' ORDER BY recorded_date DESC LIMIT 1`,
    // Money's target isn't a vision_items goal — it rides along on the savings
    // snapshots, so take the most recent one that carries a goal.
    sql`SELECT data->>'goal' AS v FROM measures WHERE category = 'savings_snapshot' AND data ? 'goal' ORDER BY recorded_date DESC LIMIT 1`,
    sql`SELECT COUNT(*)::int AS n FROM measures WHERE category = 'trips'`,
    sql`SELECT COUNT(*)::int AS n FROM thank_yous`,
  ]);

  // Luma is a third-party call and the least reliable input here — a failure
  // should cost one card's number, not the whole page.
  let subscribers = 0;
  try {
    subscribers = (await fetchLumaContacts()).length;
  } catch {
    subscribers = 0;
  }

  const targets: Record<string, number> = {};
  for (const row of goals as { title: string | null; content: string | null }[]) {
    const key = row.title?.toLowerCase();
    const target = Number(row.content);
    // Some vision goals are written as prose, not a number — those aren't scoreboard rows.
    if (key && row.content?.trim() && Number.isFinite(target)) targets[key] = target;
  }
  const moneyGoal = Number(savingsGoal[0]?.v);
  if (!targets.money && Number.isFinite(moneyGoal) && moneyGoal > 0) targets.money = moneyGoal;

  const totals: Record<string, number> = {
    growth: Number(books[0]?.n ?? 0),
    wellness: Number(gymHours[0]?.n ?? 0),
    family: Number(memories[0]?.n ?? 0),
    craft: Number(craftNotes[0]?.n ?? 0),
    money: Number(savings[0]?.v ?? 0),
    community: subscribers,
    adventure: Number(trips[0]?.n ?? 0),
    service: Number(thanks[0]?.n ?? 0),
  };

  return FORM_ORDER.map((key) => {
    const total = totals[key] ?? 0;
    const target = targets[key] ?? 0;
    const redacted = REDACTED_FORMS.has(key);
    return {
      key,
      label: FORM_LABELS[key],
      unit: FORM_UNITS[key],
      total: redacted ? null : total,
      target,
      hasTarget: target > 0,
      percent: pct(total, target),
      redacted,
    };
  });
}

/** Headline counters for the site header and home page. */
export interface PublicStats {
  booksRead: number;
  tasksShipped: number;
  shippedLast30Days: number;
  trips: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  const sql = getDb();
  const [books, shipped, recent, trips] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM reading_logs`,
    sql`SELECT COUNT(*)::int AS n FROM todos WHERE completed = TRUE`,
    sql`SELECT COUNT(*)::int AS n FROM todos WHERE completed = TRUE AND completed_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT COUNT(*)::int AS n FROM measures WHERE category = 'trips'`,
  ]);
  return {
    booksRead: Number(books[0]?.n ?? 0),
    tasksShipped: Number(shipped[0]?.n ?? 0),
    shippedLast30Days: Number(recent[0]?.n ?? 0),
    trips: Number(trips[0]?.n ?? 0),
  };
}

/**
 * The written vision for each form of wealth — the `statement` rows whose title is
 * a form name. This is prose Berto wrote about where he's headed, not tracked data.
 *
 * It's the one thing on the public side that isn't an aggregate, so it's the one to
 * drop if the site should get quieter: delete this call in `app/site/building/page.tsx`
 * and the cards fall back to numbers only.
 */
export async function getPublicVisions(): Promise<Record<string, string>> {
  const sql = getDb();
  const rows = await sql`
    SELECT title, content FROM vision_items
    WHERE kind = 'statement' AND title IS NOT NULL
    ORDER BY created_at DESC
  `;
  const out: Record<string, string> = {};
  for (const row of rows as { title: string; content: string | null }[]) {
    const key = row.title.toLowerCase();
    if (FORM_LABELS[key] && !out[key] && row.content) out[key] = row.content;
  }
  return out;
}
