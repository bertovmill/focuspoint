import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { syncGithubPrs } from "@/lib/github-sync";

export const maxDuration = 300;

/**
 * Pull merged PRs from GitHub into Postgres.
 *
 * `POST /api/github/sync` refreshes the trailing two months (what the nightly
 * dispatcher tick does); `?full=1` walks every month since GITHUB_HISTORY_START,
 * which is the one-time backfill and takes a couple of minutes.
 */
export async function POST(req: Request) {
  try {
    const full = new URL(req.url).searchParams.get("full") === "1";
    await ensureSchema();
    const result = await syncGithubPrs({ full });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
