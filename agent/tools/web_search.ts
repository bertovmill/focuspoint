import { defineTool } from "eve/tools";
import { z } from "zod";

// Web search via Tavily (https://tavily.com) — an LLM-oriented search API.
// Set TAVILY_API_KEY (free tier available). To swap providers (Brave, Exa,
// SerpAPI), keep this tool's shape and change the fetch below.

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

export default defineTool({
  description:
    "Search the live web for current information — news, facts, prices, events, anything beyond the agent's training data or not in the user's own notes. Use when the user asks about something recent or external, or to verify a fact before answering.",
  inputSchema: z.object({
    query: z.string().min(1).describe("The search query, phrased as you'd type into a search engine"),
    max_results: z.number().int().min(1).max(10).default(5).describe("How many results to return"),
  }),
  async execute({ query, max_results }) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: "Web search is not configured (missing TAVILY_API_KEY).", results: [] };
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results,
        search_depth: "basic",
        include_answer: true,
      }),
    });

    if (!res.ok) {
      return { error: `Search failed (${res.status} ${res.statusText}).`, results: [] };
    }

    const data = (await res.json()) as TavilyResponse;
    return {
      answer: data.answer ?? null,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      })),
    };
  },
  toModelOutput(output) {
    if ("error" in output && output.error) {
      return { type: "text", value: output.error };
    }
    const lines: string[] = [];
    if (output.answer) lines.push(`Summary: ${output.answer}\n`);
    for (const r of output.results) {
      lines.push(`- ${r.title}\n  ${r.url}\n  ${r.snippet}`);
    }
    return { type: "text", value: lines.join("\n") || "No results found." };
  },
});
