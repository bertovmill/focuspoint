"use client";

import { useEveAgent } from "eve/react";
import { AlertCircleIcon, DatabaseIcon } from "lucide-react";
import Link from "next/link";
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestions";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";

const QUICK_SUGGESTIONS = [
  "Capture a thought",
  "What's on my todo list?",
  "Add a reminder for later",
  "What did I think about recently?",
];

const AGENT_NAME = "focuspoint-agent";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentChat({ hasMobileNav }: { hasMobileNav?: boolean }) {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isBusy) return;
    await agent.send({ message: text });
  };

  const handleSuggestion = async (text: string) => {
    if (isBusy) return;
    await agent.send({ message: text });
  };

  const composer = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputTextarea placeholder="Send a message…" />
      <PromptInputSubmit onStop={agent.stop} status={agent.status} />
    </PromptInput>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between pl-4 pr-3 border-b border-border">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-muted-foreground text-sm">{AGENT_NAME}</span>
          <StatusDot status={agent.status} />
        </span>
        <div className="flex items-center gap-1">
          {!isEmpty && (
            <ConversationDownload
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              messages={agent.data.messages as any}
              filename="focuspoint-conversation.md"
              className="static translate-x-0 size-8 rounded-lg"
              title="Download conversation"
            />
          )}
          <Link
            href="/explore"
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Database Explorer"
          >
            <DatabaseIcon className="size-4" />
          </Link>
        </div>
      </header>

      {agent.error ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="mt-0.5 text-muted-foreground">{agent.error.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {isEmpty ? null : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
            {agent.data.messages.map((message, index) => (
              <AgentMessage
                canRespond={!isBusy}
                isStreaming={
                  agent.status === "streaming" && index === agent.data.messages.length - 1
                }
                key={message.id}
                message={message}
                onInputResponses={(inputResponses) => agent.send({ inputResponses })}
              />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]"
            : cn("max-w-3xl shrink-0", hasMobileNav ? "pb-20 lg:pb-6" : "pb-6"),
        )}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="font-medium text-5xl tracking-tighter">{AGENT_NAME}</h1>
            <Suggestions>
              {QUICK_SUGGESTIONS.map((text) => (
                <Suggestion key={text} text={text} onSelect={handleSuggestion} />
              ))}
            </Suggestions>
          </div>
        ) : null}
        <div className="w-full">{composer}</div>
      </div>
    </main>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-emerald-500"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/50";

  return (
    <span className="relative flex size-1">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1 rounded-full transition-colors", tone)} />
    </span>
  );
}
