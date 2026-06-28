import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { getDb, ensureSchema } from "../../../lib/db.js";

const DreamSchema = z.object({
  summary: z
    .string()
    .describe(
      "A 2-4 sentence narrative about who this person is and what matters to them, written as if Cael is reflecting on them."
    ),
  patterns: z
    .array(
      z.object({
        theme: z.string().describe("Short theme label, e.g. 'Flow state & coding'"),
        evidence: z.string().describe("What thoughts/todos reveal this pattern"),
        frequency: z.number().int().min(1).describe("How many data points support this"),
      })
    )
    .describe("Recurring themes and patterns found across the data"),
  insights: z
    .array(z.string())
    .describe(
      "3-7 concrete, specific insights Cael should proactively reference in future conversations"
    ),
});

export async function GET(req: NextRequest) {
  // Vercel automatically sends CRON_SECRET in the Authorization header for scheduled crons.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const sql = getDb();

    // Pull thoughts from the last 30 days
    const thoughts = await sql`
      SELECT content, tags, created_at
      FROM thoughts
      WHERE created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 200
    `;

    // Pull todos from the last 30 days (completed and pending)
    const todos = await sql`
      SELECT title, completed, priority, due_date, created_at, completed_at
      FROM todos
      WHERE created_at >= NOW() - INTERVAL '30 days'
         OR (completed = true AND completed_at >= NOW() - INTERVAL '30 days')
      ORDER BY created_at DESC
      LIMIT 100
    `;

    if (thoughts.length === 0 && todos.length === 0) {
      return NextResponse.json({ message: "No data to dream on yet." });
    }

    const thoughtsText = thoughts
      .map(
        (t) =>
          `[${new Date(String(t.created_at)).toLocaleDateString()}] ${t.content}${Array.isArray(t.tags) && t.tags.length > 0 ? ` (tags: ${(t.tags as string[]).join(", ")})` : ""}`
      )
      .join("\n");

    const todosText = todos
      .map(
        (t) =>
          `[${t.completed ? "DONE" : "TODO"}${t.priority !== "normal" ? ` ${t.priority}` : ""}] ${t.title}`
      )
      .join("\n");

    const { object: dream } = await generateObject({
      model: "anthropic/claude-sonnet-4-6",
      schema: DreamSchema,
      prompt: `You are Cael — a personal guide performing your nightly dreaming cycle. Review this person's recent thoughts and todos, then consolidate what you've learned into structured insights that will make you a better guide tomorrow.

RECENT THOUGHTS (last 30 days):
${thoughtsText || "(none yet)"}

RECENT TODOS (last 30 days):
${todosText || "(none yet)"}

Identify genuine recurring patterns — themes that appear multiple times across different days and contexts. Be specific and grounded in the actual data, not generic. Write as if you're a trusted guide who has been listening carefully.`,
    });

    // Store the dream report
    await sql`
      INSERT INTO dreams (summary, patterns, insights, thoughts_analyzed, todos_analyzed)
      VALUES (
        ${dream.summary},
        ${JSON.stringify(dream.patterns)},
        ${dream.insights},
        ${thoughts.length},
        ${todos.length}
      )
    `;

    return NextResponse.json({
      ok: true,
      thoughts_analyzed: thoughts.length,
      todos_analyzed: todos.length,
      patterns_found: dream.patterns.length,
      insights_written: dream.insights.length,
    });
  } catch (err) {
    console.error("Dream cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
