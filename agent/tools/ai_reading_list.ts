import { defineTool } from "eve/tools";
import { z } from "zod";

// Fetches recent AI articles from several reputable tech/AI publications
// via their public RSS feeds. No API keys required.

interface Article {
  title: string;
  link: string;
  date: string;
  source: string;
}

const SOURCES = [
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "VentureBeat", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/tag/artificial-intelligence/latest/rss" },
];

const AI_KEYWORDS = [
  "ai", "artificial intelligence", "machine learning", "llm", "gpt", "claude",
  "openai", "anthropic", "gemini", "model", "neural", "deep learning", "chatbot",
  "agent", "robotics", "automation", "generative", "foundation model",
];

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pickTag(block: string, tag: string): string {
  // Handle CDATA
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (cdata) return decodeEntities(cdata[1].trim());
  // Handle regular text content
  const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  if (plain) return decodeEntities(plain[1].trim());
  return "";
}

function extractLink(block: string): string {
  // Standard RSS <link>https://...</link>
  const rss = pickTag(block, "link");
  if (rss && rss.startsWith("http")) return rss;
  // <guid isPermaLink="true">
  const guid = block.match(/<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/);
  if (guid) return guid[1].trim();
  // Atom-style <link href="..." />
  const atom = block.match(/<link[^>]+href="([^"]+)"/);
  if (atom) return atom[1];
  // Fallback: any guid that looks like a URL
  const anyGuid = block.match(/<guid[^>]*>([^<]+)<\/guid>/);
  if (anyGuid && anyGuid[1].startsWith("http")) return anyGuid[1].trim();
  return "";
}

async function fetchSource(source: { name: string; url: string }): Promise<Article[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "Cael/1.0 (+focuspoint.app)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return blocks
      .slice(0, 20)
      .map((block) => ({
        title: pickTag(block, "title"),
        link: extractLink(block),
        date: pickTag(block, "pubDate"),
        source: source.name,
      }))
      .filter((a) => a.title && a.link);
  } catch {
    return [];
  }
}

export default defineTool({
  description:
    "Fetch recent AI/tech articles from reputable publications: MIT Technology Review, VentureBeat AI, Ars Technica, The Verge AI, and Wired. Use this to build a reading list for the morning digest or whenever the user wants article recommendations.",
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many articles to return"),
    aiOnly: z
      .boolean()
      .default(true)
      .describe("Filter to AI-relevant articles by keyword match on title"),
  }),
  async execute({ limit, aiOnly }) {
    const results = await Promise.all(SOURCES.map((s) => fetchSource(s)));
    let articles = results.flat();

    if (aiOnly) {
      articles = articles.filter((a) => {
        const lower = a.title.toLowerCase();
        return AI_KEYWORDS.some((kw) => lower.includes(kw));
      });
    }

    // Sort most-recent first, de-duplicate by link
    articles.sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
    const seen = new Set<string>();
    const deduped: Article[] = [];
    for (const a of articles) {
      if (!seen.has(a.link)) {
        seen.add(a.link);
        deduped.push(a);
      }
      if (deduped.length >= limit) break;
    }

    return { articles: deduped };
  },
  toModelOutput(output) {
    if (output.articles.length === 0) {
      return { type: "text", value: "No recent AI articles found." };
    }
    const value = output.articles
      .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.link}`)
      .join("\n\n");
    return { type: "text", value };
  },
});
