// Notion-style saved views for the desktop Tasks table: each tab keeps its own
// filter rules, sorts and grouping. Pure logic — no db import — so the client table
// and the /api/task-views route both use it. The views themselves live in
// app_settings under TASK_VIEWS_KEY (see app/api/task-views/route.ts).
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS } from "@/lib/task-categories";
import { PRIORITIES, isDoneToday, type Todo } from "@/lib/todo";

export const TASK_VIEWS_KEY = "tasks.views.json";

export type StatusValue = "todo" | "working" | "waiting" | "done";
export const STATUS_VALUES: StatusValue[] = ["todo", "working", "waiting", "done"];
export const STATUS_LABEL: Record<StatusValue, string> = {
  todo: "To do",
  working: "In progress",
  waiting: "Waiting",
  done: "Done",
};

export type FilterField = "title" | "status" | "priority" | "category" | "due_date" | "recurrence" | "created_at";

// One shape for every rule: select fields use `values`, dates and text use `value`.
export interface FilterRule {
  id: string;
  field: FilterField;
  op: string;
  values?: string[];
  value?: string;
}

export interface SortRule {
  id: string;
  desc: boolean;
}

export type GroupBy = "none" | "status" | "priority" | "category" | "due_date";

export interface TaskView {
  /** A slug of the name, used as ?view=<id> so a view is linkable by name. */
  id: string;
  name: string;
  filters: FilterRule[];
  sorting: SortRule[];
  groupBy: GroupBy;
}

export const FIELD_LABEL: Record<FilterField, string> = {
  title: "Task",
  status: "Status",
  priority: "Priority",
  category: "Category",
  due_date: "Due",
  recurrence: "Repeats",
  created_at: "Created",
};

export const SORTABLE_FIELDS: FilterField[] = ["title", "status", "priority", "category", "due_date", "created_at"];

export const GROUP_LABEL: Record<GroupBy, string> = {
  none: "None",
  status: "Status",
  priority: "Priority",
  category: "Category",
  due_date: "Due",
};

// The options a select-type field offers, in display order.
export function selectOptions(field: FilterField): { value: string; label: string }[] {
  switch (field) {
    case "status":
      return STATUS_VALUES.map((v) => ({ value: v, label: STATUS_LABEL[v] }));
    case "priority":
      return [...PRIORITIES].reverse().map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));
    case "category":
      return [
        ...TASK_CATEGORIES.map((c) => ({ value: c, label: TASK_CATEGORY_LABELS[c] })),
        { value: "none", label: "No category" },
      ];
    case "recurrence":
      return [
        { value: "none", label: "One-off" },
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
        { value: "monthly", label: "Monthly" },
      ];
    default:
      return [];
  }
}

export type FieldKind = "select" | "date" | "text";
export function fieldKind(field: FilterField): FieldKind {
  if (field === "title") return "text";
  if (field === "due_date" || field === "created_at") return "date";
  return "select";
}

export const OPS: Record<FieldKind, { value: string; label: string; needsValue?: boolean }[]> = {
  select: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  text: [
    { value: "contains", label: "contains", needsValue: true },
    { value: "not_contains", label: "does not contain", needsValue: true },
  ],
  date: [
    { value: "overdue", label: "is overdue" },
    { value: "today", label: "is today" },
    { value: "next_7_days", label: "is within the next 7 days" },
    { value: "past_7_days", label: "is within the past 7 days" },
    { value: "before", label: "is before", needsValue: true },
    { value: "after", label: "is after", needsValue: true },
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ],
};

export function defaultRule(field: FilterField): FilterRule {
  const id = Math.random().toString(36).slice(2, 9);
  const kind = fieldKind(field);
  if (kind === "select") return { id, field, op: "is", values: [] };
  if (kind === "text") return { id, field, op: "contains", value: "" };
  return { id, field, op: field === "due_date" ? "overdue" : "past_7_days" };
}

// The same tabs the old status dropdown offered, so nothing he used goes missing.
export const DEFAULT_VIEWS: TaskView[] = [
  { id: "open", name: "Open", filters: [{ id: "f1", field: "status", op: "is_not", values: ["done"] }], sorting: [], groupBy: "none" },
  { id: "working-now", name: "Working now", filters: [{ id: "f1", field: "status", op: "is", values: ["working"] }], sorting: [], groupBy: "none" },
  { id: "waiting", name: "Waiting", filters: [{ id: "f1", field: "status", op: "is", values: ["waiting"] }], sorting: [], groupBy: "none" },
  { id: "done", name: "Done", filters: [{ id: "f1", field: "status", op: "is", values: ["done"] }], sorting: [], groupBy: "none" },
  { id: "all", name: "All", filters: [], sorting: [], groupBy: "none" },
];

