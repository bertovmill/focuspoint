import { defineTool } from "eve/tools";
import { z } from "zod";

// Fetches the latest issues from AINews (https://news.smol.ai), a weekday recap
// of top news for AI engineers, via its RSS feed. Each issue ships with a concise
// summary in the feed, so no scraping or API key is needed.

const FEED_URL = "https://news.smol.ai/rss.xml";

interface NewsItem {
  title: string;
  link: string;
  date: string;
  summary: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : "";
}

export default defineTool({
  description:
    "Fetch the latest issues from AINews (news.smol.ai), a daily recap of the most important AI news for engineers. Use this when the user asks what's new in AI, wants a news digest, or asks about recent model launches, research, or tooling.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(15).default(5).describe("How many recent issues to return"),
  }),
  async execute({ limit }) {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "Cael/1.0 (+https://news.smol.ai)" } });
    if (!res.ok) {
      return { error: `Could not fetch AINews (${res.status} ${res.statusText}).`, items: [] };
    }

    const xml = await res.text();
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const items: NewsItem[] = blocks.slice(0, limit).map((block) => ({
      title: pick(block, "title"),
      link: pick(block, "link"),
      date: pick(block, "pubDate"),
      summary: pick(block, "description"),
    }));

    return { items, count: items.length };
  },
  toModelOutput(output) {
    if ("error" in output && output.error) {
      return { type: "text", value: output.error };
    }
    if (output.items.length === 0) {
      return { type: "text", value: "No AINews issues found." };
    }
    const value = output.items
      .map((it) => `## ${it.title} (${it.date})\n${it.link}\n\n${it.summary}`)
      .join("\n\n---\n\n");
    return { type: "text", value };
  },
});
