// Kept apart from notes-view so the command palette, which is on every screen,
// can title notes without pulling in the note editor (~520 KB of Tiptap).

function plain(line: string) {
  return line
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1")
    .replace(/^#+\s+/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\*\*|__/g, "")
    .trim();
}

/**
 * Title = the first line. Most notes Cael captures are one long paragraph, so with
 * no second line the first sentence becomes the title and the rest the preview,
 * rather than a title that's the whole note and "No additional text".
 */
export function noteTitleAndPreview(content: string) {
  const lines = content.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { title: "Photo", preview: "" };
  let title = plain(lines[0]);
  let preview = lines.slice(1).map(plain).join(" ");
  if (!preview) {
    const sentence = title.match(/^(.{8,100}?[.!?])\s+(.+)$/);
    // No short first sentence: break at a word so the preview line carries on
    // where the title stops, like a two-line clamp.
    const words = sentence ? null : title.length > 60 ? title.match(/^(.{20,55})\s+(.+)$/) : null;
    if (sentence) {
      title = sentence[1];
      preview = sentence[2];
    } else if (words) {
      title = `${words[1]}…`;
      preview = words[2];
    }
  }
  return { title, preview };
}
