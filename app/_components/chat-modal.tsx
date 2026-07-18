"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AlertCircleIcon, Maximize2Icon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { StatusDot } from "@/app/_components/agent-chat";
import { CalendarToolUI } from "@/components/assistant-ui/calendar-tool-ui";
import { Thread } from "@/components/assistant-ui/thread";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { useThreadAgent } from "@/hooks/use-thread-agent";

/** Fired by any "new chat" control; the Workspace listens and opens the modal. */
export const NEW_CHAT_EVENT = "cael:new-chat";

export function requestNewChat() {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
}

export function ChatModal({
  threadId,
  onClose,
  onExpand,
}: {
  threadId: string;
  /** `hasMessages` is false when the chat is dismissed without sending anything. */
  onClose: (hasMessages: boolean) => void;
  onExpand: () => void;
}) {
  const agent = useThreadAgent(threadId);
  const runtime = useEveRuntime(agent);

  const hasMessages = agent.data.messages.length > 0;
  const hasMessagesRef = useRef(hasMessages);
  hasMessagesRef.current = hasMessages;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current(hasMessagesRef.current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 pb-20 sm:items-center sm:p-8 sm:pb-20 lg:pb-8">
      <div
        className="chat-modal-backdrop absolute inset-0 bg-black/25"
        onClick={() => onClose(hasMessages)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chat with Cael"
        className="chat-modal-panel relative flex h-[min(78dvh,620px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/75 shadow-2xl backdrop-blur-2xl [&_.aui-thread-root]:bg-transparent [&_.aui-thread-viewport-footer]:bg-transparent"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 pl-2 pr-1.5">
          <span className="flex min-w-0 items-center gap-1">
            <CaelAvatar size={32} active={agent.status === "submitted" || agent.status === "streaming"} />
            <span className="truncate text-muted-foreground text-sm">Cael</span>
            <StatusDot status={agent.status} />
          </span>
          <span className="flex items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onExpand}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Open full chat"
                  >
                    <Maximize2Icon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open full chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => onClose(hasMessages)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close chat"
            >
              <XIcon className="size-4" />
            </button>
          </span>
        </header>

        {agent.error ? (
          <div className="shrink-0 px-4 pt-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-muted-foreground">{agent.error.message}</p>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AssistantRuntimeProvider runtime={runtime}>
            {/* Registers the in-chat calendar widget for list_calendar_events. */}
            <CalendarToolUI />
            <Thread components={{ Welcome: ModalWelcome }} />
          </AssistantRuntimeProvider>
        </div>
      </div>
    </div>
  );
}

function ModalWelcome() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mb-6 flex flex-col items-center gap-1 px-4 text-center">
      <h2 className="font-semibold text-2xl tracking-tighter text-foreground">
        {greeting}, Berto.
      </h2>
      <p className="text-muted-foreground text-sm">What&apos;s on your mind?</p>
    </div>
  );
}
