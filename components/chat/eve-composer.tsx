"use client";

import type { ChatStatus, UserContent } from "ai";
import { ArrowUpIcon, MicIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

/**
 * Cael's composer on AI Elements' PromptInput, styled after the Claude mobile
 * app: a soft rounded card with no coloured focus ring, the text on top, and a
 * row underneath with a round + (attach / screenshot) and the model as a quiet
 * chip. On the right one round button does three jobs: a mic to dictate when
 * the box is empty, a filled send arrow once there's something to send, and a
 * stop square while Cael is answering.
 */

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
  const dictation = useDictation(controller.textInput.value, controller.textInput.setInput);
  const dictationStop = dictation.stop;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      const files = message.files ?? [];
      if (!text && files.length === 0) return;

      const parts: Exclude<UserContent, string> = [];
      if (text) parts.push({ type: "text", text });

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
      dictationStop();
      onSend?.(agent.data.messages.length, sent);

      // Collapse a lone text part to a plain string (eve's simplest input form).
      const content: UserContent =
        parts.length === 1 && parts[0]!.type === "text" ? parts[0]!.text : parts;
      await agent.send(content);
    },
    [agent, onSend, dictationStop],
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
          placeholder={dictation.listening ? "Listening…" : placeholder}
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
            onClick={dictation.toggle}
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
// Dictation via the browser's own speech recognition (Chrome, Edge, Safari).
// Where it isn't available the mic never shows and the send button sits there
// dimmed instead. Speech is appended to whatever is already typed.

type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>;

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

function useDictation(value: string, setValue: (v: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  // Checked after mount so the server and first client render agree.
  useEffect(() => setSupported(speechRecognitionCtor() !== null), []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    const typed = valueRef.current.trim();
    baseRef.current = typed ? `${typed} ` : "";
    rec.onresult = (event) => {
      let heard = "";
      for (let i = 0; i < event.results.length; i++) heard += event.results[i]![0]!.transcript;
      setValue(baseRef.current + heard.trimStart());
    };
    const finish = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = finish;
    rec.onerror = finish;
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [setValue]);

  const toggle = useCallback(() => (recognitionRef.current ? stop() : start()), [start, stop]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, toggle, stop };
}
