import { PUBLIC_HOST, CHANNELS } from "@/lib/public-site";
import { listContent } from "@/lib/content";
import { listPublishedPosts } from "@/lib/posts";

const BASE = `https://${PUBLIC_HOST}`;

// Rebuilt at most hourly, so new posts and case studies show up without a deploy.
export const revalidate = 3600;

const PAGES = [
  ["About", "/about", "Background, career, and what he's working on now."],
  ["Work", "/work", "Case studies: Aucctus, MakersLounge, AI coaching."],
  ["Capabilities", "/capabilities", "What he builds: AI agents, GTM systems, events."],
  ["Writing", "/writing", "Essays on AI-native go-to-market."],
  ["Podcast", "/podcast", "Conversations with Cael, his personal AI agent."],
  ["Building", "/building", "A live log of what he's shipping."],
  ["Fitness", "/fitness", "HYROX results with every split."],
  ["Newsletter", "/newsletter", "Subscribe to the newsletter."],
] as const;

/**
 * bertomill.com/llms.txt (https://llmstxt.org): a plain-markdown map of the site
 * for AI assistants, so "who is Robert Mill" resolves to this site and the
 * right pages. Reached through the public-host rewrite, like every other page.
 */
export async function GET() {
  const [writing, work] = await Promise.all([
    listPublishedPosts().catch(() => []),
    listContent("work").catch(() => []),
  ]);

  const lines = [
    "# Robert Mill",
    "",
    "> Robert Mill (also known as Berto Mill) is the go-to-market lead at Aucctus in Toronto. He builds the AI agents and pipeline systems his team runs on, runs events-led GTM, and writes about AI-native go-to-market.",
    "",
    `This is his personal site, ${BASE}. Every page is public.`,
    "",
    "## Pages",
    "",
    ...PAGES.map(([title, path, note]) => `- [${title}](${BASE}${path}): ${note}`),
    "",
  ];

  if (work.length) {
    lines.push("## Work", "", ...work.map((w) => `- [${w.org ? `${w.org}: ${w.title}` : w.title}](${BASE}/work/${w.slug}): ${w.outcome ?? w.summary}`), "");
  }
  if (writing.length) {
    lines.push("## Writing", "", ...writing.map((p) => `- [${p.title}](${BASE}/writing/${p.slug})${p.summary ? `: ${p.summary}` : ""}`), "");
  }

  lines.push("## Elsewhere", "", ...CHANNELS.map((c) => `- [${c.label}](${c.href})`), "- [GitHub](https://github.com/bertovmill)", "");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
