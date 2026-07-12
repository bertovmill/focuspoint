// Minimal 5-field cron support (minute hour day-of-month month day-of-week),
// evaluated in UTC. Each field is "*" or a comma-separated list of exact
// integers — no ranges or step values, since every task this app schedules
// is either daily or weekly on a fixed day/time.

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week, 0 = Sunday
];

function parseField(field: string, [min, max]: [number, number]): number[] | "*" {
  if (field === "*") return "*";
  const values = field.split(",").map((v) => Number(v.trim()));
  if (values.some((v) => !Number.isInteger(v) || v < min || v > max)) {
    throw new Error(`Cron field "${field}" out of range ${min}-${max}`);
  }
  return values;
}

export function isValidCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  try {
    fields.forEach((f, i) => parseField(f, FIELD_RANGES[i]));
    return true;
  } catch {
    return false;
  }
}

export function cronMatches(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ];
  try {
    return fields.every((f, i) => {
      const parsed = parseField(f, FIELD_RANGES[i]);
      return parsed === "*" || parsed.includes(values[i]);
    });
  } catch {
    return false;
  }
}

/**
 * Like cronMatches, but ignores the minute/hour fields — only day-of-month,
 * month, and day-of-week must match. Used by the once-daily dispatcher (Vercel
 * Hobby plans cap ALL cron jobs at once per day, so per-task time-of-day can't
 * be honored precisely; every enabled task due "today" fires on the single
 * daily dispatcher tick instead).
 */
export function cronMatchesDate(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCDay()];
  try {
    return [2, 3, 4].every((fieldIndex, i) => {
      const parsed = parseField(fields[fieldIndex], FIELD_RANGES[fieldIndex]);
      return parsed === "*" || parsed.includes(values[i]);
    });
  } catch {
    return false;
  }
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Human-readable summary for the UI, e.g. "Daily at 9:00 PM UTC". Falls back to the raw cron string for anything not daily/weekly. */
export function describeCron(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = fields;

  const h = Number(hour);
  const m = Number(minute);
  const isFixedTime = dom === "*" && month === "*" && Number.isInteger(h) && Number.isInteger(m);
  if (isFixedTime) {
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const time = `${h12}:${String(m).padStart(2, "0")} ${period} UTC`;
    if (dow === "*") return `Daily at ${time}`;
    if (Number.isInteger(Number(dow)) && !dow.includes(",")) {
      return `Weekly on ${DAY_NAMES[Number(dow)]} at ${time}`;
    }
  }
  return `${cron} (UTC)`;
}
