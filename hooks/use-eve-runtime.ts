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
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { UserContent } from "ai";
import { useMemo } from "react";

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

function convertEvePart(part: EveMessagePart): ContentPart | null {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
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
): ThreadMessageLike {
  const isLast = index === total - 1;
  const isStreaming = isLast && isRunning && message.role === "assistant";

  const parts = message.parts
    .map(convertEvePart)
    .filter((p): p is ContentPart => p !== null);

  return {
    id: message.id,
    role: message.role,
    content: parts.length > 0 ? parts : [{ type: "text", text: "" }],
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

  const messages = useMemo(
    () =>
      agent.data.messages.map((msg, i) =>
        convertEveMessage(msg, i, agent.data.messages.length, isRunning),
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
      for (const attachment of attachments) {
        for (const part of attachment.content) {
          if (part.type === "text") {
            parts.push({ type: "text", text: part.text });
          } else if (part.type === "image") {
            parts.push({ type: "image", image: part.image });
          } else if (part.type === "file") {
            parts.push({
              type: "file",
              data: part.data,
              mediaType: part.mimeType,
            });
          }
        }
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
