import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  completeTask,
  createTask,
  elapsedSeconds,
  listTasks,
  startTask,
  stopTask,
  taskStatus,
  type TaskFilter,
  type TaskRow,
} from "@/lib/tasks";
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS, normalizeCategory } from "@/lib/task-categories";
import { addTaskUpdate } from "@/lib/task-updates";
import { WORKING_LIMIT } from "@/lib/working-now";

// An MCP server over the task list, so Claude — in Claude Code, on claude.ai, in
// the desktop app — can see what Berto is actually working on and keep the board
// honest while it works. Read, add and status changes — deleting a task is not
// here, that stays a decision Berto makes in the app.
//
// Registered as "cael", because that is what Berto calls this agent — the tools
// end up as mcp__cael__list_tasks and so on. Every description below says both
// "Cael" and "real"/"actual", on purpose: Claude Code ships its own per-session
// task scratchpad (TaskList/TaskCreate), and a session asked "what are my tasks"
// will otherwise answer from that empty list instead of from this board.
//
// Connect with:
//   claude mcp add --transport http --scope user cael \
//     https://cael.bertomill.com/api/mcp --header "Authorization: Bearer $MCP_TOKEN"

export const maxDuration = 60;

const STATUS_LABELS = {
  working_now: "working now",
  waiting: "waiting on someone",
  up_next: "up next",
  done: "done",
} as const;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

/** One task as a line a model can read without unpacking JSON. */
function formatTask(t: TaskRow): string {
  const bits: string[] = [];
  const category = normalizeCategory(t.category);
  if (category) bits.push(TASK_CATEGORY_LABELS[category]);
  if (t.priority && t.priority !== "normal") bits.push(`${t.priority} priority`);
  if (t.due_date) bits.push(`due ${String(t.due_date).slice(0, 10)}`);
  if (t.estimated_minutes) bits.push(`est ${t.estimated_minutes}m`);
  const spent = elapsedSeconds(t);
  if (spent > 0) bits.push(`spent ${formatDuration(spent)}${t.timer_started_at ? ", timer running" : ""}`);
  if (t.parent_id) bits.push(`part of #${t.parent_id}`);
  const suffix = bits.length ? ` (${bits.join(", ")})` : "";
  // The newest progress note, on its own indented line — it's prose, and cramming
  // it into the parenthesised chips would make every task line unreadable.
  const update = t.last_update
    ? `\n    last update (${t.last_update_by === "agent" ? "agent" : "Berto"}): ${t.last_update}`
    : "";
  return `#${t.id} [${STATUS_LABELS[taskStatus(t)]}] ${t.title}${suffix}${update}`;
}

/** The shape handed back as structuredContent, trimmed to what a caller needs. */
function taskJson(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    status: taskStatus(t),
    timer_running: Boolean(t.timer_started_at),
    seconds_spent: elapsedSeconds(t),
    estimated_minutes: t.estimated_minutes,
    priority: t.priority,
    due_date: t.due_date ? String(t.due_date).slice(0, 10) : null,
    category: normalizeCategory(t.category),
    parent_id: t.parent_id,
    last_update: t.last_update ?? null,
    last_update_by: t.last_update_by ?? null,
    last_update_at: t.last_update_at ? new Date(t.last_update_at).toISOString() : null,
  };
}