export function slugify(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "view";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// Loose validation for what comes back from storage or a PUT body.
export function parseViews(raw: unknown): TaskView[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const views: TaskView[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") return null;
    const { id, name, filters, sorting, groupBy } = v as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return null;
    views.push({
      id,
      name,
      filters: Array.isArray(filters) ? (filters as FilterRule[]).filter((f) => f && typeof f.field === "string") : [],
      sorting: Array.isArray(sorting) ? (sorting as SortRule[]).filter((s) => s && typeof s.id === "string") : [],
      groupBy: typeof groupBy === "string" && groupBy in GROUP_LABEL ? (groupBy as GroupBy) : "none",
    });
  }
  return views;
}

// ---- Matching ---------------------------------------------------------------

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

export function statusOf(t: Todo): Exclude<StatusValue, "done"> {
  if (t.in_progress) return "working";
  if (t.waiting) return "waiting";
  return "todo";
}

export interface MatchContext {
  completingIds: Set<number>;
  today: string;
  /** Match as if the task were already checked off — used to fade rows on their way out. */
  asDone?: boolean;
}

// A task mid-tick counts as both done and its old status, so it stays in an open
// view long enough to see it leave and shows up in Done right away.
function statusesOf(t: Todo, ctx: MatchContext): StatusValue[] {
  if (ctx.asDone) return ["done"];
  if (ctx.completingIds.has(t.id)) return ["done", statusOf(t)];
  if (t.completed || isDoneToday(t)) return ["done"];
  return [statusOf(t)];
}

function dateKeyOf(t: Todo, field: "due_date" | "created_at"): string {
  const v = t[field];
  if (!v) return "";
  return field === "due_date" ? String(v).slice(0, 10) : dayKey(new Date(v));
}

export function matchesRule(t: Todo, rule: FilterRule, ctx: MatchContext): boolean {
  const kind = fieldKind(rule.field);
  if (kind === "select") {
    const chosen = rule.values ?? [];
    if (chosen.length === 0) return true; // An empty rule is still being set up.
    const have =
      rule.field === "status"
        ? statusesOf(t, ctx)
        : rule.field === "priority"
          ? [t.priority]
          : rule.field === "category"
            ? [t.category ?? "none"]
            : [t.recurrence ?? "none"];
    return rule.op === "is_not" ? have.some((v) => !chosen.includes(v)) : have.some((v) => chosen.includes(v));
  }
  if (kind === "text") {
    const q = (rule.value ?? "").trim().toLowerCase();
    if (!q) return true;
    const hit = t.title.toLowerCase().includes(q);
    return rule.op === "not_contains" ? !hit : hit;
  }
  const d = dateKeyOf(t, rule.field as "due_date" | "created_at");
  switch (rule.op) {
    case "empty":
      return !d;
    case "not_empty":
      return Boolean(d);
    case "overdue":
      return Boolean(d) && d < ctx.today && !statusesOf(t, ctx).includes("done");
    case "today":
      return d === ctx.today;
    case "next_7_days":
      return Boolean(d) && d >= ctx.today && d <= addDays(ctx.today, 6);
    case "past_7_days":
      return Boolean(d) && d <= ctx.today && d >= addDays(ctx.today, -6);
    case "before":
      return !rule.value || (Boolean(d) && d < rule.value);
    case "after":
      return !rule.value || (Boolean(d) && d > rule.value);
    default:
      return true;
  }
}

/** Every rule must match (Notion's default "and"). */
export function matchesFilters(t: Todo, filters: FilterRule[], ctx: MatchContext) {
  return filters.every((r) => matchesRule(t, r, ctx));
}

// ---- Grouping ---------------------------------------------------------------

export interface GroupDef {
  key: string;
  label: string;
}

export function groupDefs(groupBy: GroupBy): GroupDef[] {
  switch (groupBy) {
    case "status":
      return (["working", "waiting", "todo", "done"] as const).map((v) => ({ key: v, label: STATUS_LABEL[v] }));
    case "priority":
    case "category":
      return selectOptions(groupBy).map((o) => ({ key: o.value, label: o.label }));
    case "due_date":
      return [
        { key: "overdue", label: "Overdue" },
        { key: "today", label: "Today" },
        { key: "next_7_days", label: "Next 7 days" },
        { key: "later", label: "Later" },
        { key: "none", label: "No due date" },
      ];
    default:
      return [];
  }
}

export function groupKeyOf(t: Todo, groupBy: GroupBy, ctx: MatchContext): string {
  switch (groupBy) {
    case "status":
      return t.completed || isDoneToday(t) || ctx.completingIds.has(t.id) ? "done" : statusOf(t);
    case "priority":
      return t.priority;
    case "category":
      return t.category ?? "none";
    case "due_date": {
      const d = dateKeyOf(t, "due_date");
      if (!d) return "none";
      if (d < ctx.today) return "overdue";
      if (d === ctx.today) return "today";
      if (d <= addDays(ctx.today, 6)) return "next_7_days";
      return "later";
    }
    default:
      return "";
  }
}

/** The words on a filter chip, e.g. "Status: To do, Waiting" or "Due: is overdue". */
export function ruleSummary(rule: FilterRule): string {
  const label = FIELD_LABEL[rule.field];
  const kind = fieldKind(rule.field);
  if (kind === "select") {
    const opts = selectOptions(rule.field);
    const names = (rule.values ?? []).map((v) => opts.find((o) => o.value === v)?.label ?? v);
    if (names.length === 0) return label;
    return `${label}${rule.op === "is_not" ? " is not" : ":"} ${names.join(", ")}`;
  }
  if (kind === "text") {
    if (!rule.value) return label;
    return `${label} ${rule.op === "not_contains" ? "does not contain" : "contains"} "${rule.value}"`;
  }
  const op = OPS.date.find((o) => o.value === rule.op);
  if (op?.needsValue) return rule.value ? `${label} ${op.label.replace("is ", "")} ${rule.value}` : label;
  return `${label}: ${op?.label ?? rule.op}`;
}
