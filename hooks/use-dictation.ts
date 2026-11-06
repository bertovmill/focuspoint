"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type SpeechRecognitionLike, speechRecognitionCtor } from "@/lib/speech-recognition";

// Tap-to-talk dictation into a text value with the browser's own speech
// recognition. What's heard is appended, live, after whatever was already typed
// when it started, until `stop()` or recognition ends on its own (Safari ends a
// long silence by itself). `supported` is null until the first client render has
// looked, then true/false; where it's false the mic should stay hidden and the
// keyboard's own dictation is the way in.
//
// The chat composer has its own hands-free variant (auto-send on a pause); this
// is the plain one.

export function useDictation(value: string, setValue: (v: string) => void) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Layout effect so the mic is decided before the first paint (no flash of a
  // mic that then disappears, or a gap that then fills).
  useLayoutEffect(() => setSupported(speechRecognitionCtor() !== null), []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    const typed = valueRef.current.trim();
    const base = typed ? `${typed} ` : "";
    rec.onresult = (event) => {
      let heard = "";
      for (let i = 0; i < event.results.length; i++) heard += event.results[i]![0]!.transcript;
      setValue(base + heard.trimStart());
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = finish;
    rec.onerror = finish;
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      finish();
      return;
    }
    setListening(true);
  }, [setValue]);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, start, stop, toggle };
}