function ok(text: string, structured?: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], ...(structured ? { structuredContent: structured } : {}) };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description:
          "Berto's REAL task list — the live board in Cael (focuspoint), the one he actually " +
          "works from. This is the answer to 'what am I working on', 'what's on my plate' or " +
          "'what does Cael say I'm doing', in any repo and any session. It is NOT the same as " +
          "the per-session task scratchpad Claude Code keeps; prefer this one for Berto's own " +
          "work. Every task sits in one of three lanes: " +
          `'working_now' (in progress right now, capped at a limit Berto sets between 1 and ${WORKING_LIMIT} — ` +
          "1 on a day where one thing matters), 'waiting' (blocked on " +
          "someone else), and 'up_next' (everything else that isn't finished). Each task also " +
          "carries its latest progress note (last_update) and who wrote it — 'me' is Berto, " +
          "'agent' is an agent like you. Call this before starting work so you know what's " +
          "already in flight and where it was left.",
        inputSchema: z.object({
          status: z
            .enum(["working_now", "waiting", "up_next", "open", "done", "all"])
            .default("open")
            .describe(
              "Which lane to read. 'open' (default) is every unfinished task; 'done' is what was completed today; 'all' includes older completed tasks.",
            ),
          limit: z.number().int().min(1).max(200).default(100).describe("Max tasks to return."),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ status, limit }) => {
        const tasks = await listTasks(status as TaskFilter, limit);
        if (!tasks.length) return ok(`No tasks in '${status}'.`, { tasks: [] });
        const text = tasks.map(formatTask).join("\n");
        return ok(`${tasks.length} task(s) in '${status}':\n${text}`, { tasks: tasks.map(taskJson) });
      },
    );

    server.registerTool(
      "create_task",
      {
        title: "Add a task",
        description:
          "Put a new task on Berto's real board in Cael — the list he actually works from, not " +
          "Claude Code's per-session scratchpad. Use this when he says to add, capture or " +
          "remember a piece of work. It lands in 'up_next'; use start_task to begin it.",
        inputSchema: z.object({
          title: z.string().min(1).describe("What needs to be done, in Berto's own words."),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          due_date: z.string().optional().describe("ISO date, e.g. '2026-08-30'. Omit if there's no deadline."),
          estimated_minutes: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Rough time it'll take, in minutes. Omit rather than guessing wildly."),
          recurrence: z
            .enum(["none", "daily", "weekly", "monthly"])
            .default("none")
            .describe("How often it repeats. 'none' means one-time."),
          category: z
            .enum(TASK_CATEGORIES)
            .optional()
            .describe("Kind of work, if it's clearly one of these. Most tasks are none of them — leave it off."),
        }),
      },
      async ({ title, priority, due_date, estimated_minutes, recurrence, category }) => {
        const result = await createTask({
          title,
          priority,
          due_date,
          recurrence,
          estimated_minutes,
          category,
        });
        if (!result.ok) return fail(result.error);
        return ok(`Added #${result.task.id} — ${result.task.title}. It's in up next.`, taskJson(result.task));
      },
    );

    server.registerTool(
      "post_task_update",
      {
        title: "Post an update on a task",
        description:
          "Leave a short progress note on a task on Berto's real board in Cael. This is how " +
          "you tell him where the work stands without him having to read a session " +
          "transcript: post one when you finish an intermediary step, when you hit " +
          "something you need him to decide or do, or when you hand the work back. The note " +
          "shows on the task's card, tagged as coming from an agent, and the whole thread is " +
          "kept. It does NOT move the task between lanes — use start_task/stop_task/" +
          "complete_task for that. Write it as one or two plain sentences: what's done, and " +
          "what's needed next.",
        inputSchema: z.object({
          id: z.number().int().describe("Task id, as shown by list_tasks."),
          update: z
            .string()
            .min(1)
            .describe(
              "The note, in plain language — e.g. 'Draft's written and pushed to the branch; " +
                "needs your read before I open the PR.'",
            ),
        }),
      },
      async ({ id, update }) => {
        const result = await addTaskUpdate(id, update, "agent");
        if (!result.ok) return fail(result.error);
        return ok(`Posted an update on #${id}: ${result.update.body}`, {
          id,
          update_id: result.update.id,
          update: result.update.body,
          author: result.update.author,
          posted_at: new Date(result.update.created_at).toISOString(),
        });
      },
    );

    server.registerTool(
      "start_task",
      {
        title: "Start working on a task",
        description:
          "Move a task on Berto's real board in Cael into 'working now' and start its timer. " +
          "Use this when he starts the work, so the board and the time log stay true. Only so many " +
          `tasks can be in progress at once (at most ${WORKING_LIMIT}, and he can set it as low as 1 ` +
          "when he's focusing) — starting one past the limit is refused, and the error says what the " +
          "limit is.",
        inputSchema: z.object({ id: z.number().int().describe("Task id, as shown by list_tasks.") }),
      },
      async ({ id }) => {
        const result = await startTask(id);
        if (!result.ok) return fail(result.error);
        return ok(`Started #${result.task.id} — ${result.task.title}. Timer running.`, taskJson(result.task));
      },
    );

    server.registerTool(
      "stop_task",
      {
        title: "Stop a task's timer",
        description:
          "Stop the timer on a task on Berto's real board in Cael and bank the time spent. By " +
          "default the task stays in 'working now' (a pause). Pass move_to to also take it out: " +
          "'up_next' to put it back in the queue, or 'waiting' when it's blocked on someone else.",
        inputSchema: z.object({
          id: z.number().int().describe("Task id, as shown by list_tasks."),
          move_to: z
            .enum(["up_next", "waiting"])
            .optional()
            .describe("Where to move the task. Omit to pause the timer and leave it in 'working now'."),
        }),
      },
      async ({ id, move_to }) => {
        const result = await stopTask(id, move_to);
        if (!result.ok) return fail(result.error);
        const t = result.task;
        const where = move_to ? ` Moved to ${STATUS_LABELS[taskStatus(t)]}.` : " Still in working now.";
        return ok(
          `Stopped #${t.id} — ${t.title}. ${formatDuration(elapsedSeconds(t))} logged.${where}`,
          taskJson(t),
        );
      },
    );

    server.registerTool(
      "complete_task",
      {
        title: "Complete a task",
        description:
          "Cross a task off Berto's real board in Cael. Banks any running timer and writes a " +
          "done-block onto his Google Calendar so the week can be audited. Only call this once " +
          "the work is actually finished and verified — never to tidy the list up.",
        inputSchema: z.object({
          id: z.number().int().describe("Task id, as shown by list_tasks."),
          repeat: z
            .boolean()
            .default(false)
            .describe("Also line the same work up again for tomorrow."),
          follow_up_days: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              "Done for now, but it needs a second pass: queue the same task again this many " +
                "days out (1, 3, 7, 14). Overrides `repeat`.",
            ),
        }),
        annotations: { destructiveHint: true },
      },
      async ({ id, repeat, follow_up_days }) => {
        const result = await completeTask(id, { repeat, followUpDays: follow_up_days ?? null });
        if (!result.ok) return fail(result.error);
        const notes = [
          result.recurring ? `It recurs — next due ${result.next_due}.` : null,
          result.repeated ? `Queued again for ${result.repeated.due_date} as #${result.repeated.id}.` : null,
          result.calendar_event_id ? "Logged to Google Calendar." : null,
        ].filter(Boolean);
        return ok([`Completed #${id}.`, ...notes].join(" "), {
          id,
          recurring: result.recurring,
          next_due: result.next_due,
          repeated_id: result.repeated?.id ?? null,
        });
      },
    );
  },
  {
    serverInfo: { name: "cael", version: "1.3.0" },
    instructions:
      "Cael — Berto's life agent. These tools read and move his REAL task board, the one he " +
      "works from every day; they are not Claude Code's per-session task scratchpad, and when " +
      "he asks what he is working on, this is the list he means. Call list_tasks to see what's " +
      "in flight before starting work, create_task to add something he asks you to remember, " +
      "start_task when he begins something, stop_task to pause or hand it off, " +
      "post_task_update to leave a progress note on a task when you finish a step or need " +
      "him to take the next one, and complete_task only when the work is genuinely done.",
  },
);

/**
 * A single shared secret, checked in constant time. The app's own middleware
 * bounces anything without a session, so this route is also allow-listed there
 * on the same header — the check has to live in both places.
 */
function verifyToken(_req: Request, bearer?: string) {
  const expected = process.env.MCP_TOKEN;
  if (!expected || !bearer) return undefined;
  const a = new TextEncoder().encode(bearer);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return undefined;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return undefined;
  return { token: bearer, clientId: "focuspoint-mcp", scopes: ["tasks:read", "tasks:write"] };
}

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
