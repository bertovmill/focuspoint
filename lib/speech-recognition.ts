// The browser's own speech recognition (Chrome, Edge, Safari), typed loosely so
// nothing here depends on DOM lib typings that differ between browsers. Shared by
// the chat composer's dictation and the meal check-in's tap-to-talk.

export type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** The constructor, or null where the browser has none (e.g. a WKWebView). */
export function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined) ?? null;
}
