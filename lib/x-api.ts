import { createHmac, randomBytes } from "crypto";
import { readMedia } from "./image-upload";
import { PUBLIC_SITE_URL } from "./posts";
import { listTweets, recordTweet, saveTweetMetrics, type TweetMetrics } from "./tweets";
import { getXAccountTokens } from "./x-accounts";
import {
  normalizeHandle,
  PERSONAL_X_HANDLE,
  TWEET_IMAGE_MAX_BYTES,
  TWEET_IMAGE_TYPES,
  X_LOOKUP_MAX_IDS,
  X_POST_READ_COST,
} from "./x-shared";

function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthSign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const base = `${method}&${percentEncode(url)}&${percentEncode(
    Object.keys(params)
      .sort()
      .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
      .join("&"),
  )}`;
  return createHmac("sha1", signingKey).update(base).digest("base64");
}

function buildAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  query: Record<string, string> = {},
  extraOAuth: Record<string, string> = {},
): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
    ...extraOAuth,
  };
  // Asking X for a request token (connecting an account) has no token yet.
  if (accessToken) oauthParams.oauth_token = accessToken;
  // Query params are part of the signature base string, but not of the header.
  oauthParams.oauth_signature = oauthSign(method, url, { ...query, ...oauthParams }, consumerSecret, accessTokenSecret);
  return `OAuth ${Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ")}`;
}

/** The X developer app's keys. One app posts for every connected account. */
function appKeys() {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error("X API credentials not configured");
  return { consumerKey, consumerSecret };
}

/**
 * Keys to sign as `account`: Berto's own handle uses the env tokens, any other
 * handle the tokens saved when it was connected (lib/x-accounts.ts).
 */
async function credentials(account: string = PERSONAL_X_HANDLE) {
  const app = appKeys();
  if (normalizeHandle(account) === PERSONAL_X_HANDLE) {
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
    if (!accessToken || !accessTokenSecret) throw new Error("X API credentials not configured");
    return { ...app, accessToken, accessTokenSecret };
  }
  const saved = await getXAccountTokens(account);
  if (!saved) throw new Error(`@${normalizeHandle(account)} isn't connected. Connect it on /writing?tab=tweets.`);
  return { ...app, ...saved };
}

/**
 * OAuth 1.0a header for a request signed as `account` (Berto by default). `url`
 * has no query string; pass its params as `query`. Body params aren't signed
 * (JSON and multipart bodies aren't).
 */
async function userAuth(
  method: string,
  url: string,
  query: Record<string, string> = {},
  account?: string,
): Promise<string> {
  const c = await credentials(account);
  return buildAuthHeader(method, url, c.consumerKey, c.consumerSecret, c.accessToken, c.accessTokenSecret, query);
}

/**
 * Step 1 of connecting another X account (PIN flow, so no callback URL has to be
 * registered on the X app): get a request token and the page where Berto,
 * signed in to X as that account, approves Cael and is shown a PIN.
 */
export async function startXConnect(): Promise<{ authorizeUrl: string; token: string; secret: string }> {
  const { consumerKey, consumerSecret } = appKeys();
  const url = "https://api.x.com/oauth/request_token";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader("POST", url, consumerKey, consumerSecret, "", "", {}, { oauth_callback: "oob" }),
      "User-Agent": "Cael/1.0",
    },
  });
  const body = await res.text();
  const params = new URLSearchParams(body);
  const token = params.get("oauth_token");
  const secret = params.get("oauth_token_secret");
  if (!res.ok || !token || !secret) throw new Error(`X refused to start connecting: ${body.slice(0, 200) || res.status}`);
  return { authorizeUrl: `https://api.x.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}&force_login=true`, token, secret };
}

/** Step 2: trade the request token and PIN for that account's own tokens. */
export async function finishXConnect(
  token: string,
  secret: string,
  pin: string,
): Promise<{ handle: string; userId: string; accessToken: string; accessTokenSecret: string }> {
  const { consumerKey, consumerSecret } = appKeys();
  const url = "https://api.x.com/oauth/access_token";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader("POST", url, consumerKey, consumerSecret, token, secret, {}, { oauth_verifier: pin }),
      "User-Agent": "Cael/1.0",
    },
  });
  const body = await res.text();
  const params = new URLSearchParams(body);
  const accessToken = params.get("oauth_token");
  const accessTokenSecret = params.get("oauth_token_secret");
  const handle = params.get("screen_name");
  const userId = params.get("user_id");
  if (!res.ok || !accessToken || !accessTokenSecret || !handle || !userId) {
    throw new Error(res.status === 401 ? "That PIN didn't work. Start again and use the newest PIN." : `X refused the PIN: ${res.status}`);
  }
  return { handle, userId, accessToken, accessTokenSecret };
}

/** X v2 errors come as `errors[]` or as a problem doc (`title`/`detail`), e.g. on a 401. */
function xError(json: unknown, status: number): string {
  const j = json as { errors?: { message?: string; detail?: string }[]; detail?: string; title?: string } | null;
  return (
    j?.errors?.map((e) => e.message ?? e.detail).filter(Boolean).join("; ") ||
    j?.detail ||
    j?.title ||
    `HTTP ${status}`
  );
}

/**
 * Upload one image to X and return its media id, for `postTweet(..., { mediaIds })`.
 * Upload as the same `account` that will post it.
 */
