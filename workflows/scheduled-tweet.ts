import { FatalError, sleep } from "workflow";
import { readMedia } from "@/lib/image-upload";
import { claimScheduledTweet, finishScheduledTweet } from "@/lib/tweets";
import { postTweet, uploadTweetImage } from "@/lib/x-api";

/**
 * Post scheduled tweet `id` at `at`. Started by POST /api/tweets/scheduled; the
 * sleep is durable and costs nothing while it waits, which is how a tweet can
 * go out at 3:15pm on Hobby, where crons fire once a day.
 */
export async function postScheduledTweet(id: number, at: Date) {
  "use workflow";
  await sleep(at);
  return publish(id);
}

async function publish(id: number) {
  "use step";
  const claimed = await claimScheduledTweet(id);
  if (!claimed) return { skipped: true };

  try {
    const images = await Promise.all(
      claimed.mediaKeys.map(async (key) => {
        const media = await readMedia(key);
        if (!media) throw new Error(`Image ${key} is missing`);
        return new Blob([new Uint8Array(media.data)], { type: media.contentType });
      }),
    );
    const mediaIds = await Promise.all(images.map((img) => uploadTweetImage(img)));
    const tweet = await postTweet(claimed.text, { mediaIds });
    await finishScheduledTweet(id, { tweetUrl: tweet.url });
    return { url: tweet.url };
  } catch (err) {
    // Not retried: X may have accepted the tweet before the error, and a
    // duplicate post is worse than a failed one he can re-send from the queue.
    const error = err instanceof Error ? err.message : "Couldn't post to X";
    await finishScheduledTweet(id, { error });
    throw new FatalError(error);
  }
}
