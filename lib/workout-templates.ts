// Structured workouts — the workout bank. Each is the fixed shape of a session he
// repeats every week, so logging is just typing the reps (or times) per set. The
// bank lives in the `workout_bank` table (lib/workout-bank.ts) and is edited at
// /training/workouts; the definitions below are only its first-run seed.
// Client-safe — no DB imports.
//
// Progression is a rep ladder at a fixed weight (Berto): hit the target on every
// set and the next session's target steps up 10 → 15 → 20; at the top rung the
// page suggests more weight, and a new weight starts back at the bottom rung.

export interface TemplateExercise {
  key: string;
  name: string;
  sets: number;
  /** Rep targets in order (for a timed set: the time to beat, in seconds). One rung =
   *  a fixed target that never steps up; empty = no target, just log it. */
  ladder: number[];
  /** Starting weight in lbs; null for bodyweight, or for a loaded lift not weighed yet. */
  weight: number | null;
  /** Takes a weight even though there's no starting number yet (he types it the first time). */
  loaded?: boolean;
  /** Defaults to lbs; the wall ball is weighed in kg. */
  weightUnit?: "kg";
  /** What a "rep" is. Defaults to reps; the sled counts metres. */
  unit?: "m";
  /** Each set is a time in seconds (lower is better) instead of a rep count. */
  measure?: "time";
  /** One line under the name: how to do it ("90 s easy jog between"). */
  note?: string;
  perSide?: boolean;
  /** Charted week over week. Superset partners and abs are logged but not charted. */
  tracked?: boolean;
}

export interface TemplateBlock {
  key: string;
  label: string;
  exercises: TemplateExercise[];
}

export interface WorkoutPlan {
  km?: number | null;
  pace_sec?: number | null;
  minutes?: number | null;
  intensity?: string | null;
}

export interface WorkoutTemplate {
  slug: string;
  name: string;
  /** Earlier slugs, so old links keep working. */
  aliases?: string[];
  /** Session type on the calendar (lib/training.ts SESSION_TYPES). */
  session_type: string;
  /** Day it lands on in the default week, 0 = Monday … 6 = Sunday; null = not scheduled. */
  default_day: number | null;
  /** Targets copied onto the calendar session (distance + pace for runs, minutes otherwise). */
  plan?: WorkoutPlan;
  warmup?: string;
  cooldown?: string;
  blocks: TemplateBlock[];
}

const LADDER = [10, 15, 20];

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    slug: "unity-standard-upper-body",
    // Named for Unity, his gym (Berto, 2026-10-03).
    name: "Unity Standard Upper Body",
    aliases: ["upper-body"],
    session_type: "strength",
    default_day: 4,
    plan: { minutes: 60, intensity: "moderate" },
    warmup: "3-way shoulder raise: front, side and bent-over, 10–15 lb dumbbells",
    cooldown: "6-minute stretch",
    blocks: [
      {
        key: "superset-1",
        label: "Superset 1",
        exercises: [
          { key: "hammer_row", name: "Hammer row", sets: 4, ladder: LADDER, weight: 135, perSide: true, tracked: true },
          { key: "push_ups", name: "Push-ups", sets: 4, ladder: [20], weight: null },
        ],
      },
      {
        key: "superset-2",
        label: "Superset 2",
        exercises: [
          { key: "hammer_press", name: "Hammer press", sets: 4, ladder: LADDER, weight: 70, perSide: true, tracked: true },
          { key: "sit_ups", name: "Sit-ups", sets: 4, ladder: [20], weight: null },
        ],
      },
      {
        key: "superset-3",
        label: "Superset 3",
        exercises: [
          { key: "chin_ups", name: "Chin-ups", sets: 4, ladder: LADDER, weight: null, tracked: true },
          { key: "toe_touches", name: "Toe touches", sets: 4, ladder: [20], weight: null },
        ],
      },
      {
        key: "superset-4",
        label: "Superset 4",
        exercises: [
          { key: "barbell_row", name: "Bent-over barbell row", sets: 4, ladder: LADDER, weight: 45, perSide: true, tracked: true },
          { key: "tricep_extensions", name: "Bodyweight tricep extensions", sets: 4, ladder: [20], weight: null },
        ],
      },
      {
        key: "ab-circuit",
        label: "Ab circuit",
        exercises: [
          { key: "abs_toe_touches", name: "Toe touches", sets: 3, ladder: [10], weight: null },
          { key: "bicycle_crunches", name: "Bicycle crunches", sets: 3, ladder: [10], weight: null },
          { key: "knee_tucks", name: "Knee tucks", sets: 3, ladder: [10], weight: null },
        ],
      },
    ],
  },
];

// The core finisher both strength days end on.
const CORE_FINISHER: TemplateBlock = {
  key: "ab-circuit",
  label: "Core finisher",
  exercises: [
    { key: "abs_toe_touches", name: "Toe touches", sets: 3, ladder: [10], weight: null },
    { key: "bicycle_crunches", name: "Bicycle crunches", sets: 3, ladder: [10], weight: null },
    { key: "knee_tucks", name: "Knee tucks", sets: 3, ladder: [10], weight: null },
  ],
};

