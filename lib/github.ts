/**
 * GitHub Search API client for merged pull requests.
 *
 * Only merged PRs are fetched — Craft on the home screen counts what shipped,
 * not what was opened. See lib/github-sync.ts for the mirror into Postgres.
 */

/** The accounts whose PRs count toward Craft. Both are Berto's. */
export const GITHUB_ACCOUNTS = ["rmillaucctus", "bertovmill"] as const;

/** First month worth asking about — nothing merged before this. */
export const GITHUB_HISTORY_START = "2025-01";

const API = "https://api.github.com";

export interface GithubPr {
  id: number;
  account: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  mergedAt: string;
}

/**
 * Env var names the token may live under, in priority order. Vercel env names are
 * case-sensitive and `process.env` does no folding, so the production var — added
 * by hand as `github_personal_access_token` — has to be named exactly, not guessed.
 */
const TOKEN_VARS = [
  "GITHUB_TOKEN",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "github_personal_access_token",
] as const;

/** The token, plus which env var supplied it — several may be set at once. */
function resolveToken(): { value: string; source: string } {
  for (const name of TOKEN_VARS) {
    const t = process.env[name];
    if (t) return { value: t, source: name };
  }
  throw new Error(`No GitHub token set — expected one of: ${TOKEN_VARS.join(", ")}`);
}

function token(): string {
  return resolveToken().value;
}

/**
 * Who GitHub thinks the token is, and where the token came from.
 *
 * The failure this exists for: several `GITHUB_TOKEN`-ish vars can be set at once
 * and the first match silently wins, so swapping the value of one of them can
 * change nothing at all. `login` settles it — a search returning too little is
 * either the wrong identity or the wrong scopes, and this says which.
 */
export async function whoAmI(): Promise<{
  source: string;
  login: string | null;
  scopes: string | null;
}> {
  const { source } = resolveToken();
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });
  if (!res.ok) return { source, login: null, scopes: null };
  const body = (await res.json()) as { login?: string };
  return {
    source,
    login: body.login ?? null,
    // Classic tokens report their scopes here; fine-grained tokens send nothing,
    // which is itself the tell.
    scopes: res.headers.get("x-oauth-scopes"),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Search is capped at 30 requests/minute, and firing them back to back also trips
 * GitHub's *secondary* limit (which a full backfill did on the first try). Pace
 * every call ~2.5s apart and honour `Retry-After` when it pushes back anyway.
 */
const PACE_MS = 2500;
let nextAllowedAt = 0;

async function search(q: string, page: number): Promise<{ total: number; items: unknown[] }> {
  const url = `${API}/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = nextAllowedAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextAllowedAt = Date.now() + PACE_MS;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const body = (await res.json()) as { total_count?: number; items?: unknown[] };
      return { total: body.total_count ?? 0, items: body.items ?? [] };
    }

    // 403 with a rate-limit body and 429 are both "slow down", not "give up".
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000 * (attempt + 1);
      nextAllowedAt = Date.now() + backoff;
      continue;
    }

    throw new Error(`GitHub search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("GitHub search failed: still rate-limited after 5 attempts");
}

/** `bertovmill/focuspoint` out of an issue's `repository_url`. */
function repoFromUrl(repositoryUrl: string): string {
  return repositoryUrl.replace(`${API}/repos/`, "");
}

/**
 * Every PR `account` merged during `month` (an `YYYY-MM` string).
 *
 * Deliberately queried a month at a time: the Search API hard-caps any one query
 * at 1000 results, and 2026 alone is already past that for the main account, so a
 * per-year window would silently drop the overflow.
 */
export async function fetchMergedPrs(account: string, month: string): Promise<GithubPr[]> {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const q = `author:${account} type:pr is:merged merged:${month}-01..${month}-${String(last).padStart(2, "0")}`;

  const out: GithubPr[] = [];
  for (let page = 1; page <= 10; page++) {
    const { total, items } = await search(q, page);
    for (const raw of items) {
      const it = raw as {
        id?: number;
        number?: number;
        title?: string;
        html_url?: string;
        repository_url?: string;
        pull_request?: { merged_at?: string | null };
      };
      const mergedAt = it.pull_request?.merged_at;
      if (!it.id || !it.number || !it.html_url || !it.repository_url || !mergedAt) continue;
      out.push({
        id: it.id,
        account,
        repo: repoFromUrl(it.repository_url),
        number: it.number,
        title: it.title ?? "",
        url: it.html_url,
        mergedAt,
      });
    }
    if (items.length < 100 || out.length >= total) break;
  }
  return out;
}

/** `["2025-01", "2025-02", …]` up to and including the month `through` falls in. */
export function monthsBetween(start: string, through: Date): string[] {
  const [sy, sm] = start.split("-").map(Number);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(sy, sm - 1, 1));
  const end = new Date(Date.UTC(through.getUTCFullYear(), through.getUTCMonth(), 1));
  while (cursor <= end) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
