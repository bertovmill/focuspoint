// Structured workouts: the fixed shape of a session he repeats every week, so
// logging is just typing the reps per set. Hardcoded for the current block
// (Berto, 2026-10-03); when the routine changes every couple of months the old
// template is archived and a new one added here. Client-safe — no DB imports.
//
// Progression is a rep ladder at a fixed weight (Berto): hit the target on every
// set and the next session's target steps up 10 → 15 → 20; at the top rung the
// page suggests more weight, and a new weight starts back at the bottom rung.

export interface TemplateExercise {
  key: string;
  name: string;
  sets: number;
  /** Rep targets in order. One rung = a fixed target that never steps up. */
  ladder: number[];
  /** Starting weight in lbs; null for bodyweight, or for a loaded lift not weighed yet. */
  weight: number | null;
  /** Takes a weight even though there's no starting number yet (he types it the first time). */
  loaded?: boolean;
  /** Defaults to lbs; the wall ball is weighed in kg. */
  weightUnit?: "kg";
  /** What a "rep" is. Defaults to reps; the sled counts metres. */
  unit?: "m";
  perSide?: boolean;
  /** Charted week over week. Superset partners and abs are logged but not charted. */
  tracked?: boolean;
}

export interface TemplateBlock {
  key: string;
  label: string;
  exercises: TemplateExercise[];
}

export interface WorkoutTemplate {
  slug: string;
  name: string;
  /** Earlier slugs, so old links keep working. */
  aliases?: string[];
  /** Matches a planned session to this template (strength sessions whose title fits). */
  match: RegExp;
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
    match: /upper[\s-]*body/i,
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
  match: /lower[\s-]*body/i,
  // Built around his Hyrox weak spots (Berto, 2026-10-03): sled push (Ottawa rank 34),
  // wall balls (22) and lunges. Starting weights come from his first session.
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
        { key: "deadlift", name: "Deadlift", sets: 4, ladder: LADDER, weight: null, loaded: true, tracked: true },
        { key: "walking_lunges", name: "Walking lunges", sets: 4, ladder: [20], weight: null },
      ],
    },
    {
      key: "superset-3",
      label: "Superset 3",
      exercises: [
        { key: "split_squat", name: "Split squat (per leg)", sets: 4, ladder: LADDER, weight: null, loaded: true, tracked: true },
        // Hamstring curls over back extensions: deadlifts already load the lower back.
        { key: "hamstring_curls", name: "Hamstring curls", sets: 4, ladder: LADDER, weight: null, loaded: true, tracked: true },
      ],
    },
    {
      key: "superset-4",
      label: "Superset 4",
      exercises: [
        { key: "sled_push", name: "Heavy sled push", sets: 4, ladder: [25], weight: null, loaded: true, unit: "m" },
        { key: "box_jumps", name: "Box jumps", sets: 4, ladder: [8], weight: null },
      ],
    },
    CORE_FINISHER,
  ],
});

export function getTemplate(slug: string) {
  return WORKOUT_TEMPLATES.find((t) => t.slug === slug || t.aliases?.includes(slug)) ?? null;
}

export function templateExercises(t: WorkoutTemplate) {
  return t.blocks.flatMap((b) => b.exercises);
}

/** The template a planned session logs into, if any. */
export function templateForSession(s: { type: string; title: string }) {
  if (s.type !== "strength") return null;
  return WORKOUT_TEMPLATES.find((t) => t.match.test(s.title)) ?? null;
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
  const done = log.reps.filter((r): r is number => r !== null);
  return done.length >= ex.sets && done.every((r) => r >= log.target_reps);
}

export interface Prescription {
  weight: number | null;
  target: number;
  /** Top rung cleared on every set — time to add weight. */
  bumpSuggested: boolean;
}

/** What to aim for next time, from the last session's log of this exercise. */
export function nextPrescription(ex: TemplateExercise, last: StrengthLog | null): Prescription {
  if (!last) return { weight: ex.weight, target: ex.ladder[0], bumpSuggested: false };
  if (!hitAll(ex, last)) return { weight: last.weight, target: last.target_reps, bumpSuggested: false };
  const i = ex.ladder.indexOf(last.target_reps);
  if (i >= 0 && i < ex.ladder.length - 1) return { weight: last.weight, target: ex.ladder[i + 1], bumpSuggested: false };
  return { weight: last.weight, target: last.target_reps, bumpSuggested: ex.ladder.length > 1 };
}

export function totalReps(reps: (number | null)[]) {
  return reps.reduce<number>((sum, r) => sum + (r ?? 0), 0);
}
