// Tools Cael only carries when a conversation needs them. Every tool schema rides
// along on every model call, and these groups are rarely used in chat, so they
// sit out of the always-on set until either the model calls `load_toolset` or a
// message plainly needs them (see `matchesToolset`). Once a toolset is in, it
// stays in for the session — swapping tools in and out would keep breaking the
// provider's prompt cache.
//
// The tools themselves are ordinary `defineTool` modules; `agent/tools/toolsets.ts`
// is the dynamic resolver that hands them to eve, and lib/agent-tool-registry.ts
// still exposes all of them over MCP.

import generate_post_image from "./publishing/generate_post_image";
import get_post from "./publishing/get_post";
import list_portfolio from "./publishing/list_portfolio";
import list_posts from "./publishing/list_posts";
import post_linkedin from "./publishing/post_linkedin";
import post_tweet from "./publishing/post_tweet";
import publish_post from "./publishing/publish_post";
import save_capability from "./publishing/save_capability";
import save_portfolio_project from "./publishing/save_portfolio_project";
import save_post from "./publishing/save_post";

import ai_reading_list from "./events_and_news/ai_reading_list";
import get_luma_event from "./events_and_news/get_luma_event";
import latest_ai_news from "./events_and_news/latest_ai_news";
import list_luma_events from "./events_and_news/list_luma_events";
import sync_luma from "./events_and_news/sync_luma";

export const TOOLSETS = {
  publishing: {
    summary:
      "Articles on bertomill.com/writing (list, read, draft, edit, publish, cover/inline images), posting to X and LinkedIn, and the bertomill.com/capabilities portfolio.",
    // Lower-cased substrings of a user message that mean this toolset is needed.
    triggers: [
      "[[context: writing editor",
      "article",
      "blog",
      "writing",
      "draft a post",
      "publish",
      "tweet",
      "post on x",
      "post to x",
      "linkedin",
      "portfolio",
      "capabilit",
      "cover image",
    ],
    tools: {
      list_posts,
      get_post,
      save_post,
      publish_post,
      generate_post_image,
      post_tweet,
      post_linkedin,
      list_portfolio,
      save_portfolio_project,
      save_capability,
    },
  },
  events_and_news: {
    summary:
      "MakersLounge events from the Luma mirror (upcoming/past events, one event in full, turnout, re-sync) and AI news and reading lists.",
    triggers: [
      "makerslounge",
      "makers lounge",
      "luma",
      "newsletter",
      "event recap",
      "ai news",
      "headlines",
      "reading list",
      "morning digest",
    ],
    tools: { list_luma_events, get_luma_event, sync_luma, latest_ai_news, ai_reading_list },
  },
} as const;

export type ToolsetName = keyof typeof TOOLSETS;
export const TOOLSET_NAMES = Object.keys(TOOLSETS) as ToolsetName[];

/** The toolsets whose trigger words appear in this text. */
export function matchesToolset(text: string): ToolsetName[] {
  const lower = text.toLowerCase();
  return TOOLSET_NAMES.filter((name) => TOOLSETS[name].triggers.some((t) => lower.includes(t)));
}