WORKOUT_TEMPLATES.push({
  slug: "unity-standard-lower-body",
  name: "Unity Standard Lower Body",
  session_type: "strength",
  default_day: 1,
  plan: { minutes: 60, intensity: "hard" },
  // Built around the Hyrox legs: sled push, wall balls and lunges (Berto, 2026-10-03).
  blocks: [
    {
      key: "superset-1",
      label: "Superset 1",
      exercises: [
        // 225 = bar + two plates a side; about 10 reps now (Berto, 2026-10-03).
        { key: "back_squat", name: "Back squat", sets: 4, ladder: LADDER, weight: 225, tracked: true },
        // 9 kg is the target ball; when the gym is out of them he logs the one he used.
        { key: "wall_balls", name: "Wall balls", sets: 4, ladder: [15], weight: 9, weightUnit: "kg" },
      ],
    },
    {
      key: "superset-2",
      label: "Superset 2",
      exercises: [
        // Capped at 225 × 10 on purpose — he doesn't want to push deadlifts and get hurt,
        // so no ladder and no weight prompts (Berto, 2026-10-03).
        { key: "deadlift", name: "Deadlift", sets: 4, ladder: [10], weight: 225, tracked: true },
        // Sandbag, or a 40 lb dumbbell in each hand (80 total).
        { key: "walking_lunges", name: "Walking lunges (sandbag / 2 × 40)", sets: 4, ladder: [20], weight: 80 },
      ],
    },
    {
      key: "superset-3",
      label: "Superset 3",
      exercises: [
        { key: "split_squat", name: "Split squat (per leg)", sets: 4, ladder: LADDER, weight: 135, tracked: true },
        // Hamstring curls over back extensions: deadlifts already load the lower back.
        // Hammer Strength plate-loaded curl; 50 is a guess to correct after the first session.
        { key: "hamstring_curls", name: "Hamstring curls (Hammer)", sets: 4, ladder: LADDER, weight: 50, tracked: true },
      ],
    },
    {
      key: "superset-4",
      label: "Superset 4",
      exercises: [
        // Eight 45s on the sled (plates only, the sled itself not counted).
        { key: "sled_push", name: "Heavy sled push", sets: 4, ladder: [25], weight: 360, unit: "m" },
        // No box near the sled lane, so burpees take the box jumps' place.
        { key: "burpees", name: "Burpees", sets: 4, ladder: [10], weight: null },
      ],
    },
    CORE_FINISHER,
  ],
});

const run = (key: string, name: string, target?: number): TemplateExercise => ({
  key, name, sets: 1, ladder: target ? [target] : [], weight: null, measure: "time",
});
const station = (key: string, name: string): TemplateExercise => ({
  key, name, sets: 1, ladder: [], weight: null, measure: "time",
});

// The rest of the week (Berto, 2026-10-03/04). Station times have no targets yet:
// both raced splits (Ottawa 2026, Toronto 2025) were mixed doubles, so the
// station times were shared. Run targets use his own 1 km splits (3:54 avg).
WORKOUT_TEMPLATES.push(
  {
    slug: "threshold-intervals",
    name: "Threshold Intervals",
    session_type: "intervals",
    default_day: 3,
    plan: { km: 11, pace_sec: 225, intensity: "hard" },
    warmup: "15 min easy + 4 × 20 s strides",
    cooldown: "10 min easy",
    blocks: [
      {
        key: "main-set",
        label: "Main set",
        exercises: [
          { key: "km_rep", name: "1 km rep", sets: 6, ladder: [225], weight: null, measure: "time", tracked: true, note: "Hold 3:45 on every rep · 90 s easy jog between" },
        ],
      },
    ],
  },
  {
    slug: "stations",
    name: "Stations",
    session_type: "hyrox",
    default_day: 0,
    plan: { minutes: 60, intensity: "moderate" },
    warmup: "10 min easy jog + drills",
    cooldown: "5 min walk + stretch",
    blocks: [
      { key: "round-1", label: "Round 1", exercises: [run("run_1", "Run 1 km"), station("ski", "SkiErg 1000 m")] },
      { key: "round-2", label: "Round 2", exercises: [run("run_2", "Run 1 km"), { ...station("sled_push", "Sled push 50 m"), loaded: true }] },
      { key: "round-3", label: "Round 3", exercises: [run("run_3", "Run 1 km"), { ...station("sled_pull", "Sled pull 50 m"), loaded: true }] },
      { key: "round-4", label: "Round 4", exercises: [run("run_4", "Run 1 km"), { ...station("wall_balls", "Wall balls × 50"), weight: 9, weightUnit: "kg" }] },
    ],
  },
  {
    slug: "hyrox-sim",
    name: "Hyrox Sim",
    session_type: "hyrox",
    default_day: 5,
    plan: { minutes: 70, intensity: "hard" },
    warmup: "15 min easy + race-pace strides",
    cooldown: "10 min easy + stretch",
    blocks: [
      ["SkiErg 1000 m", "ski"],
      ["Sled push 50 m", "sled_push"],
      ["Sled pull 50 m", "sled_pull"],
      ["Burpee broad jumps 80 m", "bbj"],
      ["Row 1000 m", "row"],
      ["Farmers carry 200 m", "farmers"],
      ["Sandbag lunges 100 m", "lunges"],
      ["Wall balls × 100", "wall_balls"],
    ].map(([name, key], i) => ({
      key: `station-${i + 1}`,
      label: `${i + 1} · ${name.replace(/ [\d×].*$/, "")}`,
      exercises: [run(`run_${i + 1}`, "Run 1 km", 234), station(key, name)],
    })),
  },
  {
    slug: "20k-long-run",
    name: "20K Long Run",
    session_type: "long_run",
    default_day: 6,
    plan: { km: 20, pace_sec: 300, intensity: "easy" },
    blocks: [
      {
        key: "splits",
        label: "Splits",
        exercises: [
          { key: "split_5k", name: "5 km split", sets: 4, ladder: [1500], weight: null, measure: "time", tracked: true, note: "Conversational, zone 2 · 5:00/km" },
        ],
      },
    ],
  },
);

