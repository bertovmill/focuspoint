import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateRuleImage } from "@/lib/nutrition-art";
import { PROTOCOL_RULE_KEYS } from "@/lib/nutrition";

export const maxDuration = 300;

// { rule_key: image_url } for whatever art exists. Read on every render of the
// rule lists, so it stays a single cheap query and never generates on read.
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT rule_key, image_url FROM nutrition_rule_art`;
    return NextResponse.json(Object.fromEntries(rows.map((r) => [r.rule_key, r.image_url])));
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}

// Generates the missing rule art (or one key, or all four with force). Only
// four images exist for the life of the app, so this is close to a one-shot.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const only = typeof body?.key === "string" ? [body.key] : null;
    if (only && !PROTOCOL_RULE_KEYS.includes(only[0])) {
      return NextResponse.json({ error: "Unknown rule" }, { status: 400 });
    }
    const sql = getDb();
    const existing = await sql`SELECT rule_key FROM nutrition_rule_art`;
    const have = new Set(existing.map((r) => String(r.rule_key)));
    const targets = (only ?? PROTOCOL_RULE_KEYS).filter((k) => force || !have.has(k));
    const done: string[] = [];
    const failed: string[] = [];
    for (const key of targets) {
      try {
        const url = await generateRuleImage(key);
        await sql`
          INSERT INTO nutrition_rule_art (rule_key, image_url, updated_at)
          VALUES (${key}, ${url}, NOW())
          ON CONFLICT (rule_key) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW()
        `;
        done.push(key);
      } catch (err) {
        console.error(`[rule-art] ${key}`, err);
        failed.push(key);
      }
    }
    return NextResponse.json({ generated: done, failed, skipped: [...have].filter((k) => !targets.includes(k)) });
  } catch {
    return NextResponse.json({ error: "Couldn't generate rule art" }, { status: 500 });
  }
}
