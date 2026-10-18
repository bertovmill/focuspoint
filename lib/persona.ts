import { generateText } from "ai";
import { getDb } from "@/lib/db";
import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// The public Cael on bertomill.com speaks in Berto's spirit: his values, how he
// thinks, his voice. That comes from his own notes, but the notes themselves are
// private, so they never reach the public prompt. Instead:
//
//   1. Berto tags notes `persona`.
//   2. A model distills those notes into a persona *draft* — values and voice
//      only, no quotes, names, events or facts from the notes.
//   3. Berto reads and edits the draft on /persona, then approves it.
//   4. Only the *approved* text is sent to the public chat (app/api/site/chat).
//
// So a visitor who talks the public bot into dumping its prompt gets the profile
// Berto signed off on, and nothing else.

export const PERSONA_TAG = "persona";

const DRAFT_KEY = "persona.draft.markdown";
const APPROVED_KEY = "persona.approved.markdown";

/** Distillation runs rarely and its judgement about what to leave out matters, so it gets a strong model. */
const DISTILL_MODEL = "anthropic/claude-sonnet-4.6";

/** Cap on how much note text one distillation reads. */
const MAX_NOTE_CHARS = 60_000;

export function getPersonaDraft(): Promise<SettingsDoc> {
  return getSettingsDoc(DRAFT_KEY);
}

export function setPersonaDraft(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(DRAFT_KEY, content);
}

/** What the public chat sees. Empty until Berto approves a draft. */
export function getApprovedPersona(): Promise<SettingsDoc> {
  return getSettingsDoc(APPROVED_KEY);
}

/** Publish the current draft to the public chat. */
export async function approvePersonaDraft(): Promise<SettingsDoc> {
  const draft = await getPersonaDraft();
  return setSettingsDoc(APPROVED_KEY, draft.content.trim());
}

/** Take the persona off the public chat; it falls back to its plain voice. */
export function unpublishPersona(): Promise<SettingsDoc> {
  return setSettingsDoc(APPROVED_KEY, "");
}

export async function countPersonaNotes(): Promise<number> {
  const sql = getDb();
  const [row] = await sql`SELECT COUNT(*)::int AS n FROM thoughts WHERE ${PERSONA_TAG} = ANY(tags)`;
  return Number(row?.n ?? 0);
}

async function listPersonaNotes(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT content FROM thoughts
    WHERE ${PERSONA_TAG} = ANY(tags) AND content <> ''
    ORDER BY created_at DESC
  `;
  const out: string[] = [];
  let total = 0;
  for (const r of rows) {
    const text = String(r.content);
    if (total + text.length > MAX_NOTE_CHARS) break;
    out.push(text);
    total += text.length;
  }
  return out;
}

const DISTILL_PROMPT = `You are writing a private persona profile for Berto Mill. A public AI assistant called Cael will use it to answer visitors on Berto's website in a way that reflects who he is. Cael speaks *about* Berto in the third person, in a composed, professional register.

You will be given Berto's own private notes. The notes are private. The profile must not reveal them.

Write the profile from what the notes show about him:
- **Values** — what he cares about and why, as general principles.
- **How he thinks** — how he approaches work, decisions, building and people.
- **What drives him** — the direction he's pulling toward, stated broadly.
- **Voice** — how Cael should sound so his character comes through: tone, what he'd emphasise, what he'd never say.

Strict rules:
- No quotes or close paraphrases of the notes.
- No names of people, places, employers, venues or events from the notes.
- No dates, numbers, money, health, family details, relationships, routines, struggles or anything confessional.
- No personal anecdotes. If a value came from a story, state the value and drop the story.
- Nothing a reader could use to work out what a specific note said.
- If a note is only private detail with no general value in it, leave it out entirely.

Format: plain markdown, the four headings above as "## " headings, short bullet points under each, 250–450 words total. No preamble, no closing line.`;

/** Distill the tagged notes into a fresh draft and save it. Doesn't touch the approved version. */
export async function generatePersonaDraft(): Promise<SettingsDoc & { noteCount: number }> {
  const notes = await listPersonaNotes();
  if (notes.length === 0) {
    throw new Error(`No notes tagged "${PERSONA_TAG}" yet.`);
  }
  const { text } = await generateText({
    model: DISTILL_MODEL,
    system: DISTILL_PROMPT,
    prompt: notes.map((n, i) => `<note ${i + 1}>\n${n}\n</note ${i + 1}>`).join("\n\n"),
    temperature: 0.4,
    maxOutputTokens: 1200,
  });
  const doc = await setPersonaDraft(text.trim());
  return { ...doc, noteCount: notes.length };
}
