import { generateImage } from "ai";
import { getDb } from "./db";
import { uploadWebp } from "./image-upload";
import { FOOD_IMAGE_MODEL } from "./nutrition-art";
import { sessionMeta } from "./training";
import { getWorkout } from "./workout-bank";

// A picture for the day's workout on Home, next to the meal photos (Berto,
// 2026-10-29: "for the workouts, lets generate an image for it too that makes
// sense"). One picture per workout, not per session: a bank workout is keyed by
// its slug, anything else by type + title, so Thursday's Threshold Intervals
// shows the same picture every week and is only paid for once.

const PHOTO_STYLE =
  "Cinematic sports photography, natural light, shallow depth of field, real gym or outdoor setting, " +
  "athlete seen from behind or cropped at the shoulders, no faces, no text, no logos, no watermarks";

/** What each session type looks like, so a run never comes back as a barbell. */
const SCENES: Record<string, string> = {
  long_run: "a runner on a long, quiet road at golden hour, mid-stride",
  intervals: "a runner pushing hard on a treadmill or running track, sweat, effort, motion blur",
  easy: "an easy recovery jog on a leafy park path, relaxed and calm",
  hyrox: "a hybrid fitness gym with a sled, wall balls and rowers, an athlete mid-effort",
  strength: "a strength gym with barbells and dumbbells, an athlete mid-lift, chalk in the air",
  yoga: "a calm yoga and mobility session on a mat in a bright, quiet studio",
};

let ready = false;
async function ensureTable() {
  if (ready) return;
  await getDb()`
    CREATE TABLE IF NOT EXISTS training_images (
      key TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  ready = true;
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workout";
}

export type WorkoutArtInput = { type: string; title: string; workout_slug?: string | null };

export function workoutArtKey({ type, title, workout_slug }: WorkoutArtInput): string {
  return workout_slug ? `bank-${workout_slug}` : `${type}-${slug(title)}`;
}

/**
 * The workout's picture: the stored one if it has been made, else a new one.
 * `regenerate` makes a fresh one even when one exists.
 */
export async function workoutImage(input: WorkoutArtInput, opts: { regenerate?: boolean } = {}): Promise<string> {
  await ensureTable();
  const sql = getDb();
  const key = workoutArtKey(input);
  if (!opts.regenerate) {
    const [row] = await sql`SELECT image_url FROM training_images WHERE key = ${key}`;
    if (row) return row.image_url as string;
  }

  // A bank workout's exercises say far more than its name ("Stations" is a sled
  // push, wall balls and a farmers carry).
  const bank = input.workout_slug ? await getWorkout(input.workout_slug).catch(() => null) : null;
  const moves = bank?.blocks.flatMap((b) => b.exercises.map((e) => e.name)).slice(0, 6) ?? [];
  const scene = SCENES[input.type] ?? SCENES.hyrox;
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt:
      `${PHOTO_STYLE}. ${scene}. The workout is "${input.title}" (${sessionMeta(input.type).label}).` +
      (moves.length ? ` It includes ${moves.join(", ")}.` : ""),
    aspectRatio: "16:9",
  });
  const url = await uploadWebp(`training/${key}-${Date.now()}`, image, 960);
  await sql`
    INSERT INTO training_images (key, image_url) VALUES (${key}, ${url})
    ON CONFLICT (key) DO UPDATE SET image_url = EXCLUDED.image_url, created_at = NOW()
  `;
  return url;
}
