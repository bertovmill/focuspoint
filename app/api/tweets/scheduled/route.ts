import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { storeMedia } from "@/lib/image-upload";
import { createScheduledTweet, listScheduledTweets } from "@/lib/tweets";
import { TWEET_IMAGE_MAX_BYTES, TWEET_IMAGE_TYPES, TWEET_MAX_IMAGES } from "@/lib/x-shared";
import { postScheduledTweet } from "@/workflows/scheduled-tweet";

/** GET — queued and failed scheduled tweets, soonest first. */
export async function GET() {
  try {
    return NextResponse.json(await listScheduledTweets());
  } catch (err) {
    console.error("[scheduled tweets] list failed:", err);
    return NextResponse.json({ error: "Couldn't load scheduled tweets" }, { status: 500 });
  }
}

/** POST multipart `text`, `scheduledAt` (ISO) and up to four `images` — queue a tweet. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const text = String(form?.get("text") ?? "").trim();
  const images = (form?.getAll("images") ?? []).filter((v): v is File => v instanceof File && v.size > 0);
  const scheduledAt = new Date(String(form?.get("scheduledAt") ?? ""));

  if (!text && images.length === 0) return NextResponse.json({ error: "The tweet is empty" }, { status: 400 });
  if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Pick a time" }, { status: 400 });
  if (scheduledAt.getTime() < Date.now() + 30_000) {
    return NextResponse.json({ error: "Pick a time in the future" }, { status: 400 });
  }
  if (images.length > TWEET_MAX_IMAGES) {
    return NextResponse.json({ error: `A tweet can have at most ${TWEET_MAX_IMAGES} images` }, { status: 400 });
  }
  const bad = images.find((f) => !TWEET_IMAGE_TYPES.includes(f.type) || f.size > TWEET_IMAGE_MAX_BYTES);
  if (bad) {
    return NextResponse.json({ error: `${bad.name}: images must be JPG, PNG or WEBP, 5 MB or smaller` }, { status: 400 });
  }

  try {
    const stamp = Date.now();
    const mediaKeys = await Promise.all(
      images.map(async (f, i) => {
        const key = `scheduled-tweets/${stamp}-${i}.${f.type.split("/")[1]}`;
        await storeMedia(key, Buffer.from(await f.arrayBuffer()), f.type);
        return key;
      }),
    );
    const scheduled = await createScheduledTweet({ text, mediaKeys, scheduledAt });
    await start(postScheduledTweet, [scheduled.id, scheduledAt]);
    return NextResponse.json(scheduled);
  } catch (err) {
    console.error("[scheduled tweets] schedule failed:", err);
    return NextResponse.json({ error: "Couldn't schedule the tweet" }, { status: 500 });
  }
}
