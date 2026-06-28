"use client";

import {
  type EveMessage,
  type EveMessageData,
  type EveMessagePart,
  type UseEveAgentHelpers,
} from "eve/react";
import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useMemo } from "react";

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
    status: isStreaming
      ? { type: "running" }
      : { type: "complete", reason: "stop" },
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
    onNew: async (appendMessage) => {
      const textPart = appendMessage.content.find((p) => p.type === "text");
      const text = textPart?.type === "text" ? textPart.text.trim() : "";
      if (text) await agent.send({ message: text });
    },
    onCancel: async () => {
      agent.stop();
    },
  });
}
