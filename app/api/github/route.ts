import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Merged PRs, oldest first — one row per PR, mirrored by lib/github-sync.ts.
 * The home screen turns these into the Craft line chart.
 */
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, account, repo, number, title, url, merged_at
      FROM github_prs
      ORDER BY merged_at ASC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
