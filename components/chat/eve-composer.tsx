"use client";

import type { ChatStatus, FileUIPart, UserContent } from "ai";
import { ArrowUpIcon, AudioLinesIcon, MicIcon, PlusIcon, SquareIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Speaker, type VoiceMode, type VoiceProvider, useSpeaker, useVoiceSettings } from "@/hooks/use-cael-voice";
import { withChatContext } from "@/lib/chat-context";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputButton,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { ModelPicker } from "@/app/_components/model-picker";
import type { EveAgent, SentFile } from "@/components/chat/eve-thread";
import type { EveMessagePart } from "eve/react";
import { cn } from "@/lib/utils";

/**
 * Cael's composer on AI Elements' PromptInput, styled after the Claude mobile
 * app: a soft rounded card with no coloured focus ring, the text on top, and a
 * row underneath with a round + (attach / screenshot) and the model as a quiet
 * chip. On the right one round button does three jobs: a mic to dictate when
 * the box is empty, a filled send arrow once there's something to send, and a
 * stop square while Cael is answering.
 *
 * Voice (hooks/use-cael-voice.ts): with "Read replies" on, each finished answer
 * is read aloud; with "Talk" on, the mic opens again once Cael has finished
 * speaking and whatever Berto says is sent when he pauses — a conversation he
 * can have with the phone in his pocket on a walk. Cael is told (in a hidden
 * context line) that the reply will be spoken, so it answers in short plain
 * sentences instead of markdown.
 */

const VOICE_CONTEXT =
  "Berto is talking to you by voice and your reply will be read aloud by a text-to-speech voice. " +
  "Answer the way you would speak: short, natural sentences, no markdown, no lists, no headings, no links or code.";

/** How long a pause ends Berto's turn in hands-free mode. */
const SILENCE_AFTER_FINAL_MS = 1200;
const SILENCE_AFTER_INTERIM_MS = 2500;
/** Hands-free rounds that heard nothing before the mic gives up and waits for a tap. */
const MAX_EMPTY_ROUNDS = 2;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Cael's vision gets no benefit past ~1568px on the long edge, and phone
// photos (3-8MB) sent inline as base64 blow past the chat function's request
// body limit (FUNCTION_PAYLOAD_TOO_LARGE). Downscale + re-encode before the
// image ever leaves the browser, for both the inline data URL Cael sees and
// the Blob copy tools reference.
const MAX_IMAGE_DIMENSION = 1568;
const IMAGE_JPEG_QUALITY = 0.85;

async function downscaleImageDataUrl(dataUrl: string, mediaType: string): Promise<{ url: string; mediaType: string }> {
  // Only JPEG/PNG/WebP decode reliably via <img> + canvas; anything else
  // (gif, unknown) rides through unchanged.
  if (!/^image\/(jpeg|png|webp)$/.test(mediaType)) return { url: dataUrl, mediaType };

  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
    });
    img.src = dataUrl;
    await loaded;

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
    if (scale === 1) return { url: dataUrl, mediaType };

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { url: dataUrl, mediaType };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Re-encode as JPEG regardless of source type (drops alpha, but this is
    // for chat photos, not graphics) — much smaller than PNG for photos.
    const resized = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
    return { url: resized, mediaType: "image/jpeg" };
  } catch {
    // Decode failed (e.g. corrupt file) — fall back to the original rather
    // than dropping the image entirely.
    return { url: dataUrl, mediaType };
  }
}

async function uploadImageDataUrl(dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "pasted-image.png", { type: blob.type || "image/png" });
    const form = new FormData();
    form.append("file", file);
    const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
    if (!uploadRes.ok) return null;
    const json = (await uploadRes.json()) as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}

function toChatStatus(status: EveAgent["status"]): ChatStatus {
  switch (status) {
    case "submitted":
    case "resuming":
      return "submitted";
    case "streaming":
      return "streaming";
    case "error":
      return "error";
    default:
      return "ready";
  }
}

function PendingAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((file) => (
          <Attachment
            key={file.id}
            data={file}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

type EveComposerProps = {
  agent: EveAgent;
  /**
   * Called with the files going out on this message, keyed by the index the
   * user message will have, so the thread can keep showing previews.
   */
  onSend?: (messageIndex: number, files: readonly SentFile[]) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Take files dropped anywhere on the page. Off beside a document, where a
   * dropped photo belongs in the document, not the chat.
   */
  globalDrop?: boolean;
};

export function EveComposer(props: EveComposerProps) {
  // The provider lifts the text out of PromptInput so the right-hand button can
  // tell an empty box (mic) from a typed one (send), and dictation can write in.
  return (
    <PromptInputProvider>
      <ComposerCard {...props} />
    </PromptInputProvider>
  );
}

function ComposerCard({
  agent,
  onSend,
  className,
  placeholder = "Message Cael…",
  autoFocus = true,
  globalDrop = true,
}: EveComposerProps) {
  const status = toChatStatus(agent.status);
  const busy = status === "submitted" || status === "streaming";
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const hasContent = controller.textInput.value.trim().length > 0 || attachments.files.length > 0;

  const voice = useVoiceSettings();
  const speaker = useSpeaker(voice.provider);
  const modeRef = useRef<VoiceMode>(voice.mode);
  modeRef.current = voice.mode;
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;

  // Hands-free: what was heard goes straight out, bypassing the form.
  const deliverRef = useRef<(text: string, files: readonly FileUIPart[]) => Promise<void>>(async () => {});
  const emptyRoundsRef = useRef(0);
  const startListeningRef = useRef<(auto: boolean) => void>(() => {});
  const dictation = useDictation(controller.textInput.value, controller.textInput.setInput, {
    onAutoSend: (text) => {
      emptyRoundsRef.current = 0;
      controller.textInput.clear();
      void deliverRef.current(text, []);
    },
    onAutoEmpty: () => {
      // Nothing said (iOS ends recognition after a few quiet seconds). Listen
      // again a couple of times, then wait for a tap rather than loop forever.
      if (modeRef.current !== "talk") return;
      if (emptyRoundsRef.current++ >= MAX_EMPTY_ROUNDS) return;
      startListeningRef.current(true);
    },
  });
  const dictationStop = dictation.stop;
  startListeningRef.current = dictation.start;

  // A brand-new thread has no session until its first send, and creating one
  // (starting the workflow, opening its inbox) used to sit in front of the first
  // reply. Start it on the first keystroke instead, the way eve's docs suggest,
  // so it is ready by the time Enter lands. A send made before it's ready just
  // waits for it. Once per composer: a failed prewarm falls back to the send.
  const prewarmedRef = useRef(false);
  useEffect(() => {
    if (!hasContent || prewarmedRef.current) return;
    if (agent.session?.sessionId || agent.events.length > 0) return;
    prewarmedRef.current = true;
    agent.prewarm().catch(() => {});
  }, [agent, hasContent]);

  // The delivery, detached from the submit handler. eve's `send` promise only
  // settles once Cael's whole answer has streamed (and rejects when the stream
  // drops, which happens whenever the phone backgrounds the app), and
  // PromptInput clears the box only once `onSubmit`'s promise settles — so
  // awaiting the send here left the typed text sitting in the box for the
  // length of the answer, or for good (Berto, 2026-10-13).
  const deliver = useCallback(
    async (text: string, files: readonly FileUIPart[]) => {
      // A fresh question interrupts whatever Cael was still saying.
      speakerRef.current.stop();
      const spoken = modeRef.current !== "off";
      const parts: Exclude<UserContent, string> = [];
      if (text) parts.push({ type: "text", text: spoken ? withChatContext(VOICE_CONTEXT, text) : text });
      else if (spoken) parts.push({ type: "text", text: withChatContext(VOICE_CONTEXT, "") });

      const sent: SentFile[] = [];
      for (const [i, file] of files.entries()) {
        // PromptInput hands us data URLs on submit; anything else is unusable
        // once the composer clears, so skip it rather than send a dead link.
        if (!file.url?.startsWith("data:")) continue;
        let url = file.url;
        let mediaType = file.mediaType || "application/octet-stream";
        if (mediaType.startsWith("image/")) {
          ({ url, mediaType } = await downscaleImageDataUrl(url, mediaType));
        }
        // eve rejects type:"image" — images ride as file parts with the data URL.
        parts.push({ type: "file", data: url, mediaType });
        sent.push({ ...file, id: `sent-${Date.now()}-${i}` });
        if (mediaType.startsWith("image/")) {
          // Also park it in Blob so Cael can hand the picture to tools by URL.
          const blobUrl = await uploadImageDataUrl(url);
          if (blobUrl) {
            parts.push({ type: "text", text: `[Image uploaded — public URL: ${blobUrl}]` });
          }
        }
      }

      if (parts.length === 0) return;
      onSend?.(agent.data.messages.length, sent);

      // Collapse a lone text part to a plain string (eve's simplest input form).
      const content: UserContent =
        parts.length === 1 && parts[0]!.type === "text" ? parts[0]!.text : parts;
      try {
        await agent.send(content);
      } catch {
        // eve has already reported it: the bubble is marked failed, `agent.error`
        // shows the banner, and a dead session is resent from a fresh one.
      }
    },
    [agent, onSend],
  );
  deliverRef.current = deliver;

  // Read each new reply once it has fully arrived. Replies already in the
  // thread when this composer mounted are not read: opening an old chat
  // shouldn't start a monologue.
  const spokenRef = useRef<Set<string> | null>(null);
  if (spokenRef.current === null) {
    spokenRef.current = new Set(agent.data.messages.filter((m) => m.role === "assistant").map((m) => m.id));
  }
  const prevStatusRef = useRef(agent.status);
  const dictationStart = dictation.start;
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = agent.status;
    if (agent.status === "submitted") speakerRef.current.stop();
    if (agent.status !== "ready" || (prev !== "streaming" && prev !== "submitted")) return;
    const last = agent.data.messages.at(-1);
    if (!last || last.role !== "assistant" || spokenRef.current!.has(last.id)) return;
    spokenRef.current!.add(last.id);
    if (modeRef.current === "off" || agent.error) return;
    const text = last.parts
      .filter((p: EveMessagePart): p is Extract<EveMessagePart, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n\n")
      .trim();
    if (!text) {
      if (modeRef.current === "talk") dictationStart(true);
      return;
    }
    void speakerRef.current.speak(text).then((finished) => {
      // Interrupted (a tap, a new send) means Berto has taken over; don't open the mic on him.
      if (finished && modeRef.current === "talk") dictationStart(true);
    });
  }, [agent.status, agent.data.messages, agent.error, dictationStart]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text.trim();
      const files = message.files ?? [];
      if (!text && files.length === 0) return;
      // Returning synchronously is what clears the box right away. Enter while
      // Cael is still answering reaches here too (the Stop button isn't a submit
      // button), and eve would refuse the send: throwing keeps the text in place.
      if (busy) throw new Error("Cael is still answering");
      dictationStop();
      emptyRoundsRef.current = 0;
      void deliver(text, files);
    },
    [busy, deliver, dictationStop],
  );

  return (
    <PromptInput
      onSubmit={handleSubmit}
      multiple
      globalDrop={globalDrop}
      maxFileSize={MAX_FILE_BYTES}
      className={cn(
        "w-full",
        // The card: soft, rounded, lifted by a shadow rather than outlined in colour.
        "[&_[data-slot=input-group]]:rounded-[28px] [&_[data-slot=input-group]]:border-border/70",
        "[&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-[0_2px_16px_-4px_rgb(0_0_0/0.12)]",
        "dark:[&_[data-slot=input-group]]:shadow-[0_2px_16px_-4px_rgb(0_0_0/0.5)]",
        // Focus deepens the shadow a touch instead of drawing a ring.
        "[&_[data-slot=input-group]:has(textarea:focus-visible)]:!border-border",
        "[&_[data-slot=input-group]:has(textarea:focus-visible)]:!ring-0",
        "[&_[data-slot=input-group]:has(textarea:focus-visible)]:shadow-[0_4px_24px_-6px_rgb(0_0_0/0.2)]",
        className,
      )}
    >
      <PendingAttachments />
      <PromptInputBody>
        <PromptInputTextarea
          placeholder={speaker.speaking ? "Cael is speaking…" : dictation.listening ? "Listening…" : placeholder}
          aria-label="Message input"
          autoFocus={autoFocus}
          className="min-h-12 px-4 pt-3.5 pb-1 text-base leading-snug placeholder:text-muted-foreground/70"
        />
      </PromptInputBody>
      <PromptInputFooter className="px-2.5 pt-1 pb-2.5">
        <PromptInputTools className="gap-1.5">
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              aria-label="Add photos or a screenshot"
              className="size-8 rounded-full border border-border/70 text-muted-foreground hover:text-foreground"
            >
              <PlusIcon className="size-4" />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
              <PromptInputActionAddScreenshot />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          {/* One global setting — the same picker the floating chat bar shows. */}
          <ModelPicker variant="compact" />
          <VoiceMenu
            mode={voice.mode}
            provider={voice.provider}
            available={voice.available}
            speaker={speaker}
            onMode={(mode) => {
              // Inside the tap, so iOS lets the audio play later without one.
              speaker.unlock();
              voice.update({ mode });
              emptyRoundsRef.current = 0;
              if (mode === "off") {
                speaker.stop();
                dictationStop();
              } else if (mode === "talk" && !busy && !dictation.listening) {
                dictation.start(true);
              }
            }}
            onProvider={(provider) => {
              speaker.unlock();
              voice.update({ provider });
            }}
          />
        </PromptInputTools>
        {busy ? (
          <PromptInputSubmit
            status={status}
            onStop={() => void agent.cancel()}
            aria-label="Stop generating"
            className="size-8 rounded-full bg-foreground text-background hover:bg-foreground/85"
          >
            <SquareIcon className="size-3 fill-current" />
          </PromptInputSubmit>
        ) : hasContent || !dictation.supported || dictation.listening ? (
          dictation.listening && !hasContent ? null : (
            <PromptInputSubmit
              status={status}
              aria-label="Send message"
              disabled={!hasContent}
              className={cn(
                "size-8 rounded-full transition-colors",
                hasContent
                  ? "bg-foreground text-background hover:bg-foreground/85"
                  : "bg-muted text-muted-foreground/60",
              )}
            >
              <ArrowUpIcon className="size-4" strokeWidth={2.5} />
            </PromptInputSubmit>
          )
        ) : null}
        {!busy && dictation.supported && (dictation.listening || !hasContent) ? (
          <PromptInputButton
            aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
            aria-pressed={dictation.listening}
            onClick={() => {
              speaker.stop();
              emptyRoundsRef.current = 0;
              dictation.listening ? dictation.stop() : dictation.start(voice.mode === "talk");
            }}
            className={cn(
              "size-8 rounded-full transition-colors",
              dictation.listening
                ? "animate-pulse bg-red-500 text-white hover:bg-red-500/90"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <MicIcon className="size-4" />
          </PromptInputButton>
        ) : null}
      </PromptInputFooter>
    </PromptInput>
  );
}

// ---------------------------------------------------------------------------
// The voice button: a speaker that stops Cael mid-sentence while it talks, and
// otherwise opens the voice settings for this device.

const MODE_LABELS: Record<VoiceMode, { label: string; hint: string }> = {
  off: { label: "Off", hint: "Replies as text only" },
  read: { label: "Read replies aloud", hint: "Cael speaks every answer" },
  talk: { label: "Talk hands-free", hint: "Listens again after each answer; sends when you pause" },
};

const PROVIDER_LABELS: Record<VoiceProvider, { label: string; hint: string; needs?: string }> = {
  browser: { label: "Device voice", hint: "Built into the phone or browser. Free." },
  kokoro: { label: "Kokoro", hint: "Open-source voice, cents per hour.", needs: "DEEPINFRA_API_KEY" },
  elevenlabs: { label: "ElevenLabs", hint: "River, the podcast voice. Uses credits.", needs: "ELEVEN_LABS_API_KEY" },
};

function VoiceMenu({
  mode,
  provider,
  available,
  speaker,
  onMode,
  onProvider,
}: {
  mode: VoiceMode;
  provider: VoiceProvider;
  available: readonly VoiceProvider[];
  speaker: Speaker;
  onMode: (mode: VoiceMode) => void;
  onProvider: (provider: VoiceProvider) => void;
}) {
  const buttonClass = cn(
    "size-8 rounded-full border border-border/70 transition-colors",
    mode === "off" ? "text-muted-foreground hover:text-foreground" : "border-foreground/30 text-foreground",
  );
  if (speaker.speaking) {
    return (
      <PromptInputButton
        aria-label="Stop speaking"
        onClick={speaker.stop}
        className={cn(buttonClass, "animate-pulse bg-foreground text-background hover:bg-foreground/85 hover:text-background")}
      >
        <AudioLinesIcon className="size-4" />
      </PromptInputButton>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton aria-label="Voice settings" className={buttonClass}>
          {mode === "off" ? <VolumeXIcon className="size-4" /> : mode === "talk" ? <AudioLinesIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Cael&apos;s voice</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => onMode(v as VoiceMode)}>
          {(Object.keys(MODE_LABELS) as VoiceMode[]).map((m) => (
            <DropdownMenuRadioItem key={m} value={m} className="flex-col items-start gap-0 py-1.5">
              <span>{MODE_LABELS[m].label}</span>
              <span className="text-xs text-muted-foreground">{MODE_LABELS[m].hint}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Voice</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={provider} onValueChange={(v) => onProvider(v as VoiceProvider)}>
          {(Object.keys(PROVIDER_LABELS) as VoiceProvider[]).map((p) => {
            const ready = p === "browser" || available.includes(p);
            return (
              <DropdownMenuRadioItem key={p} value={p} disabled={!ready} className="flex-col items-start gap-0 py-1.5">
                <span>{PROVIDER_LABELS[p].label}</span>
                <span className="text-xs text-muted-foreground">
                  {ready ? PROVIDER_LABELS[p].hint : `Add ${PROVIDER_LABELS[p].needs} to turn this on`}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {speaker.error ? (
          <p className="px-2 pb-1.5 pt-1 text-xs text-destructive">
            {speaker.error} — used the device voice instead.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Dictation via the browser's own speech recognition (Chrome, Edge, Safari).
// Where it isn't available the mic never shows and the send button sits there
// dimmed instead. Speech is appended to whatever is already typed.
//
// Started with `auto` (hands-free), it also decides when Berto has finished:
// a pause after a final result, or recognition ending on its own, sends what
// was heard through `onAutoSend`; a round that heard nothing calls `onAutoEmpty`.

type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined) ?? null;
}

function useDictation(
  value: string,
  setValue: (v: string) => void,
  handlers: { onAutoSend: (text: string) => void; onAutoEmpty: () => void },
) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checked after mount so the server and first client render agree.
  useEffect(() => setSupported(speechRecognitionCtor() !== null), []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(
    (auto = false) => {
      if (recognitionRef.current) return;
      const Ctor = speechRecognitionCtor();
      if (!Ctor) return;
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      const typed = valueRef.current.trim();
      baseRef.current = typed ? `${typed} ` : "";
      let heard = "";
      const clearSilence = () => {
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = null;
      };
      rec.onresult = (event) => {
        heard = "";
        let lastFinal = false;
        for (let i = 0; i < event.results.length; i++) {
          heard += event.results[i]![0]!.transcript;
          lastFinal = !!event.results[i]!.isFinal;
        }
        setValue(baseRef.current + heard.trimStart());
        if (auto && heard.trim()) {
          // Quiet for a moment after speaking: that's the end of the turn.
          clearSilence();
          silenceRef.current = setTimeout(() => rec.stop(), lastFinal ? SILENCE_AFTER_FINAL_MS : SILENCE_AFTER_INTERIM_MS);
        }
      };
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearSilence();
        setListening(false);
        recognitionRef.current = null;
        if (!auto) return;
        const text = (baseRef.current + heard.trimStart()).trim();
        if (text) handlersRef.current.onAutoSend(text);
        else handlersRef.current.onAutoEmpty();
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
    },
    [setValue],
  );

  useEffect(
    () => () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      recognitionRef.current?.stop();
    },
    [],
  );

  return { supported, listening, start, stop };
}
