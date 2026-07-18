"use client";

import { useEveAgent } from "eve/react";
import { useEffect } from "react";
import { deriveTitle, useThreads } from "@/app/_components/threads-provider";

/**
 * Wires a persisted thread to a live eve agent: restores the saved snapshot,
 * saves a new snapshot when a turn finishes, and derives the sidebar title
 * from the first user message.
 */
export function useThreadAgent(threadId: string) {
  const { getThread, saveSnapshot, rename } = useThreads();
  const thread = getThread(threadId);

  const agent = useEveAgent({
    initialSession: thread?.session,
    initialEvents: thread?.events,
    onFinish: (snapshot) => {
      const firstUser = snapshot.data.messages.find((m) => m.role === "user");
      const textPart = firstUser?.parts.find((p) => p.type === "text");
      saveSnapshot(threadId, {
        session: snapshot.session,
        events: snapshot.events,
        firstUserText:
          textPart && "text" in textPart ? textPart.text : undefined,
      });
    },
  });

  // Set the sidebar title as soon as the first user message appears (optimistic,
  // happens instantly on send) rather than waiting for onFinish after the full response.
  useEffect(() => {
    if (thread?.title) return;
    const firstUser = agent.data.messages.find((m) => m.role === "user");
    const textPart = firstUser?.parts.find((p) => p.type === "text");
    if (textPart && "text" in textPart && textPart.text) {
      rename(threadId, deriveTitle(textPart.text));
    }
  }, [agent.data.messages, thread?.title, threadId, rename]);

  return agent;
}
