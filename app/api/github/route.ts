import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Merged PRs, oldest first — one row per PR, mirrored by lib/github-sync.ts.
 * The home screen turns these into the Craft line chart.
 */
export async function GET(req: Request) {
  try {
    const sql = getDb();
    // The chart only plots dates, and full rows run to ~400 KB; `?dates=1` sends
    // just those so the home screen isn't waiting on the rest.
    const datesOnly = new URL(req.url).searchParams.get("dates") === "1";
    const rows = datesOnly
      ? await sql`SELECT merged_at FROM github_prs ORDER BY merged_at ASC`
      : await sql`
          SELECT id, account, repo, number, title, url, merged_at
          FROM github_prs
          ORDER BY merged_at ASC
        `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
