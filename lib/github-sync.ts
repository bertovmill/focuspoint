import { getDb } from "@/lib/db";
import {
  GITHUB_ACCOUNTS,
  GITHUB_HISTORY_START,
  fetchMergedPrs,
  monthsBetween,
} from "@/lib/github";

/**
 * Mirror merged pull requests into the `github_prs` table.
 *
 * An **upsert**, never a wipe-and-reload — same reasoning as the Luma mirror: a PR
 * GitHub stops returning (a repo gone private, a search page that failed) stays in
 * the history rather than making the Craft line drop overnight.
 *
 * `full: false` (the nightly default) re-reads only the last two months. Two, not
 * one, because a PR opened in the old month and merged on the 1st of the new one
 * lands in a window the previous run had already finished with.
 */
export async function syncGithubPrs({ full = false }: { full?: boolean } = {}): Promise<{
  fetched: number;
  months: number;
}> {
  const sql = getDb();
  const now = new Date();
  const allMonths = monthsBetween(GITHUB_HISTORY_START, now);
  const months = full ? allMonths : allMonths.slice(-2);

  let fetched = 0;
  for (const account of GITHUB_ACCOUNTS) {
    for (const month of months) {
      const prs = await fetchMergedPrs(account, month);
      fetched += prs.length;
      if (prs.length === 0) continue;
      // One UNNEST insert per month rather than a round trip per PR — the backfill
      // is ~1,200 rows and serial inserts spent longer talking to Postgres than to
      // GitHub.
      await sql`
        INSERT INTO github_prs (id, account, repo, number, title, url, merged_at)
        SELECT * FROM UNNEST(
          ${prs.map((p) => p.id)}::bigint[],
          ${prs.map((p) => p.account)}::text[],
          ${prs.map((p) => p.repo)}::text[],
          ${prs.map((p) => p.number)}::int[],
          ${prs.map((p) => p.title)}::text[],
          ${prs.map((p) => p.url)}::text[],
          ${prs.map((p) => p.mergedAt)}::timestamptz[]
        )
        ON CONFLICT (id) DO UPDATE
          SET title = EXCLUDED.title, merged_at = EXCLUDED.merged_at
      `;
    }
  }
  return { fetched, months: months.length };
}
