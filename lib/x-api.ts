import { createHmac, randomBytes } from "crypto";
import { recordTweet } from "./tweets";
import { TWEET_IMAGE_MAX_BYTES, TWEET_IMAGE_TYPES } from "./x-shared";

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
): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = oauthSign(method, url, oauthParams, consumerSecret, accessTokenSecret);
  return `OAuth ${Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ")}`;
}

function credentials() {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error("X API credentials not configured");
  }
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

/** OAuth 1.0a header for a request signed as Berto. Body params aren't signed (JSON and multipart bodies aren't). */
function userAuth(method: string, url: string): string {
  const c = credentials();
  return buildAuthHeader(method, url, c.consumerKey, c.consumerSecret, c.accessToken, c.accessTokenSecret);
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

/** Upload one image to X and return its media id, for `postTweet(..., { mediaIds })`. */
export async function uploadTweetImage(image: Blob): Promise<string> {
  if (!TWEET_IMAGE_TYPES.includes(image.type)) throw new Error("Images must be JPG, PNG or WEBP");
  if (image.size > TWEET_IMAGE_MAX_BYTES) throw new Error("Images must be 5 MB or smaller");

  const url = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.append("media", image);
  form.append("media_category", "tweet_image");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: userAuth("POST", url), "User-Agent": "Cael/1.0" },
    body: form,
  });
  const json = (await res.json().catch(() => null)) as { data?: { id: string } } | null;
  if (!res.ok || !json?.data?.id) throw new Error(`Image upload failed: ${xError(json, res.status)}`);
  return json.data.id;
}

/**
 * Post to X as Berto. Every tweet is also saved to the `tweets` table so the
 * Writing page can list it; `postId` links it to the article it shares.
 */
export async function postTweet(
  text: string,
  opts: { postId?: number; mediaIds?: string[] } = {},
): Promise<{ id: string; url: string }> {
  const url = "https://api.twitter.com/2/tweets";
  const body: { text?: string; media?: { media_ids: string[] } } = {};
  if (text) body.text = text;
  if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: userAuth("POST", url),
      "Content-Type": "application/json",
      "User-Agent": "Cael/1.0",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as { data?: { id: string; text: string }; errors?: unknown[] } | null;
  if (!res.ok || json?.errors || !json?.data) throw new Error(xError(json, res.status));

  const tweet = { id: json.data.id, url: `https://x.com/i/web/status/${json.data.id}` };
  // The tweet is already public; a failed save must not report it as failed.
  await recordTweet({ tweetId: tweet.id, text, url: tweet.url, postId: opts.postId }).catch((err) =>
    console.error("couldn't save tweet:", err),
  );
  return tweet;
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
