/**
 * What Cael's reply sounds like when it's read aloud. The chat renders
 * markdown; a voice shouldn't say "asterisk asterisk" or spell out a URL, so
 * the markup comes off first. Pure, so the client can use it to chunk text
 * and the server can use it to clean what it sends to a voice API.
 */

export function toSpeechText(markdown: string): string {
  let text = markdown;
  // Fenced code: a voice can't read code usefully. Say that it's there.
  text = text.replace(/```[\s\S]*?```/g, " (code) ");
  text = text.replace(/`([^`]*)`/g, "$1");
  // Images and links: keep the words, drop the address.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  // Headings, emphasis, blockquotes, horizontal rules.
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^\s*([-*_]\s*){3,}$/gm, "");
  // Tables: cells become a sentence each; the separator row goes.
  text = text.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, "");
  text = text.replace(/^\s*\|(.*)\|[ \t]*$/gm, (_m, row: string) =>
    row.split("|").map((c) => c.trim()).filter(Boolean).join(", ") + ".");
  // List markers: a short pause reads better than "dash".
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  text = text.replace(/^\s*\[( |x)\]\s*/gim, "");
  // Emoji and other pictographs: voices either skip them or name them ("red heart").
  text = text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
  // Collapse whitespace; a blank line becomes a sentence break.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{2,}/g, "\n");
  return text.trim();
}

/**
 * Sentence-sized pieces no longer than `max` characters, so the first audio
 * can start playing while the rest is still being made. Splits at sentence
 * ends first, then at clauses, then anywhere.
 */
export function splitForSpeech(text: string, max = 300): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let buffer = "";
    const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [];
    for (const sentence of sentences) {
      if (buffer && (buffer + sentence).length > max) {
        out.push(buffer.trim());
        buffer = "";
      }
      if (sentence.length > max) {
        // One very long sentence: break at commas, then hard.
        for (const clause of sentence.match(new RegExp(`[^,;:]{1,${max}}[,;:]?\\s*`, "g")) ?? [sentence]) {
          if (buffer && (buffer + clause).length > max) {
            out.push(buffer.trim());
            buffer = "";
          }
          buffer += clause;
        }
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out.filter(Boolean);
}
