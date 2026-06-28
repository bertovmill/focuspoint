"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";

export function ThinkingMessage() {
  return (
    <Message from="assistant" aria-label="Agent is thinking">
      <MessageContent>
        <div className="flex items-center gap-1 py-0.5">
          <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]" />
          <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]" />
          <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce" />
        </div>
      </MessageContent>
    </Message>
  );
}
