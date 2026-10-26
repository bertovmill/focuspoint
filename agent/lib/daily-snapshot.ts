import { getDb } from "../../lib/db";
import { PROTOCOL_RULES } from "../../lib/nutrition";
import { getPlanRange, getProteinTarget, proteinEatenOn } from "../../lib/nutrition-plan";
import { getPrinciples } from "../../lib/principles";
import { getCareerPlan, summarizeCareerPlan } from "../../lib/career-plan";
import { daysUntil, getEvents, getSessions, targetLabel } from "../../lib/training";
import { listCalendarEvents, resolveGoogleToken } from "./google-calendar";
import { TIME_ZONE, todayISO, zonedDayBounds } from "./now";

// The "today" brief Cael starts each day of a conversation with: the handful of
// things that shape almost any answer (his principles, today's training,
// career actions and meals, what's on the calendar and the todo list). Pinning
// these up front means Cael doesn't have to remember to go and fetch them — the
// traces showed it often didn't. Everything else stays behind tools.
//
// Each section is fetched independently and quietly dropped if its source is
// down, so one slow API never costs the whole brief.

/** Marker the snapshot opens with; also how a turn knows today's is already in. */
export function snapshotMarker(date: string): string {
  return `[[Daily snapshot — ${date}]]`;
}

const SECTION_TIMEOUT_MS = 4000;

async function section(build: () => Promise<string | null>): Promise<string | null> {
  try {
    return await Promise.race([
      build(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SECTION_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
}

async function principles(): Promise<string | null> {
  const { content } = await getPrinciples();
  return content.trim() ? `## His principles\n${content.trim()}` : null;
}

async function training(today: string): Promise<string | null> {
  const [sessions, events] = await Promise.all([getSessions(today, today), getEvents()]);
  const lines = sessions.map(
    (s) =>
      `- ${s.title} (${s.type}${s.intensity ? `, ${s.intensity}` : ""}${targetLabel(s) ? `, ${targetLabel(s)}` : ""})${s.done ? " ✓ done" : ""}`,
  );
  const next = events.find((e) => daysUntil(e.event_date) >= 0);
  if (next) lines.push(`- Next race: ${next.name} on ${next.event_date} (${daysUntil(next.event_date)} days)`);
  return `## Training today\n${lines.length ? lines.join("\n") : "- Nothing on the plan today."}`;
}

async function career(today: string): Promise<string | null> {
  return `## Career today\n${summarizeCareerPlan(await getCareerPlan(today), today)}`;
}

async function meals(today: string): Promise<string | null> {
  const sql = getDb();
  const [plan, eaten, target, proteinToday] = await Promise.all([
    getPlanRange(today, today),
    sql`SELECT name, protein_g FROM nutrition_meals WHERE eaten_date = ${today}::date ORDER BY created_at ASC`,
    getProteinTarget(),
    proteinEatenOn(today),
  ]);
  const lines = [
    plan.length ? `- Planned: ${plan.map((p) => `${p.slot} — ${p.name}`).join("; ")}` : "- Nothing planned.",
    eaten.length ? `- Eaten so far: ${eaten.map((m) => String(m.name)).join("; ")}` : "- Nothing logged yet.",
    `- Protein: ${Math.round(proteinToday)} of ${target} g`,
    `- His eating rules (Tony Robbins' protocol — every suggestion keeps all of them): ${PROTOCOL_RULES.map((r) => `${r.label} (${r.detail})`).join("; ")}`,
  ];
  return `## Food today\n${lines.join("\n")}`;
}

async function todos(): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT title, priority, due_date FROM todos WHERE completed = FALSE
    ORDER BY CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 ELSE 0 END DESC,
      created_at DESC
    LIMIT 5
  `;
  if (!rows.length) return "## Top todos\n- None open.";
  const lines = rows.map((r) => {
    const due = r.due_date ? `, due ${String(r.due_date instanceof Date ? r.due_date.toISOString() : r.due_date).slice(0, 10)}` : "";
    return `- ${String(r.title)} (${String(r.priority ?? "normal")}${due})`;
  });
  return `## Top todos (of the open list)\n${lines.join("\n")}`;
}

// His vision is read on most "big picture" questions (2030, decisions, routines),
// and `list_vision` was often called three times in parallel by kind, costing a
// whole model round trip before the answer could start. It's ~10 KB and changes
// every few months, so it rides in the brief. Newest item per (kind, title) is
// current; images and the old "chapter" kind stay behind the tool.
async function vision(): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT ON (kind, coalesce(title, id::text)) id, kind, title, content, horizon, achieved
    FROM vision_items
    WHERE kind IN ('statement', 'method', 'milestone', 'routine', 'goal')
    ORDER BY kind, coalesce(title, id::text), created_at DESC
  `;
  if (!rows.length) return null;
  const order = ["statement", "method", "milestone", "routine", "goal"];
  const lines = rows
    .sort((a, b) => order.indexOf(String(a.kind)) - order.indexOf(String(b.kind)))
    .map((r) => {
      const head = `[${r.kind} #${r.id}]${r.title ? ` (${r.title})` : ""}`;
      if (r.kind === "goal") {
        return `${head}${r.horizon ? ` ${r.horizon}` : ""}${r.achieved ? " — achieved" : ""}${r.content ? ` — ${r.content}` : ""}`;
      }
      return `${head} ${String(r.content ?? "").replace(/\s*\n\s*/g, " / ")}`;
    });
  return `## His vision (statements, methods, 2030 milestones, routines, goals — current versions)\n${lines.join("\n")}`;
}

// capture_thought is Cael's most-used tool, and it used to cost a whole extra
// round first: list_folders, then the capture (91 of 172 captures in the saved
// chats). The folder list is short and changes rarely, so it rides in the brief.
async function folders(): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`SELECT id, name, parent_id FROM folders ORDER BY parent_id NULLS FIRST, name ASC`;
  if (!rows.length) return null;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const path = (r: (typeof rows)[number]): string => {
    const parent = r.parent_id != null ? byId.get(Number(r.parent_id)) : undefined;
    return parent ? `${path(parent)} / ${String(r.name)}` : String(r.name);
  };
  return `## Note folders (folder_id for capture_thought)\n${rows.map((r) => `- ${path(r)} (#${r.id})`).join("\n")}`;
}

async function calendar(today: string): Promise<string | null> {
  const token = await resolveGoogleToken();
  if (!token) return null;
  const { timeMin, timeMax } = zonedDayBounds(today, today);
  const result = await listCalendarEvents(token, { timeMin, timeMax, maxResults: 10 });
  if (!result.success) return null;
  const lines = result.events.map((e) => `- ${e.allDay ? "All day" : clock(e.start)}: ${e.title}`);
  return `## Calendar today\n${lines.length ? lines.join("\n") : "- Nothing scheduled."}`;
}

/** The whole brief as one markdown message, or null if every source failed. */
export async function buildDailySnapshot(): Promise<string | null> {
  const today = todayISO();
  const sections = (
    await Promise.all([
      section(principles),
      section(() => training(today)),
      section(() => career(today)),
      section(() => meals(today)),
      section(() => calendar(today)),
      section(todos),
      section(vision),
      section(folders),
    ])
  ).filter((s): s is string => Boolean(s));
  if (!sections.length) return null;
  return [
    snapshotMarker(today),
    "",
    "Pulled from the app at the start of today's conversation. Use it without re-fetching; call the matching tool when you need more detail than this, or when something may have changed since (he just logged a meal, finished a session, completed a todo).",
    "",
    sections.join("\n\n"),
  ].join("\n");
}
