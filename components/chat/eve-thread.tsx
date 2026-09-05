"use client";

import type { FileUIPart } from "ai";
import type {
  EveDynamicToolPart,
  EveMessage,
  EveMessageData,
  EveMessagePart,
  UseEveAgentHelpers,
} from "eve/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, KeyRoundIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { CalendarTool, type CalendarResult } from "@/components/chat/calendar-tool";
import { cn } from "@/lib/utils";

/**
 * Cael's conversation view, built on Vercel AI Elements and fed straight from
 * eve's message projection (`agent.data.messages`), which already follows the
 * AI SDK `parts[]` convention AI Elements renders. No runtime adapter in between.
 */

export type EveAgent = UseEveAgentHelpers<EveMessageData>;

/** A file the composer sent, kept client-side so the bubble can show a preview. */
export type SentFile = FileUIPart & { id: string };

// Static welcome prompts for Cael. The eve runtime provides no dynamic
// suggestions, so the empty state shows these ready-to-send starters.
const WELCOME_SUGGESTIONS = [
  "What's on my plate today?",
  "What did I say I wanted to focus on?",
  "Summarize my recent thoughts",
  "What's on my calendar today?",
] as const;

// eve's summarizeUserContent appends [file: ...] and [image: ...] markers to
// user message text. Strip them so they don't leak into the rendered bubble.
function stripEveAttachmentMarkers(text: string): string {
  return text.replace(/\n?\[file:[^\]]*\]/g, "").replace(/\n?\[image:[^\]]*\]/g, "").trim();
}

