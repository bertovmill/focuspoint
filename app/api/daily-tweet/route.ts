import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getDb } from "../../../lib/db";
import { postTweet } from "../../../lib/x-api";

async function runDailyTweet() {
  const sql = getDb();
  const thoughts = await sql`
    SELECT content, tags, created_at
    FROM thoughts
    WHERE created_at >= NOW() - INTERVAL '14 days'
    ORDER BY created_at DESC
    LIMIT 50
  `;
  if (thoughts.length === 0) {
    return { message: "No thoughts to draw from yet — add some notes first." };
  }
  const thoughtsText = thoughts.map((t) => `- ${t.content}`).join("\n");
  const today = new Date().toISOString().split("T")[0];
  const { text: tweet } = await generateText({
    model: "anthropic/claude-sonnet-4-6",
    temperature: 1,
    prompt: `You are crafting a daily tweet for someone. Today is ${today}. Draw from their recent private thoughts and distill the essence into something universally true and profound — as if you extracted the insight without revealing the person.

THEIR RECENT THOUGHTS:
${thoughtsText}

Write ONE tweet (under 200 characters). Rules:
- No em dashes (—). Use periods, commas, or colons instead.
- No hashtags.
- No personal details, names, or specific situations.
- Take the principle or tension from their thoughts and make it stand alone.
- Aim for: compression, inversion, or clarity. Not hype. Not clichés.
- Each run should produce something genuinely different — vary the angle, form, and which thought you draw from.
- Write only the tweet text. Nothing else.`,
  });
  const cleaned = tweet.trim().replace(/^["']|["']$/g, "");
  if (cleaned.length > 280) {
    throw new Error(`Generated tweet too long (${cleaned.length} chars): ${cleaned}`);
  }
  const result = await postTweet(cleaned);
  return { ok: true, tweet: cleaned, tweet_id: result.id, url: result.url };
}

// GET — Vercel cron (requires CRON_SECRET)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDailyTweet());
  } catch (err) {
    console.error("Daily tweet cron failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// POST — manual trigger from the UI (protected by session auth middleware)
export async function POST() {
  try {
    return NextResponse.json(await runDailyTweet());
  } catch (err) {
    console.error("Daily tweet manual trigger failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
