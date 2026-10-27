"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { splitForSpeech, toSpeechText } from "@/lib/speech-text";

/**
 * Cael out loud. Two halves:
 *
 * - `useVoiceSettings`: how Berto wants it on *this* device (off / read replies /
 *   hands-free talk) and which voice. Kept in localStorage, not the DB, because
 *   the phone on a walk and the laptop at a desk want different answers.
 * - `useSpeaker`: turns a reply into sound. "browser" is the device's own
 *   speech synthesis (free, offline, no server). The paid voices go through
 *   /api/tts in sentence-sized chunks, the next chunk fetched while the current
 *   one plays, so the first words start within a second instead of after the
 *   whole reply has been made.
 */

export type VoiceMode = "off" | "read" | "talk";
export type VoiceProvider = "browser" | "kokoro" | "elevenlabs";

export type VoiceSettings = {
  mode: VoiceMode;
  provider: VoiceProvider;
  /** Paid providers this deployment has keys for; the picker greys out the rest. */
  available: readonly VoiceProvider[];
  loaded: boolean;
};

const STORAGE_KEY = "cael.voice";

let state: VoiceSettings = { mode: "off", provider: "browser", available: [], loaded: false };
const listeners = new Set<() => void>();

function publish(next: Partial<VoiceSettings>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function isMode(v: unknown): v is VoiceMode {
  return v === "off" || v === "read" || v === "talk";
}
function isProvider(v: unknown): v is VoiceProvider {
  return v === "browser" || v === "kokoro" || v === "elevenlabs";
}

let loadStarted = false;
function loadOnce() {
  if (loadStarted || typeof window === "undefined") return;
  loadStarted = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<VoiceSettings> | null;
    publish({
      mode: isMode(saved?.mode) ? saved.mode : "off",
      provider: isProvider(saved?.provider) ? saved.provider : "browser",
    });
  } catch {
    /* no saved setting */
  }
  fetch("/api/tts")
    .then((r) => r.json())
    .then((d: { providers?: unknown }) => {
      const available = Array.isArray(d.providers) ? d.providers.filter(isProvider) : [];
      // A voice whose key has gone falls back to the free one rather than failing every reply.
      const provider = state.provider === "browser" || available.includes(state.provider) ? state.provider : "browser";
      publish({ available, provider, loaded: true });
    })
    .catch(() => publish({ loaded: true }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: VoiceSettings = { mode: "off", provider: "browser", available: [], loaded: false };

export function useVoiceSettings() {
  const settings = useSyncExternalStore(subscribe, () => state, () => serverSnapshot);
  useEffect(loadOnce, []);
  const update = useCallback((next: Partial<Pick<VoiceSettings, "mode" | "provider">>) => {
    publish(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode, provider: state.provider }));
    } catch {
      /* private mode */
    }
  }, []);
  return { ...settings, update };
}

// ---------------------------------------------------------------------------

// A silent 0.1s WAV. Playing it inside the tap that turns voice on is what lets
// iOS play the real audio later, when no tap is in flight.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function pickSynthesisVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const lang = (navigator.language || "en-US").toLowerCase();
  const inLang = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = inLang.length ? inLang : voices;
  // The better-sounding built-ins first: Apple's enhanced/premium voices on
  // iOS and macOS, then Google's on Android/Chrome, then whatever is default.
  const preferred = [/premium/i, /enhanced/i, /siri/i, /daniel|samantha|karen|moira|arthur/i, /google/i, /natural/i];
  for (const re of preferred) {
    const hit = pool.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return pool.find((v) => v.default) ?? pool[0] ?? null;
}

export type Speaker = {
  /** Reads `text` (markdown is fine). Resolves when done or interrupted; false if interrupted. */
  speak: (text: string) => Promise<boolean>;
  stop: () => void;
  /** Call inside a user tap before the first `speak`, for iOS. */
  unlock: () => void;
  speaking: boolean;
  /** Last failure, e.g. the voice API refusing; cleared by the next successful speak. */
  error: string | null;
};

export function useSpeaker(provider: VoiceProvider): Speaker {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  // Settles the chunk currently playing, so stop() can't leave speak() hanging.
  const interruptRef = useRef<(() => void) | null>(null);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  const audio = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const el = new Audio();
      el.preload = "auto";
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  const unlock = useCallback(() => {
    const el = audio();
    if (el) {
      el.src = SILENT_WAV;
      el.play().catch(() => {});
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      // Warms the voice list (Chrome fills it asynchronously) and the engine.
      window.speechSynthesis.getVoices();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }, [audio]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    interruptRef.current?.();
    interruptRef.current = null;
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback(async (chunks: string[], generation: number): Promise<boolean> => {
    if (!("speechSynthesis" in window)) return false;
    const synth = window.speechSynthesis;
    // Voices can arrive late on Chrome; wait briefly for them the first time.
    if (synth.getVoices().length === 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 400);
        synth.addEventListener("voiceschanged", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
    const voice = pickSynthesisVoice();
    for (const chunk of chunks) {
      if (generation !== generationRef.current) return false;
      const done = await new Promise<boolean>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.rate = 1.03;
        u.onend = () => resolve(true);
        u.onerror = (e) => resolve(e.error === "interrupted" || e.error === "canceled" ? false : true);
        synth.speak(u);
      });
      if (!done) return false;
    }
    return true;
  }, []);

  const fetchChunk = useCallback(async (text: string): Promise<Blob> => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider: providerRef.current }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `Voice failed (${res.status})`);
    }
    return res.blob();
  }, []);

  const speakWithApi = useCallback(
    async (chunks: string[], generation: number): Promise<boolean> => {
      const el = audio();
      if (!el) return false;
      let next: Promise<Blob> | null = chunks.length ? fetchChunk(chunks[0]!) : null;
      for (let i = 0; i < chunks.length; i++) {
        const blob = await next!;
        next = i + 1 < chunks.length ? fetchChunk(chunks[i + 1]!) : null;
        // Keep a rejected prefetch from surfacing as an unhandled rejection
        // if we bail out before awaiting it.
        next?.catch(() => {});
        if (generation !== generationRef.current) return false;
        const url = URL.createObjectURL(blob);
        const done = await new Promise<boolean>((resolve) => {
          interruptRef.current = () => resolve(false);
          el.onended = () => resolve(true);
          el.onerror = () => resolve(false);
          el.src = url;
          el.play().catch(() => resolve(false));
        });
        interruptRef.current = null;
        URL.revokeObjectURL(url);
        if (!done) return false;
      }
      return true;
    },
    [audio, fetchChunk],
  );

  const speak = useCallback(
    async (text: string): Promise<boolean> => {
      stop();
      const generation = generationRef.current;
      const chunks = splitForSpeech(toSpeechText(text));
      if (chunks.length === 0) return true;
      setSpeaking(true);
      try {
        let finished: boolean;
        if (providerRef.current === "browser") {
          finished = await speakWithBrowser(chunks, generation);
        } else {
          try {
            finished = await speakWithApi(chunks, generation);
            setError(null);
          } catch (err) {
            // The paid voice is down or out of credit: say it with the free one
            // rather than going quiet, and show why.
            setError(err instanceof Error ? err.message : "Voice failed");
            finished = generation === generationRef.current ? await speakWithBrowser(chunks, generation) : false;
          }
        }
        return finished && generation === generationRef.current;
      } finally {
        if (generation === generationRef.current) setSpeaking(false);
      }
    },
    [speakWithApi, speakWithBrowser, stop],
  );

  // Leaving the chat shouldn't leave Cael talking.
  useEffect(() => stop, [stop]);

  return { speak, stop, unlock, speaking, error };
}
