import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getDb } from "../../../lib/db";
import { postTweet } from "../../../lib/x-api";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = getDb();

    // Pull recent thoughts to draw from
    const thoughts = await sql`
      SELECT content, tags, created_at
      FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '14 days'
      ORDER BY created_at DESC
      LIMIT 50
    `;

    if (thoughts.length === 0) {
      return NextResponse.json({ message: "No thoughts to draw from yet." });
    }

    const thoughtsText = thoughts
      .map((t) => `- ${t.content}`)
      .join("\n");

    const { text: tweet } = await generateText({
      model: "anthropic/claude-sonnet-4-6",
      prompt: `You are crafting a daily tweet for someone. Draw from their recent private thoughts and distill the essence into something universally true and profound — as if you extracted the insight without revealing the person.

THEIR RECENT THOUGHTS:
${thoughtsText}

Write ONE tweet (under 200 characters). Rules:
- No em dashes (—). Use periods, commas, or colons instead.
- No hashtags.
- No personal details, names, or specific situations.
- Take the principle or tension from their thoughts and make it stand alone.
- Aim for: compression, inversion, or clarity. Not hype. Not clichés.
- Write only the tweet text. Nothing else.`,
    });

    const cleaned = tweet.trim().replace(/^["']|["']$/g, "");

    if (cleaned.length > 280) {
      return NextResponse.json({ error: "Generated tweet too long", tweet: cleaned }, { status: 500 });
    }

    const result = await postTweet(cleaned);

    return NextResponse.json({
      ok: true,
      tweet: cleaned,
      tweet_id: result.id,
      url: result.url,
    });
  } catch (err) {
    console.error("Daily tweet cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
