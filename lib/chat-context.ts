/**
 * A line of context the app puts in front of a message so Cael knows where it
 * was sent from (e.g. the chat beside a post in the Writing editor). It rides
 * in the message text because that's all eve carries, and the thread view
 * strips it so the bubble shows only what Berto typed.
 */
const OPEN = "[[Context: ";
const CLOSE = "]]";

export function withChatContext(context: string, text: string): string {
  return `${OPEN}${context.replace(/\]\]/g, "] ]")}${CLOSE}\n\n${text}`;
}

export function stripChatContext(text: string): string {
  // More than one line can stack up (the corner chat's page, then the voice
  // note), so strip until the text no longer opens with one.
  while (text.startsWith(OPEN)) {
    const end = text.indexOf(CLOSE);
    if (end === -1) return text;
    text = text.slice(end + CLOSE.length).replace(/^\s+/, "");
  }
  return text;
}