// Wednesday: restorative yoga instead of a full rest day (Berto, 2026-10-04).
WORKOUT_TEMPLATES.push({
  slug: "restorative-yoga",
  name: "Restorative Yoga",
  session_type: "yoga",
  default_day: 2,
  plan: { minutes: 45, intensity: "easy" },
  blocks: [
    {
      key: "session",
      label: "Session",
      exercises: [{ key: "yoga", name: "Restorative yoga", sets: 1, ladder: [], weight: null, measure: "time", note: "Long supported holds, slow breathing — recovery, not a workout" }],
    },
  ],
});

/** The bank's first-run contents. */
export const SEED_WORKOUTS = WORKOUT_TEMPLATES;

export function templateExercises(t: WorkoutTemplate) {
  return t.blocks.flatMap((b) => b.exercises);
}

export function workoutHref(slug: string, date: string) {
  return `/training/workouts/${slug}/${date}`;
}

export interface StrengthLog {
  template: string;
  log_date: string;
  exercise: string;
  weight: number | null;
  target_reps: number;
  reps: (number | null)[];
}

export function hitAll(ex: TemplateExercise, log: Pick<StrengthLog, "reps" | "target_reps">) {
  if (!log.target_reps) return false;
  const done = log.reps.filter((r): r is number => r !== null);
  // A timed set hits by coming in at or under the target; a rep set by reaching it.
  return done.length >= ex.sets && done.every((r) => (ex.measure === "time" ? r <= log.target_reps : r >= log.target_reps));
}

export function hitSet(ex: TemplateExercise, value: number | null, target: number) {
  if (value === null || !target) return false;
  return ex.measure === "time" ? value <= target : value >= target;
}

/** 225 → "3:45", 4980 → "1:23:00". */
export function formatTime(sec: number) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * What he typed into a time box → seconds. "3:45" and "1:23:00" read as written;
 * bare digits are typed on the phone's number pad (no colon there): "345" = 3:45,
 * "12300" = 1:23:00, and one or two digits are whole minutes.
 */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts.reduce((total, n) => total * 60 + n, 0);
  }
  if (!/^\d+$/.test(t)) return null;
  if (t.length <= 2) return Number(t) * 60;
  const ss = Number(t.slice(-2));
  const rest = t.slice(0, -2);
  const mm = rest.length > 2 ? Number(rest.slice(-2)) : Number(rest);
  const hh = rest.length > 2 ? Number(rest.slice(0, -2)) : 0;
  return ss < 60 && mm < 60 ? hh * 3600 + mm * 60 + ss : null;
}

/** Template definitions are JSON in the bank; this keeps any missing optional parts sane. */
export function normalizeTemplate(t: WorkoutTemplate): WorkoutTemplate {
  return {
    ...t,
    default_day: t.default_day ?? null,
    blocks: (t.blocks ?? []).map((b) => ({
      ...b,
      exercises: (b.exercises ?? []).map((e) => ({ ...e, sets: Math.max(1, Math.round(e.sets || 1)), ladder: e.ladder ?? [] })),
    })),
  };
}

export interface Prescription {
  weight: number | null;
  target: number;
  /** Top rung cleared on every set — time to add weight. */
  bumpSuggested: boolean;
}

/** What to aim for next time, from the last session's log of this exercise. */
export function nextPrescription(ex: TemplateExercise, last: StrengthLog | null): Prescription {
  if (!last) return { weight: ex.weight, target: ex.ladder[0] ?? 0, bumpSuggested: false };
  if (!hitAll(ex, last)) return { weight: last.weight, target: last.target_reps, bumpSuggested: false };
  const i = ex.ladder.indexOf(last.target_reps);
  if (i >= 0 && i < ex.ladder.length - 1) return { weight: last.weight, target: ex.ladder[i + 1], bumpSuggested: false };
  return { weight: last.weight, target: last.target_reps, bumpSuggested: ex.ladder.length > 1 };
}

export function totalReps(reps: (number | null)[]) {
  return reps.reduce<number>((sum, r) => sum + (r ?? 0), 0);
}
