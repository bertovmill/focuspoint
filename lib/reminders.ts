import { Schedules, SchedulesApiError, type Schedule } from "@vercel/schedules";

/**
 * Cael's own reminders, on Vercel Schedules (public beta, Nov 2026).
 *
 * Until now Cael could only run on the two static crons in vercel.json. A
 * dynamic schedule is created from code at runtime, one-off or recurring, in a
 * real timezone: "nudge me Friday 9am" becomes Schedules.create() while we talk,
 * no redeploy. Each firing publishes a message to the `cael-reminders` Queue
 * topic; app/api/queues/cael-reminders/route.ts consumes it and sends a push to
 * every device (lib/push.ts), the same channel as the habit nudge.
 *
 * The SDK authenticates with the deployment's OIDC token on Vercel. Locally it
 * needs `vercel dev` (which runs a local scheduler) or a `VERCEL_OIDC_TOKEN`
 * from `vercel env pull`.
 */

export const REMINDER_TOPIC = "cael-reminders";
export const REMINDER_NAMESPACE = "reminders";
export const REMINDER_TIMEZONE = "America/Toronto";

export type ReminderPayload = {
  /** What the push says. */
  message: string;
  /** Where the notification opens in the app; defaults to home. */
  url?: string;
  /** The todo this reminder is about, if any. */
  todo_id?: number;
};

export type ReminderSummary = {
  name: string;
  message: string;
  /** "once at 2026-11-07T09:00" or "cron 0 9 * * 1-5", in Toronto time. */
  when: string;
  state: Schedule["state"];
  timezone: string;
  todo_id?: number;
};

function slug(message: string): string {
  const base = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const stamp = Date.now().toString(36);
  // Names must start with a letter or number; an all-punctuation message
  // would otherwise leave an empty base.
  return `${base || "reminder"}-${stamp}`;
}

/** YYYY-MM-DDTHH:mm, the local-time shape the API wants (no zone suffix). */
const LOCAL_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00)?$/;

/**
 * The API doesn't return a schedule's payload on create/list/get, only to the
 * queue when it fires. The name carries the first 40 characters of the message
 * (see slug()), so that's what a listing can show; `message` overrides it when
 * the caller still has the original (right after create).
 */
export function describeReminder(s: Schedule, message?: string): ReminderSummary {
  const payload = ((s as unknown as { payload?: ReminderPayload }).payload ?? {}) as ReminderPayload;
  const fromName = s.name.replace(/-[a-z0-9]{6,}$/, "").replace(/-/g, " ");
  return {
    name: s.name,
    message: message ?? payload.message ?? fromName,
    when: s.expression.type === "single" ? `once at ${s.expression.at}` : `cron ${s.expression.cron}`,
    state: s.state,
    timezone: s.timezone,
    todo_id: payload.todo_id,
  };
}

/** Turns an SDK error into a sentence the model can relay; rethrows anything else. */
export function explainScheduleError(err: unknown): string {
  if (err instanceof SchedulesApiError) {
    switch (err.code) {
      case "not_enabled":
        return "Vercel Schedules isn't enabled for this team yet (it's in beta).";
      case "single_at_in_past":
        return "That time is already in the past (Toronto time).";
      case "invalid_cron_expression":
        return "That cron expression isn't valid.";
      case "feature_blocked":
      case "schedule_limit_exceeded":
        return "The team has hit its Vercel Schedules limit for now.";
      case "unauthorized":
      case "forbidden":
        return "The deployment's OIDC token can't reach Vercel Schedules (local dev needs `vercel dev` or a pulled VERCEL_OIDC_TOKEN).";
      default:
        return `Vercel Schedules error (${err.code ?? err.status}): ${err.message}`;
    }
  }
  throw err;
}

export async function createReminder(input: {
  message: string;
  /** Local Toronto time, YYYY-MM-DDTHH:mm. Exactly one of `at` / `cron`. */
  at?: string;
  cron?: string;
  url?: string;
  todo_id?: number;
}): Promise<Schedule> {
  const { message, at, cron, url, todo_id } = input;
  if (!!at === !!cron) throw new Error("Pass exactly one of `at` (one-off) or `cron` (recurring).");
  if (at && !LOCAL_AT.test(at)) {
    throw new Error("`at` must be local Toronto time as YYYY-MM-DDTHH:mm, with no timezone suffix.");
  }
  const payload: ReminderPayload = { message };
  if (url) payload.url = url;
  if (todo_id != null) payload.todo_id = todo_id;
  return Schedules.create({
    name: slug(message),
    namespace: REMINDER_NAMESPACE,
    expression: at ? { type: "single", at } : { type: "cron", cron: cron! },
    timezone: REMINDER_TIMEZONE,
    target: { topic: REMINDER_TOPIC },
    payload,
  });
}

export async function listReminders(): Promise<Schedule[]> {
  const out: Schedule[] = [];
  let cursor: string | undefined;
  do {
    const page = await Schedules.list({ namespace: REMINDER_NAMESPACE, limit: 100, cursor });
    out.push(...page.data);
    cursor = page.cursor ?? undefined;
  } while (cursor);
  return out;
}

export async function cancelReminder(name: string): Promise<void> {
  await Schedules.delete({ name, namespace: REMINDER_NAMESPACE });
}
