import { generateText, Output } from "ai";
import { z } from "zod";
import { ensureSchema, getDb } from "./db";
import { todayISO } from "@/agent/lib/now";
import { createTask } from "./tasks";
import { addTaskUpdate } from "./task-updates";
import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "./settings-doc";

// The evening reading loop (2026-11-03). Berto swapped NFL for an evening
// obsession that pays back: read what excites him, then tweet or film his take.
//  1. 7pm (cron) — Cael picks ONE read from founder/startup/AI essays (or a
//     book), puts it on the board as a task, and pushes a notification.
//  2. He rates it 👍/👎 with a one-liner on /writing?tab=reading (or tells Cael).
//  3. The interest profile — a short markdown doc — is rewritten from every
//     rating, his recent tweets, articles and finished books, and the next
//     pick is chosen against it. Same shape as lib/meal-feedback.ts.

const MODEL = "anthropic/claude-sonnet-4.6";
const PROFILE_KEY = "reading.interest_profile.markdown";
const PROFILE_GENERATED_KEY = "reading.interest_profile.generated";

// Feeds checked 2026-11-03. Founder and operator writing first, not news.
const SOURCES = [
  { name: "Paul Graham", url: "http://www.aaronsw.com/2002/feeds/pgessays.rss", sample: 12 },
  { name: "Naval", url: "https://nav.al/feed" },
  { name: "Stratechery", url: "https://stratechery.com/feed/" },
  { name: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com/feed" },
  { name: "Not Boring", url: "https://www.notboring.co/feed" },
  { name: "Latent Space", url: "https://www.latent.space/feed" },
  { name: "Y Combinator", url: "https://www.ycombinator.com/blog/rss" },
  { name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed" },
  { name: "Elena Verna", url: "https://www.elenaverna.com/feed" },
  { name: "SaaStr", url: "https://www.saastr.com/feed/" },
];
const PER_SOURCE = 6;

export type ReadingRating = "up" | "down";

export type ReadingPick = {
  id: number;
  date: string;
  title: string;
  url: string;
  source: string;
  kind: "article" | "book";
  why: string;
  prompt: string;
  taskId: number | null;
  rating: ReadingRating | null;
  feedback: string | null;
};

type Candidate = { title: string; url: string; source: string };

function shape(r: Record<string, unknown>): ReadingPick {
  return {
    id: r.id as number,
    date: r.date as string,
    title: r.title as string,
    url: r.url as string,
    source: r.source as string,
    kind: r.kind === "book" ? "book" : "article",
    why: r.why as string,
    prompt: r.prompt as string,
    taskId: (r.task_id as number | null) ?? null,
    rating: (r.rating as ReadingRating | null) ?? null,
    feedback: (r.feedback as string | null) ?? null,
  };
}

const COLUMNS = `id, to_char(pick_date, 'YYYY-MM-DD') AS date, title, url, source, kind, why, prompt, task_id, rating, feedback`;

export async function listReadingPicks(limit = 30): Promise<ReadingPick[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT ${sql.unsafe(COLUMNS)} FROM reading_picks ORDER BY pick_date DESC LIMIT ${limit}`;
  return rows.map(shape);
}

export async function getReadingPick(id: number): Promise<ReadingPick | null> {
  await ensureSchema();
  const sql = getDb();
  const [row] = await sql`SELECT ${sql.unsafe(COLUMNS)} FROM reading_picks WHERE id = ${id}`;
  return row ? shape(row) : null;
}

export function getInterestProfile(): Promise<SettingsDoc> {
  return getSettingsDoc(PROFILE_KEY);
}

export function setInterestProfile(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(PROFILE_KEY, content);
}

// ── candidates ─────────────────────────────────────────────────────────────

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

function link(block: string): string {
  const rss = tag(block, "link");
  if (rss.startsWith("http")) return rss;
  const atom = block.match(/<link[^>]+href="([^"]+)"/);
  return atom ? atom[1] : "";
}

async function fetchSource(src: (typeof SOURCES)[number]): Promise<Candidate[]> {
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Cael reading picks)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/g) ?? [];
    let items = blocks
      .map((b) => ({ title: tag(b, "title"), url: link(b), source: src.name }))
      .filter((c) => c.title && c.url.startsWith("http"));
    // PG's feed is every essay ever; a random handful keeps the old classics in play.
    if (src.sample) items = items.sort(() => Math.random() - 0.5).slice(0, src.sample);
    return items.slice(0, PER_SOURCE);
  } catch {
    return [];
  }
}

export async function gatherCandidates(): Promise<Candidate[]> {
  const sql = getDb();
  const seen = new Set((await sql`SELECT url FROM reading_picks`).map((r) => r.url as string));
  const all = (await Promise.all(SOURCES.map(fetchSource))).flat();
  return all.filter((c) => !seen.has(c.url));
}

// ── what he's into ─────────────────────────────────────────────────────────

/** Ratings, recent tweets, articles and books: the evidence the profile and the pick work from. */
async function signals() {
  const sql = getDb();
  const [ratings, tweets, posts, books] = await Promise.all([
    sql`SELECT title, source, kind, rating, feedback FROM reading_picks WHERE rating IS NOT NULL OR feedback IS NOT NULL ORDER BY pick_date DESC LIMIT 40`,
    sql`SELECT text FROM tweets WHERE account IS NULL OR account = 'robrt_mill' ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT title, summary FROM posts ORDER BY updated_at DESC LIMIT 10`,
    sql`SELECT book_title FROM reading_logs WHERE NOT is_estimate ORDER BY logged_date DESC LIMIT 10`,
  ]);
  return {
    ratings: ratings
      .map((r) => {
        const thumb = r.rating === "up" ? "LIKED" : r.rating === "down" ? "DISLIKED" : "NOTE";
        return `- ${thumb}: ${r.title} (${r.source}, ${r.kind})${r.feedback ? ` — "${r.feedback}"` : ""}`;
      })
      .join("\n"),
    tweets: tweets.map((t) => `- ${String(t.text).replace(/\s+/g, " ").slice(0, 240)}`).join("\n"),
    posts: posts.map((p) => `- ${p.title}${p.summary ? `: ${p.summary}` : ""}`).join("\n"),
    books: books.map((b) => `- ${b.book_title}`).join("\n"),
  };
}

const lines = (doc: string) =>
  doc
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Rewrites the interest profile. Lines he typed in himself (anything not in
 * the model's last version) are kept word for word, as on the meal profile.
 */
export async function refreshInterestProfile(): Promise<SettingsDoc> {
  const s = await signals();
  const generated = new Set(lines((await getSettingsDoc(PROFILE_GENERATED_KEY)).content));
  const his = lines((await getInterestProfile()).content).filter((l) => !l.startsWith("#") && !generated.has(l));

  const { text } = await generateText({
    model: MODEL,
    system: `You keep Berto's reading interest profile: a short markdown note that decides what Cael suggests he read each evening. He is a GTM and AI engineer in Toronto who runs events-led go-to-market (MakersLounge), admires SF founders and thinkers like Naval and Paul Graham, and wants an evening obsession that pays back: he reads, then tweets or films his take.

Format:
## Lights him up
## Skip
## Try next
Short, concrete bullets: topics, authors, formats, length. Weight his 👍/👎 and reasons most, then what he tweets and writes about. "Try next" is 2–3 adjacent topics or books to test, so the profile keeps growing instead of narrowing. Under 180 words. No preamble.

He may have written some lines himself. Keep each one word for word, under whichever heading fits it best.`,
    prompt: `His own lines:\n${his.join("\n") || "(none)"}

His reading ratings (newest first):\n${s.ratings || "(none yet)"}

His recent tweets:\n${s.tweets || "(none)"}

His articles:\n${s.posts || "(none)"}

Books he finished:\n${s.books || "(none)"}`,
    temperature: 0.3,
    maxOutputTokens: 800,
  });

  const mine = new Set(his);
  await setSettingsDoc(PROFILE_GENERATED_KEY, lines(text).filter((l) => !mine.has(l)).join("\n"));
  return setInterestProfile(text.trim());
}

// ── the nightly pick ───────────────────────────────────────────────────────

const Choice = z.object({
  kind: z.enum(["article", "book"]),
  index: z.number().int().describe("For an article: the number of the candidate. For a book: -1."),
  bookTitle: z.string().describe("For a book: 'Title by Author'. Otherwise empty."),
  why: z.string().describe("One sentence, to him, on why this one tonight. No hype."),
  prompt: z.string().describe("One question he could answer in a tweet or a 60-second video after reading."),
});

/**
 * Tonight's pick: one read, on the board as a task. Idempotent per day (the
 * cron may retry); `force` replaces today's unrated pick.
 */
export async function pickTonightsRead({ force = false } = {}): Promise<ReadingPick> {
  await ensureSchema();
  const sql = getDb();
  const date = todayISO();
  const [existing] = await sql`SELECT ${sql.unsafe(COLUMNS)} FROM reading_picks WHERE pick_date = ${date}`;
  if (existing && !force) return shape(existing);

  let profile = (await getInterestProfile()).content.trim();
  if (!profile) profile = (await refreshInterestProfile()).content.trim();

  const candidates = await gatherCandidates();
  const recent = await sql`SELECT title, source, kind FROM reading_picks ORDER BY pick_date DESC LIMIT 7`;
  const numbered = candidates.map((c, i) => `${i}. ${c.title} — ${c.source}`).join("\n");

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: Choice }),
    system: `You pick ONE thing for Berto to read tonight, his evening obsession instead of NFL. It should excite him and give him something to say in a tweet or short video. Follow his interest profile. Mostly pick from the numbered candidates; about one night in five, or when nothing fits, pick a well-known, real book instead (only one you are sure exists). Vary sources and topics from the last week.`,
    prompt: `His interest profile:\n${profile}

Last week's picks:\n${recent.map((r) => `- ${r.title} (${r.source}, ${r.kind})`).join("\n") || "(none)"}

Candidates:\n${numbered || "(none: pick a book)"}`,
    temperature: 0.7,
    maxOutputTokens: 600,
  });

  let pick: Candidate & { kind: "article" | "book" };
  const c = output.kind === "article" ? candidates[output.index] : undefined;
  if (c) {
    pick = { ...c, kind: "article" };
  } else {
    const title = output.bookTitle.trim() || "A book from your Try next list";
    pick = {
      title,
      url: `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(title)}`,
      source: "Book",
      kind: "book",
    };
  }

  const task = await createTask({
    title: `Read tonight: ${pick.title}`,
    due_date: date,
    estimated_minutes: pick.kind === "book" ? 30 : 20,
  });
  const taskId = task.ok ? task.task.id : null;
  if (taskId) {
    await addTaskUpdate(
      taskId,
      `${pick.url}\n${output.why}\nAfter: ${output.prompt}\nRate it on /writing?tab=reading so tomorrow's pick gets better.`,
      "agent",
    ).catch(() => {});
  }

  const [row] = await sql`
    INSERT INTO reading_picks (pick_date, title, url, source, kind, why, prompt, task_id)
    VALUES (${date}, ${pick.title}, ${pick.url}, ${pick.source}, ${pick.kind}, ${output.why}, ${output.prompt}, ${taskId})
    ON CONFLICT (pick_date) DO UPDATE SET
      title = EXCLUDED.title, url = EXCLUDED.url, source = EXCLUDED.source, kind = EXCLUDED.kind,
      why = EXCLUDED.why, prompt = EXCLUDED.prompt, task_id = EXCLUDED.task_id,
      rating = NULL, feedback = NULL, rated_at = NULL
    RETURNING ${sql.unsafe(COLUMNS)}
  `;
  return shape(row);
}

// ── feedback ───────────────────────────────────────────────────────────────

/** 👍/👎 and/or a one-liner. `rating: null` clears the thumb; feedback undefined leaves it alone. */
export async function rateReadingPick(
  id: number,
  rating: ReadingRating | null | undefined,
  feedback?: string | null,
): Promise<ReadingPick | null> {
  await ensureSchema();
  const sql = getDb();
  const note = feedback === undefined ? undefined : feedback?.trim().slice(0, 500) || null;
  const [row] = await sql`
    UPDATE reading_picks SET
      rating = CASE WHEN ${rating === undefined} THEN rating ELSE ${rating ?? null} END,
      feedback = CASE WHEN ${note === undefined} THEN feedback ELSE ${note ?? null} END,
      rated_at = NOW()
    WHERE id = ${id}
    RETURNING ${sql.unsafe(COLUMNS)}
  `;
  return row ? shape(row) : null;
}

/** Run after a rating's response has gone. Errors are logged, never thrown. */
export async function afterReadingRating() {
  await refreshInterestProfile().catch((e) => console.error("[reading-picks] profile", e));
}