export async function uploadTweetImage(image: Blob, account?: string): Promise<string> {
  if (!TWEET_IMAGE_TYPES.includes(image.type)) throw new Error("Images must be JPG, PNG or WEBP");
  if (image.size > TWEET_IMAGE_MAX_BYTES) throw new Error("Images must be 5 MB or smaller");

  const url = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.append("media", image);
  form.append("media_category", "tweet_image");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: await userAuth("POST", url, {}, account), "User-Agent": "Cael/1.0" },
    body: form,
  });
  const json = (await res.json().catch(() => null)) as { data?: { id: string } } | null;
  if (!res.ok || !json?.data?.id) throw new Error(`Image upload failed: ${xError(json, res.status)}`);
  return json.data.id;
}

/**
 * Fetch an image by URL for `uploadTweetImage`: a chat upload's Blob URL, or a
 * bertomill.com/media URL from generate_post_image (read straight from the
 * `media` table, so it works before the site has deployed and from local dev).
 */
export async function fetchTweetImage(url: string): Promise<Blob> {
  const mediaPrefix = `${PUBLIC_SITE_URL}/media/`;
  if (url.startsWith(mediaPrefix)) {
    const key = url.slice(mediaPrefix.length).split(/[?#]/)[0].split("/").map(decodeURIComponent).join("/");
    const media = await readMedia(key);
    if (!media) throw new Error(`No image at ${url}`);
    return new Blob([new Uint8Array(media.data)], { type: media.contentType });
  }

  const res = await fetch(url, { headers: { "User-Agent": "Cael/1.0" } });
  if (!res.ok) throw new Error(`Couldn't fetch image ${url}: HTTP ${res.status}`);
  return res.blob();
}

/**
 * Post to X as Berto, or as another connected `account` (e.g. "makersloungeto").
 * Every tweet is also saved to the `tweets` table so the Writing page can list
 * it; `postId` links it to the article it shares.
 */
export async function postTweet(
  text: string,
  opts: { postId?: number; mediaIds?: string[]; account?: string } = {},
): Promise<{ id: string; url: string; account: string }> {
  const url = "https://api.twitter.com/2/tweets";
  const body: { text?: string; media?: { media_ids: string[] } } = {};
  if (text) body.text = text;
  if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: await userAuth("POST", url, {}, opts.account),
      "Content-Type": "application/json",
      "User-Agent": "Cael/1.0",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as { data?: { id: string; text: string }; errors?: unknown[] } | null;
  if (!res.ok || json?.errors || !json?.data) throw new Error(xError(json, res.status));

  const account = normalizeHandle(opts.account ?? PERSONAL_X_HANDLE);
  const tweet = { id: json.data.id, url: `https://x.com/${account}/status/${json.data.id}`, account };
  // The tweet is already public; a failed save must not report it as failed.
  await recordTweet({ tweetId: tweet.id, text, url: tweet.url, postId: opts.postId, account }).catch((err) =>
    console.error("couldn't save tweet:", err),
  );
  return tweet;
}

/**
 * Current public metrics for Berto's tweets, keyed by tweet id. Read as Berto,
 * up to 100 ids per request; each tweet returned is a billed post read
 * (`X_POST_READ_COST`). Deleted tweets are simply missing from the result.
 */
export async function fetchTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>> {
  const url = "https://api.x.com/2/tweets";
  const metrics = new Map<string, TweetMetrics>();
  for (let i = 0; i < tweetIds.length; i += X_LOOKUP_MAX_IDS) {
    const query = { ids: tweetIds.slice(i, i + X_LOOKUP_MAX_IDS).join(","), "tweet.fields": "public_metrics" };
    const qs = Object.entries(query)
      .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
      .join("&");
    const res = await fetch(`${url}?${qs}`, {
      headers: { Authorization: await userAuth("GET", url, query), "User-Agent": "Cael/1.0" },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      data?: {
        id: string;
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          retweet_count?: number;
          reply_count?: number;
          quote_count?: number;
          bookmark_count?: number;
        };
      }[];
    } | null;
    // A lookup where some ids are gone still answers 200, with those in `errors`.
    if (!res.ok) throw new Error(`Couldn't read tweet stats: ${xError(json, res.status)}`);
    for (const t of json?.data ?? []) {
      const m = t.public_metrics ?? {};
      metrics.set(t.id, {
        impressions: m.impression_count ?? 0,
        likes: m.like_count ?? 0,
        reposts: m.retweet_count ?? 0,
        replies: m.reply_count ?? 0,
        quotes: m.quote_count ?? 0,
        bookmarks: m.bookmark_count ?? 0,
      });
    }
  }
  return metrics;
}

/**
 * Pull fresh stats from X for every tweet on the Writing page and store them.
 * Costs about `X_POST_READ_COST` per tweet, so it only runs when asked.
 */
export async function refreshTweetStats(): Promise<{ refreshed: number; cost: number }> {
  const tweets = await listTweets();
  if (tweets.length === 0) return { refreshed: 0, cost: 0 };
  const metrics = await fetchTweetMetrics(tweets.map((t) => t.tweetId));
  await saveTweetMetrics(metrics);
  return { refreshed: metrics.size, cost: metrics.size * X_POST_READ_COST };
}

/**
 * Pay-per-use credit left on the X developer account, in USD. Read with the
 * app's Bearer Token (`X_BEARER_TOKEN`); null when it isn't set or X refuses.
 */
export async function getXCreditBalance(): Promise<number | null> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) return null;
  const res = await fetch("https://api.x.com/2/usage/credits", {
    headers: { Authorization: `Bearer ${bearer}`, "User-Agent": "Cael/1.0" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: { total_balance?: number } } | null;
  if (!res.ok || typeof json?.data?.total_balance !== "number") {
    console.error("couldn't read X credit balance:", xError(json, res.status));
    return null;
  }
  return json.data.total_balance;
}
