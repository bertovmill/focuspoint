"use client";

import type { ChatStatus, UserContent } from "ai";
import { useCallback } from "react";
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
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { ModelPicker } from "@/app/_components/model-picker";
import type { EveAgent, SentFile } from "@/components/chat/eve-thread";
import { cn } from "@/lib/utils";

/**
 * Cael's composer on AI Elements' PromptInput: text, drag-and-drop or pasted
 * files, a screenshot action, the app-wide model picker, and a submit button
 * that turns into a stop button while a turn is running.
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

export function EveComposer({
  agent,
  onSend,
  className,
}: {
  agent: EveAgent;
  /**
   * Called with the files going out on this message, keyed by the index the
   * user message will have, so the thread can keep showing previews.
   */
  onSend?: (messageIndex: number, files: readonly SentFile[]) => void;
  className?: string;
}) {
  const status = toChatStatus(agent.status);
  const busy = status === "submitted" || status === "streaming";

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
      onSend?.(agent.data.messages.length, sent);

      // Collapse a lone text part to a plain string (eve's simplest input form).
      const content: UserContent =
        parts.length === 1 && parts[0]!.type === "text" ? parts[0]!.text : parts;
      await agent.send(content);
    },
    [agent, onSend],
  );

  return (
    <PromptInput
      onSubmit={handleSubmit}
      multiple
      globalDrop
      maxFileSize={MAX_FILE_BYTES}
      className={cn("w-full", className)}
    >
      <PendingAttachments />
      <PromptInputBody>
        <PromptInputTextarea
          placeholder="Message Cael…"
          aria-label="Message input"
          autoFocus
          className="text-base"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
              <PromptInputActionAddScreenshot />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          {/* One global setting — the same picker the floating chat bar shows. */}
          <ModelPicker variant="compact" />
        </PromptInputTools>
        <PromptInputSubmit
          status={status}
          onStop={() => void agent.cancel()}
          aria-label={busy ? "Stop generating" : "Send message"}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
