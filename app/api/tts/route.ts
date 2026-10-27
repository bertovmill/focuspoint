import { NextResponse } from "next/server";
import { MAX_TTS_CHARS, availableTtsProviders, isTtsProvider, synthesizeSpeech } from "@/lib/tts";

export const runtime = "nodejs";

/** Which paid voices this deployment has keys for, so the picker can grey out the rest. */
export async function GET() {
  return NextResponse.json({ providers: availableTtsProviders() }, { headers: { "Cache-Control": "no-store" } });
}

/** `{ text, provider }` → the audio, ready for an <audio> element. */
export async function POST(request: Request) {
  let body: { text?: unknown; provider?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TTS_CHARS * 2) return NextResponse.json({ error: "text is too long" }, { status: 413 });
  const provider = isTtsProvider(body.provider) ? body.provider : (availableTtsProviders()[0] ?? null);
  if (!provider) return NextResponse.json({ error: "No voice provider is configured" }, { status: 503 });
  if (!availableTtsProviders().includes(provider)) {
    return NextResponse.json({ error: `${provider} is not configured` }, { status: 503 });
  }
  try {
    const audio = await synthesizeSpeech(text, provider);
    return new Response(audio.body, {
      headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store", "X-Voice-Provider": provider },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice failed";
    console.error("[tts]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
