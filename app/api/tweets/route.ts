import { NextResponse } from "next/server";
import { listTweets } from "@/lib/tweets";
import { postTweet, uploadTweetImage } from "@/lib/x-api";
import { TWEET_IMAGE_MAX_BYTES, TWEET_IMAGE_TYPES, TWEET_MAX_IMAGES } from "@/lib/x-shared";

/** GET — tweets Cael has posted, newest first. */
export async function GET() {
  try {
    return NextResponse.json(await listTweets());
  } catch {
    return NextResponse.json({ error: "Couldn't load tweets" }, { status: 500 });
  }
}

/**
 * POST — post a tweet from the Writing page's Tweets tab. Takes JSON `{ text }`,
 * or multipart form data with `text` and up to four `images`.
 */
export async function POST(req: Request) {
  let text = "";
  let images: File[] = [];
  if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    text = String(form?.get("text") ?? "");
    images = (form?.getAll("images") ?? []).filter((v): v is File => v instanceof File && v.size > 0);
  } else {
    const body = await req.json().catch(() => ({}));
    text = typeof body.text === "string" ? body.text : "";
  }
  text = text.trim();

  if (!text && images.length === 0) {
    return NextResponse.json({ error: "The tweet is empty" }, { status: 400 });
  }
  if (images.length > TWEET_MAX_IMAGES) {
    return NextResponse.json({ error: `A tweet can have at most ${TWEET_MAX_IMAGES} images` }, { status: 400 });
  }
  const bad = images.find((f) => !TWEET_IMAGE_TYPES.includes(f.type) || f.size > TWEET_IMAGE_MAX_BYTES);
  if (bad) {
    return NextResponse.json({ error: `${bad.name}: images must be JPG, PNG or WEBP, 5 MB or smaller` }, { status: 400 });
  }

  try {
    const mediaIds = await Promise.all(images.map((f) => uploadTweetImage(f)));
    return NextResponse.json(await postTweet(text, { mediaIds }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't post to X" }, { status: 502 });
  }
}
