import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  completeTask,
  elapsedSeconds,
  listTasks,
  startTask,
  stopTask,
  taskStatus,
  type TaskFilter,
  type TaskRow,
} from "@/lib/tasks";
import { TASK_CATEGORY_LABELS, normalizeCategory } from "@/lib/task-categories";
import { WORKING_LIMIT } from "@/lib/working-now";

// An MCP server over the task list, so Claude — in Claude Code, on claude.ai, in
// the desktop app — can see what Berto is actually working on and keep the board
// honest while it works. Read plus status changes only: no creating or deleting
// tasks from here, that stays a decision Berto makes in the app.
//
// Connect with:
//   claude mcp add --transport http --scope user focuspoint \
//     https://cael.bertomill.com/api/mcp --header "Authorization: Bearer $FOCUSPOINT_MCP_TOKEN"

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
  return `#${t.id} [${STATUS_LABELS[taskStatus(t)]}] ${t.title}${suffix}`;
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
          "Berto's task list from focuspoint. Every task sits in one of three lanes: " +
          `'working_now' (in progress right now, capped at ${WORKING_LIMIT}), 'waiting' (blocked on ` +
          "someone else), and 'up_next' (everything else that isn't finished). Call this " +
          "before starting work so you know what's already in flight.",
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
      "start_task",
      {
        title: "Start working on a task",
        description:
          "Move a task into 'working now' and start its timer. Use this when Berto starts " +
          `the work, so the board and the time log stay true. Only ${WORKING_LIMIT} tasks can be ` +
          "in progress at once — starting a sixth is refused.",
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
          "Stop the timer on a task and bank the time spent. By default the task stays in " +
          "'working now' (a pause). Pass move_to to also take it out: 'up_next' to put it back " +
          "in the queue, or 'waiting' when it's blocked on someone else.",
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
          "Cross a task off. Banks any running timer and writes a done-block onto Berto's " +
          "Google Calendar so the week can be audited. Only call this once the work is " +
          "actually finished and verified — never to tidy the list up.",
        inputSchema: z.object({
          id: z.number().int().describe("Task id, as shown by list_tasks."),
          repeat: z
            .boolean()
            .default(false)
            .describe("Also line the same work up again for tomorrow."),
        }),
        annotations: { destructiveHint: true },
      },
      async ({ id, repeat }) => {
        const result = await completeTask(id, { repeat });
        if (!result.ok) return fail(result.error);
        const notes = [
          result.recurring ? `It recurs — next due ${result.next_due}.` : null,
          result.repeated ? `Queued again for tomorrow as #${result.repeated.id}.` : null,
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
    serverInfo: { name: "focuspoint-tasks", version: "1.0.0" },
    instructions:
      "Berto's task list. Call list_tasks to see what's in flight before starting work, " +
      "start_task when he begins something, stop_task to pause or hand it off, and " +
      "complete_task only when the work is genuinely done.",
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
