import "server-only";

import { toSpeechText } from "@/lib/speech-text";

/**
 * Cael's voice, server side. Two paid-API providers; the free one (the
 * browser's own speech synthesis) needs no server and lives in
 * hooks/use-cael-voice.ts.
 *
 * - "kokoro": Kokoro-82M, an open-weights model, through any OpenAI-compatible
 *   `/audio/speech` endpoint. Default is DeepInfra (DEEPINFRA_API_KEY), which
 *   charges per character at a small fraction of ElevenLabs' rate. Point
 *   KOKORO_API_URL at a self-hosted Kokoro-FastAPI (or OpenAI's own TTS) to
 *   swap the host without touching code.
 * - "elevenlabs": ElevenLabs Flash v2.5 (half a credit per character, the
 *   cheapest model they sell) with the River voice the podcast skill uses.
 */

export const TTS_PROVIDERS = ["kokoro", "elevenlabs"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export function isTtsProvider(value: unknown): value is TtsProvider {
  return typeof value === "string" && (TTS_PROVIDERS as readonly string[]).includes(value);
}

export function availableTtsProviders(): TtsProvider[] {
  const out: TtsProvider[] = [];
  if (process.env.DEEPINFRA_API_KEY || process.env.KOKORO_API_KEY) out.push("kokoro");
  if (process.env.ELEVEN_LABS_API_KEY) out.push("elevenlabs");
  return out;
}

/** The voice API's limit is generous; this keeps a runaway reply from costing much. */
export const MAX_TTS_CHARS = 4000;

export type SpeechAudio = { body: ArrayBuffer; contentType: string };

export async function synthesizeSpeech(markdown: string, provider: TtsProvider): Promise<SpeechAudio> {
  const text = toSpeechText(markdown).slice(0, MAX_TTS_CHARS);
  if (!text) throw new Error("Nothing to say");
  return provider === "elevenlabs" ? elevenLabs(text) : kokoro(text);
}

async function kokoro(text: string): Promise<SpeechAudio> {
  const key = process.env.KOKORO_API_KEY || process.env.DEEPINFRA_API_KEY;
  if (!key) throw new Error("Kokoro is not configured (set DEEPINFRA_API_KEY)");
  const url = process.env.KOKORO_API_URL || "https://api.deepinfra.com/v1/openai/audio/speech";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.KOKORO_MODEL || "hexgrad/Kokoro-82M",
      input: text,
      // Kokoro voice ids: af_heart, af_bella, af_nicole, am_adam, am_michael, bm_george…
      voice: process.env.KOKORO_VOICE || "am_michael",
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`Kokoro ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { body: await res.arrayBuffer(), contentType: res.headers.get("content-type") || "audio/mpeg" };
}

async function elevenLabs(text: string): Promise<SpeechAudio> {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new Error("ElevenLabs is not configured (set ELEVEN_LABS_API_KEY)");
  // River, the voice from skills/podcast-host. 64 kbps mp3 is plenty for speech.
  const voice = process.env.ELEVEN_LABS_VOICE_ID || "SAz9YHcvj6GT2YYXdXww";
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: process.env.ELEVEN_LABS_MODEL || "eleven_flash_v2_5" }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { body: await res.arrayBuffer(), contentType: "audio/mpeg" };
}
