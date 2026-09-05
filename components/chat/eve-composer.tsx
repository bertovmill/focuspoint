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
        const mediaType = file.mediaType || "application/octet-stream";
        // eve rejects type:"image" — images ride as file parts with the data URL.
        parts.push({ type: "file", data: file.url, mediaType });
        sent.push({ ...file, id: `sent-${Date.now()}-${i}` });
        if (mediaType.startsWith("image/")) {
          // Also park it in Blob so Cael can hand the picture to tools by URL.
          const blobUrl = await uploadImageDataUrl(file.url);
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
