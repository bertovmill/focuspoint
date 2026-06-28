import { defineTool } from "eve/tools";
import { z } from "zod";
import { createHmac, randomBytes } from "crypto";

const X_API_URL = "https://api.twitter.com/2/tweets";

function oauthSign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  return createHmac("sha1", signingKey).update(base).digest("base64");
}

function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildAuthHeader(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
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

  const allParams = { ...bodyParams, ...oauthParams };
  const signature = oauthSign(method, url, allParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

export default defineTool({
  description:
    "Post a tweet to X (Twitter) on behalf of the user. Use this when the user asks to tweet, post to X, or share something publicly on Twitter/X. Always confirm the exact tweet text with the user before posting.",
  inputSchema: z.object({
    text: z
      .string()
      .min(1)
      .max(280)
      .describe("The tweet text to post. Must be 280 characters or fewer."),
  }),
  async execute({ text }) {
    const consumerKey = process.env.X_API_KEY;
    const consumerSecret = process.env.X_API_KEY_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      return {
        success: false,
        error:
          "X API credentials are not configured. Set X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET in your environment.",
      };
    }

    const body = { text };
    const authHeader = buildAuthHeader(
      "POST",
      X_API_URL,
      {},
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret,
    );

    const res = await fetch(X_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "User-Agent": "Cael/1.0",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { data?: { id: string; text: string }; errors?: { message: string }[] };

    if (!res.ok || json.errors) {
      const msg = json.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    return {
      success: true,
      tweet_id: json.data!.id,
      text: json.data!.text,
      url: `https://x.com/i/web/status/${json.data!.id}`,
    };
  },
  toModelOutput(output) {
    if (!output.success) {
      return { type: "text", value: `Failed to post tweet: ${output.error}` };
    }
    return {
      type: "text",
      value: `Tweet posted! View it at ${output.url}`,
    };
  },
});