function textOf(message: EveMessage): string {
  return message.parts
    .filter((p): p is Extract<EveMessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

/** Anything the reader would see: text, a tool card, an authorization prompt. */
function hasVisibleContent(message: EveMessage): boolean {
  return message.parts.some(
    (p) =>
      (p.type === "text" && p.text.length > 0) ||
      (p.type === "reasoning" && p.text.length > 0) ||
      p.type === "dynamic-tool" ||
      p.type === "authorization",
  );
}

function humanizeToolName(name: string): string {
  return name.replace(/[_-]+/g, " ");
}

function isToolRunning(state: EveDynamicToolPart["state"]): boolean {
  return state === "input-streaming" || state === "input-available";
}

export function EveThread({
  agent,
  sentFiles,
  welcome,
}: {
  agent: EveAgent;
  /** Message index → files the composer attached, for previews after send. */
  sentFiles: ReadonlyMap<number, readonly SentFile[]>;
  welcome: React.ReactNode;
}) {
  const messages = agent.data.messages;
  const isRunning = agent.status === "submitted" || agent.status === "streaming";
  const last = messages.at(-1);
  // Cael has been asked and hasn't put anything on screen yet.
  const waiting =
    isRunning && (last?.role !== "assistant" || !hasVisibleContent(last));

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
        {welcome}
        <Suggestions className="justify-center">
          {WELCOME_SUGGESTIONS.map((prompt) => (
            <Suggestion
              key={prompt}
              suggestion={prompt}
              onClick={(text) => void agent.send(text)}
            />
          ))}
        </Suggestions>
      </div>
    );
  }

  return (
    <Conversation className="h-full">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 pt-4 pb-6">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <UserMessage
              key={message.id}
              message={message}
              files={sentFiles.get(index)}
            />
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
              isStreaming={isRunning && index === messages.length - 1}
            />
          ),
        )}
        {waiting ? (
          <Message from="assistant">
            <MessageContent>
              <Shimmer as="p" className="text-sm" duration={1.4}>
                Cael is thinking…
              </Shimmer>
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function UserMessage({
  message,
  files,
}: {
  message: EveMessage;
  files: readonly SentFile[] | undefined;
}) {
  const text = stripEveAttachmentMarkers(textOf(message));
  // Files eve echoed back carry a URL only when it kept one; the composer's
  // own copies (data URLs) are the reliable preview source for this session.
  const echoed = message.parts
    .filter((p): p is Extract<EveMessagePart, { type: "file" }> => p.type === "file" && !!p.url)
    .map((p, i) => ({ ...p, id: `echo-${message.id}-${i}` }) as SentFile);
  const shown = files && files.length > 0 ? files : echoed;

  return (
    <Message from="user">
      {shown.length > 0 ? (
        <Attachments variant="grid" className="ml-auto">
          {shown.map((file) => (
            <Attachment key={file.id} data={file}>
              <AttachmentPreview />
            </Attachment>
          ))}
        </Attachments>
      ) : null}
      {text ? (
        <MessageContent className="whitespace-pre-wrap text-base leading-relaxed">
          {text}
        </MessageContent>
      ) : null}
    </Message>
  );
}

function AssistantMessage({
  message,
  isLast,
  isStreaming,
}: {
  message: EveMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const reasoning = message.parts.filter(
    (p): p is Extract<EveMessagePart, { type: "reasoning" }> => p.type === "reasoning",
  );
  const reasoningText = reasoning.map((p) => p.text).join("\n\n");
  const lastPart = message.parts.at(-1);
  const reasoningStreaming = isStreaming && lastPart?.type === "reasoning";
  const complete = message.metadata?.status === "complete" || !isStreaming;
  const plain = textOf(message);

  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full max-w-full">
        {reasoningText ? (
          <Reasoning className="w-full" isStreaming={reasoningStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        ) : null}
        {message.parts.map((part, i) => {
          switch (part.type) {
            case "text":
              return part.text ? (
                <MessageResponse
                  key={`${message.id}-${i}`}
                  className="text-base leading-relaxed"
                >
                  {part.text}
                </MessageResponse>
              ) : null;
            case "dynamic-tool":
              return <ToolPart key={part.toolCallId} part={part} />;
            case "authorization":
              return (
                <AuthorizationCard key={`${message.id}-auth-${i}`} part={part} />
              );
            default:
              return null;
          }
        })}
      </MessageContent>
      {complete && plain ? <CopyAction text={plain} alwaysVisible={isLast} /> : null}
    </Message>
  );
}

function CopyAction({ text, alwaysVisible }: { text: string; alwaysVisible: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <MessageActions
      className={cn(
        "-mt-1 transition-opacity",
        alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <MessageAction tooltip={copied ? "Copied" : "Copy"} label="Copy reply" onClick={copy}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </MessageAction>
    </MessageActions>
  );
}

function ToolPart({ part }: { part: EveDynamicToolPart }) {
  const running = isToolRunning(part.state);

  if (part.toolName === "list_calendar_events") {
    const result =
      part.state === "output-available" ? (part.output as CalendarResult) : undefined;
    return <CalendarTool running={running} result={result} />;
  }

  const output =
    part.state === "output-available"
      ? part.output
      : undefined;
  const errorText = part.state === "output-error" ? part.errorText : undefined;

  return (
    <Tool defaultOpen={part.state === "output-error"} className="my-1 w-full max-w-md">
      <ToolHeader
        type="dynamic-tool"
        state={part.state}
        toolName={part.toolName}
        title={humanizeToolName(part.toolName)}
        className="py-2.5"
      />
      <ToolContent>
        {part.state !== "input-streaming" ? <ToolInput input={part.input} /> : null}
        {output !== undefined || errorText ? (
          <ToolOutput output={<ToolResult value={output} />} errorText={errorText} />
        ) : null}
      </ToolContent>
    </Tool>
  );
}

function ToolResult({ value }: { value: unknown }) {
  if (value === undefined) return null;
  if (typeof value === "string") {
    return <MessageResponse className="text-sm">{value}</MessageResponse>;
  }
  return <CodeBlock code={JSON.stringify(value, null, 2)} language="json" />;
}

function AuthorizationCard({
  part,
}: {
  part: Extract<EveMessagePart, { type: "authorization" }>;
}) {
  const done = part.state === "completed";
  return (
    <div className="my-1 flex w-full max-w-md items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-sm">
      <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {done ? `${part.displayName} connected` : `${part.displayName} needs your sign-in`}
        </p>
        {!done && part.authorization?.instructions ? (
          <p className="mt-0.5 text-muted-foreground">{part.authorization.instructions}</p>
        ) : null}
        {!done && part.authorization?.userCode ? (
          <p className="mt-1 font-mono text-xs">{part.authorization.userCode}</p>
        ) : null}
        {!done && part.authorization?.url ? (
          <a
            href={part.authorization.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            Open sign-in <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
        {done && part.reason ? (
          <p className="mt-0.5 text-muted-foreground">{part.reason}</p>
        ) : null}
      </div>
    </div>
  );
}
