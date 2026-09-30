import { NextResponse } from "next/server";
import { listTweets } from "@/lib/tweets";
import { postTweet } from "@/lib/x-api";

/** GET — tweets Cael has posted, newest first. */
export async function GET() {
  try {
    return NextResponse.json(await listTweets());
  } catch {
    return NextResponse.json({ error: "Couldn't load tweets" }, { status: 500 });
  }
}

/** POST { text } — post a tweet from the Writing page's Tweets tab. */
export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "The tweet is empty" }, { status: 400 });
  }
  try {
    return NextResponse.json(await postTweet(text.trim()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't post to X" }, { status: 502 });
  }
}
