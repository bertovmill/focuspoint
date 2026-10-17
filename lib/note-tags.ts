// Note tags are short lowercase words: "#Persona " and "persona" are the same tag.
// Shared by the Notes pane, its API and Cael's tag_note tool so all three agree.

export const MAX_NOTE_TAGS = 12;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
}

/** Normalized, de-duplicated, in first-seen order, capped. */
export function normalizeTags(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const tag = normalizeTag(String(t));
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, MAX_NOTE_TAGS);
}
