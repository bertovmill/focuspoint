import { createHmac, randomBytes } from "crypto";

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

export async function postTweet(text: string): Promise<{ id: string; url: string }> {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error("X API credentials not configured");
  }

  const url = "https://api.twitter.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader("POST", url, consumerKey, consumerSecret, accessToken, accessTokenSecret),
      "Content-Type": "application/json",
      "User-Agent": "Cael/1.0",
    },
    body: JSON.stringify({ text }),
  });

  const json = (await res.json()) as { data?: { id: string; text: string }; errors?: { message: string }[] };
  if (!res.ok || json.errors) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`);
  }

  return { id: json.data!.id, url: `https://x.com/i/web/status/${json.data!.id}` };
}
