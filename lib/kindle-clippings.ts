// Parser for Kindle's `My Clippings.txt` — the plain-text file every Kindle writes
// locally, one entry per highlight/note/bookmark, updated the instant you make one.
// Reading it directly (paste the file's contents into chat) skips Readwise's sync
// lag entirely, since Readwise pulls from the same underlying source.
//
// Format (entries separated by a line of ==========):
//
//   The Book Title (Author Name)
//   - Your Note on page 12 | location 180-180 | Added on Sunday, 3 September 2026 12:04:11
//
//   the note text
//   ==========
//
// Highlights use "Your Highlight" instead of "Your Note" — those are skipped: a
// highlight is Kindle's own quote of the book, not something Berto wrote, and the
// existing "Notes written" metric has always meant notes, not highlights.

export type ParsedClipping = {
  bookTitle: string;
  note: string;
  location: string | null;
  /** YYYY-MM-DD, from the clipping's own "Added on" timestamp. */
  date: string;
};

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "Sunday, 3 September 2026 12:04:11" → "2026-09-03". Returns null if unparseable. */
function parseAddedOn(text: string): string | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

export function parseClippings(raw: string): ParsedClipping[] {
  const entries = raw
    .split(/={5,}/)
    .map((e) => e.trim())
    .filter(Boolean);

  const out: ParsedClipping[] = [];
  for (const entry of entries) {
    const lines = entry.split("\n").map((l) => l.trim());
    const titleLine = lines[0];
    const metaLine = lines[1];
    if (!titleLine || !metaLine) continue;
    if (!/your note/i.test(metaLine)) continue; // skip highlights and bookmarks

    const bookTitle = titleLine.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const note = lines.slice(2).join("\n").trim();
    if (!bookTitle || !note) continue;

    const locationMatch = metaLine.match(/location\s+([\d-]+)/i) ?? metaLine.match(/page\s+([\w-]+)/i);
    const addedMatch = metaLine.match(/added on\s+(.+)$/i);
    const date = (addedMatch && parseAddedOn(addedMatch[1])) ?? new Date().toISOString().slice(0, 10);

    out.push({ bookTitle, note, location: locationMatch?.[1] ?? null, date });
  }
  return out;
}
