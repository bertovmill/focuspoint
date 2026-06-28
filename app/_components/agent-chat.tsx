"use client";

import { useEveAgent } from "eve/react";
import { AlertCircleIcon, DatabaseIcon, PanelLeftIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ChatSidebar } from "@/app/_components/chat-sidebar";
import { deriveTitle, useThreads } from "@/app/_components/threads-provider";
import { CalendarToolUI } from "@/components/assistant-ui/calendar-tool-ui";
import { Thread } from "@/components/assistant-ui/thread";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { cn } from "@/lib/utils";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentChat({
  hasMobileNav,
  threadId,
}: {
  hasMobileNav?: boolean;
  threadId: string;
}) {
  const { getThread, saveSnapshot, rename } = useThreads();
  const thread = getThread(threadId);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const runtime = useEveRuntime(agent);

  return (
    <main
      className={cn(
        "relative flex h-dvh flex-col overflow-hidden bg-background text-foreground",
        hasMobileNav && "pb-16 lg:pb-0",
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
          <CaelAvatar size={40} active={agent.status === "submitted" || agent.status === "streaming"} />
          <span className="truncate text-muted-foreground text-sm">Cael</span>
          <StatusDot status={agent.status} />
        </span>
        <Link
          href="/explore"
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Database Explorer"
        >
          <DatabaseIcon className="size-4" />
        </Link>
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
          <div className="relative flex w-72 max-w-[80%] flex-col overflow-y-auto border-r border-border bg-background">
            <div className="flex h-14 shrink-0 items-center justify-between px-3 border-b border-border">
              <span className="text-muted-foreground text-sm">Chats</span>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Close chat history"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <ChatSidebar onNavigate={() => setHistoryOpen(false)} />
          </div>
        </div>
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
    <div className="flex flex-col items-center gap-3 px-4 text-center mb-6">
      <h1 className="font-medium text-4xl tracking-tighter">
        {greeting}, Berto.
      </h1>
      <p className="text-muted-foreground text-sm">{today}</p>
      <p className="text-muted-foreground">What would you like to do today?</p>
    </div>
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
