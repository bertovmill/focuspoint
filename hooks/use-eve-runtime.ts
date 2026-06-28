"use client";

import {
  type EveMessage,
  type EveMessageData,
  type EveMessagePart,
  type UseEveAgentHelpers,
} from "eve/react";
import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  type CompleteAttachment,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { UserContent } from "ai";
import { useMemo, useRef } from "react";

// Stateless adapters — instantiate once at module scope. Images ride along as
// data-URL image parts; text-like files are inlined as <attachment> text.
const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

type ContentPart = Extract<
  ThreadMessageLike["content"],
  readonly unknown[]
>[number];

// eve's summarizeUserContent appends [file: ...] and [image: ...] markers to
// user message text. Strip them so they don't leak into the rendered bubble.
function stripEveAttachmentMarkers(text: string): string {
  return text.replace(/\n?\[file:[^\]]*\]/g, "").replace(/\n?\[image:[^\]]*\]/g, "").trim();
}

function convertEvePart(part: EveMessagePart, role?: string): ContentPart | null {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: role === "user" ? stripEveAttachmentMarkers(part.text) : part.text,
      };
    case "reasoning":
      return { type: "reasoning", text: part.text };
    case "dynamic-tool": {
      const isError = part.state === "output-error";
      return {
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: (part.input ?? {}) as any,
        result: "output" in part ? part.output : undefined,
        isError,
      };
    }
    case "step-start":
    case "authorization":
      return null;
    default:
      return null;
  }
}

function convertEveMessage(
  message: EveMessage,
  index: number,
  total: number,
  isRunning: boolean,
  imageStore?: Map<number, string[]>,
): ThreadMessageLike {
  const isLast = index === total - 1;
  const isStreaming = isLast && isRunning && message.role === "assistant";

  const parts = message.parts
    .map((p) => convertEvePart(p, message.role))
    .filter((p): p is ContentPart => p !== null);

  // Restore image attachments from the in-session store so they render after
  // the agent responds (eve only stores a text summary, not the image bytes).
  const storedImages = message.role === "user" ? imageStore?.get(index) : undefined;
  const attachments: CompleteAttachment[] | undefined = storedImages?.map(
    (image, i) => ({
      id: `img-${index}-${i}`,
      type: "image" as const,
      name: "image.png",
      status: { type: "complete" as const },
      content: [{ type: "image" as const, image }],
    }),
  );

  return {
    id: message.id,
    role: message.role,
    content: parts.length > 0 ? parts : [{ type: "text", text: "" }],
    ...(message.role === "user" && attachments && { attachments }),
    ...(message.role === "assistant" && {
      status: isStreaming
        ? { type: "running" }
        : { type: "complete", reason: "stop" },
    }),
  };
}

export function useEveRuntime(agent: UseEveAgentHelpers<EveMessageData>) {
  const isRunning =
    agent.status === "submitted" || agent.status === "streaming";

  // Maps message index → image data URLs captured at send time.
  // Eve discards image bytes; this keeps them alive for the current session.
  const imageStoreRef = useRef<Map<number, string[]>>(new Map());

  const messages = useMemo(
    () =>
      agent.data.messages.map((msg, i) =>
        convertEveMessage(msg, i, agent.data.messages.length, isRunning, imageStoreRef.current),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.data.messages, isRunning],
  );

  return useExternalStoreRuntime<ThreadMessageLike>({
    isRunning,
    messages,
    convertMessage: (msg) => msg,
    adapters: { attachments: attachmentAdapter },
    onNew: async (appendMessage) => {
      const parts: Exclude<UserContent, string> = [];

      // Composer text.
      for (const part of appendMessage.content) {
        if (part.type === "text" && part.text.trim()) {
          parts.push({ type: "text", text: part.text });
        }
      }

      // Attachment content (images + inlined text-like files).
      const attachments =
        (appendMessage.role === "user" && appendMessage.attachments) || [];

      // Capture image URLs before the composer state is cleared.
      const capturedImages: string[] = [];
      for (const attachment of attachments) {
        for (const part of attachment.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "image") {
            // eve rejects type:"image" — convert to type:"file" with the data URL
            const imageUrl =
              typeof part.image === "string" ? part.image : String(part.image);
            const mediaType = imageUrl.startsWith("data:")
              ? (imageUrl.split(";")[0]?.slice(5) ?? "image/png")
              : "image/png";
            parts.push({ type: "file", data: imageUrl, mediaType });
            capturedImages.push(imageUrl);
          } else if (part.type === "file") {
            parts.push({
              type: "file",
              data: part.data,
              mediaType: part.mimeType,
            });
          }
        }
      }

      if (capturedImages.length > 0) {
        imageStoreRef.current.set(agent.data.messages.length, capturedImages);
      }

      if (parts.length === 0) return;

      // Collapse a lone text part to a plain string (eve's simplest input form).
      const message: UserContent =
        parts.length === 1 && parts[0]!.type === "text"
          ? parts[0]!.text
          : parts;

      await agent.send({ message });
    },
    onCancel: async () => {
      agent.stop();
    },
  });
}
