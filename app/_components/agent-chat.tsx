"use client";

import { useEveAgent, type EveMessagePart } from "eve/react";
import { ActivityIcon, AlertCircleIcon, DatabaseIcon, HistoryIcon, InfoIcon, PanelLeftIcon, PlusIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ChatSidebar } from "@/app/_components/chat-sidebar";
import { requestNewChat } from "@/app/_components/chat-modal";
import { TracePanel } from "@/app/_components/trace-panel";
import { CalendarToolUI } from "@/components/assistant-ui/calendar-tool-ui";
import { Thread } from "@/components/assistant-ui/thread";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { useThreadAgent } from "@/hooks/use-thread-agent";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { PinButton } from "@/app/_components/pin-button";
import { cn } from "@/lib/utils";

export type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentChat({
  hasMobileNav,
  threadId,
  sidebarOpen,
  onToggleSidebar,
  chatSidebarOpen,
  onToggleChatSidebar,
  initialMessage,
  onInitialMessageSent,
}: {
  hasMobileNav?: boolean;
  threadId: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSidebarOpen?: boolean;
  onToggleChatSidebar?: () => void;
  initialMessage?: string;
  onInitialMessageSent?: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  const agent = useThreadAgent(threadId);

  // Auto-send initialMessage once on mount (used by "Run now" in Scheduled Tasks).
  const hasSentInitial = useRef(false);
  const agentSendRef = useRef(agent.send);
  agentSendRef.current = agent.send;
  const onInitialMessageSentRef = useRef(onInitialMessageSent);
  onInitialMessageSentRef.current = onInitialMessageSent;

  useEffect(() => {
    if (!initialMessage || hasSentInitial.current) return;
    hasSentInitial.current = true;
    // Brief delay lets the eve transport initialize before the first send.
    const timer = setTimeout(() => {
      agentSendRef.current({ message: initialMessage });
      onInitialMessageSentRef.current?.();
    }, 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runtime = useEveRuntime(agent);

  const lastMsg = agent.data.messages.at(-1);
  const stoppedAfterTools =
    agent.status === "ready" &&
    !agent.error &&
    lastMsg?.role === "assistant" &&
    lastMsg.parts.some((p: EveMessagePart) => p.type === "dynamic-tool") &&
    !lastMsg.parts.some((p: EveMessagePart) => p.type === "text" && "text" in p && (p as { text: string }).text.trim());

  return (
    <main
      className={cn(
        "relative flex h-dvh flex-col overflow-hidden bg-background text-foreground",
        hasMobileNav && "pb-[var(--mobile-nav-h)] lg:pb-0",
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between pl-2 pr-3 border-b border-border">
        <span className="flex min-w-0 items-center gap-1">
          <button
            onClick={() => setHistoryOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground lg:hidden"
            title="Chat history"
            aria-label="Chat history"
          >
            <PanelLeftIcon className="size-4" />
          </button>
          {!sidebarOpen && onToggleSidebar && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleSidebar}
                    className="hidden lg:flex p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Open sidebar"
                  >
                    <PanelLeftIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open sidebar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!chatSidebarOpen && onToggleChatSidebar && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleChatSidebar}
                    className="hidden lg:flex p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Show chat history"
                  >
                    <HistoryIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Show chat history</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <CaelAvatar size={40} active={agent.status === "submitted" || agent.status === "streaming"} />
          <span className="truncate text-muted-foreground text-sm">Cael</span>
          <StatusDot status={agent.status} />
        </span>
        <span className="flex items-center gap-1">
          <PinButton className="p-2" />
          <button
            onClick={() => setTraceOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Agent trace"
            aria-label="Agent trace"
          >
            <ActivityIcon className="size-4" />
          </button>
          <Link
            href="/explore"
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Database Explorer"
          >
            <DatabaseIcon className="size-4" />
          </Link>
        </span>
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

      {stoppedAfterTools ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">Stopped after tool calls</p>
              <p className="mt-0.5 text-muted-foreground">Cael ran tools but didn&apos;t reply. Check Vercel logs for <code className="text-xs bg-muted px-1 rounded">[audit] step.completed</code> → <code className="text-xs bg-muted px-1 rounded">finishReason</code>. You can ask Cael to continue.</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AssistantRuntimeProvider runtime={runtime}>
          {/* Registers the in-chat calendar widget for list_calendar_events. */}
          <CalendarToolUI />
          <Thread components={{ Welcome: PersonalizedWelcome }} />
        </AssistantRuntimeProvider>
      </div>

      {/* Mobile chat-history overlay */}
      {historyOpen ? (
        <div className="absolute inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="relative flex w-72 max-w-[80%] flex-col border-r border-border bg-background">
            <div className="flex h-14 shrink-0 items-center justify-between px-3 border-b border-border">
              <span className="text-muted-foreground text-sm">Chats</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    requestNewChat();
                    setHistoryOpen(false);
                  }}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="New chat"
                >
                  <PlusIcon className="size-4" />
                </button>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Close chat history"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            </div>
            <ChatSidebar className="flex-1" onNavigate={() => setHistoryOpen(false)} />
          </div>
        </div>
      ) : null}

      {traceOpen ? (
        <TracePanel events={agent.events} onClose={() => setTraceOpen(false)} />
      ) : null}
    </main>
  );
}

function PersonalizedWelcome() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center mb-6">
      <h1 className="font-semibold text-4xl tracking-tighter text-foreground">
        {greeting}, Berto.
      </h1>
      <p className="text-muted-foreground text-sm">{today}</p>
      <p className="text-muted-foreground text-sm mt-1">What would you like to do today?</p>
    </div>
  );
}

export function StatusDot({ status }: { readonly status: AgentStatus }) {
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
