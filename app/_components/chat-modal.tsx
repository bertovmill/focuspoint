"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AlertCircleIcon, Maximize2Icon, MinusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { type AgentStatus, StatusDot } from "@/app/_components/agent-chat";
import { CalendarToolUI } from "@/components/assistant-ui/calendar-tool-ui";
import { Thread } from "@/components/assistant-ui/thread";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useThreadAgent } from "@/hooks/use-thread-agent";
import { cn } from "@/lib/utils";

/** Fired by any "new chat" control; the Workspace listens and opens the modal. */
export const NEW_CHAT_EVENT = "cael:new-chat";

export function requestNewChat() {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
}

/** Remembered geometry of the floating window, so it reopens where it was left. */
const GEOMETRY_STORAGE_KEY = "focuspoint:chat-window";
const DEFAULT_WIDTH = 460;
const DEFAULT_HEIGHT = 620;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 320;
const VIEWPORT_MARGIN = 16;
/** How much of the window must stay on screen when dragged toward an edge. */
const KEEP_VISIBLE = 120;
const BUBBLE_SIZE = 56;

type Geometry = { x: number; y: number; w: number; h: number };

function readStoredGeometry(): Geometry | null {
  try {
    const raw = window.localStorage.getItem(GEOMETRY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Geometry>;
    if (
      typeof parsed?.x !== "number" ||
      typeof parsed?.y !== "number" ||
      typeof parsed?.w !== "number" ||
      typeof parsed?.h !== "number"
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}

/** Keeps a window inside the viewport: never wider/taller than it, never fully off. */
function clampGeometry(g: Geometry): Geometry {
  const maxW = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const maxH = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
  const w = Math.min(Math.max(g.w, MIN_WIDTH), maxW);
  const h = Math.min(Math.max(g.h, MIN_HEIGHT), maxH);
  const x = Math.min(Math.max(g.x, KEEP_VISIBLE - w), window.innerWidth - KEEP_VISIBLE);
  const y = Math.min(Math.max(g.y, 0), window.innerHeight - 48);
  return { x, y, w, h };
}

function defaultGeometry(): Geometry {
  const w = Math.min(DEFAULT_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const h = Math.min(DEFAULT_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
  return clampGeometry({
    x: window.innerWidth - w - VIEWPORT_MARGIN,
    y: window.innerHeight - h - VIEWPORT_MARGIN,
    w,
    h,
  });
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
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = agent.data.messages.length > 0;
  const hasMessagesRef = useRef(hasMessages);
  hasMessagesRef.current = hasMessages;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [collapsed, setCollapsed] = useState(false);
  // Assistant replies that landed while the window was collapsed, so the bubble
  // can say "there's something for you in here".
  const [unread, setUnread] = useState(0);
  const messageCount = agent.data.messages.length;
  const seenCountRef = useRef(messageCount);
  useEffect(() => {
    if (collapsed) {
      if (messageCount > seenCountRef.current) setUnread(messageCount - seenCountRef.current);
    } else {
      seenCountRef.current = messageCount;
      setUnread(0);
    }
  }, [collapsed, messageCount]);

  // Escape closes the chat — but only when the focus is actually inside it. The
  // window is non-modal now, so an Escape aimed at the app behind it isn't ours.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as Node | null;
      if (target && !panelRef.current?.contains(target)) return;
      e.stopPropagation();
      onCloseRef.current(hasMessagesRef.current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const header = (
    <ChatWindowHeader
      status={agent.status}
      onExpand={onExpand}
      onCollapse={isDesktop ? () => setCollapsed(true) : undefined}
      onClose={() => onClose(hasMessages)}
    />
  );

  const body = (
    <>
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
    </>
  );

  // Phones get the old centered sheet: there's no app to operate alongside it,
  // and a draggable window on a 390px viewport is all cost and no benefit.
  if (!isDesktop) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 pb-20 sm:items-center sm:p-8 sm:pb-20">
        <div
          className="chat-modal-backdrop absolute inset-0 bg-black/25"
          onClick={() => onClose(hasMessages)}
          aria-hidden
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Chat with Cael"
          className="chat-modal-panel relative flex h-[min(78dvh,620px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/75 shadow-2xl backdrop-blur-2xl [&_.aui-thread-root]:bg-transparent [&_.aui-thread-viewport-footer]:bg-transparent"
        >
          {header}
          {body}
        </div>
      </div>
    );
  }

  return (
    <FloatingChatWindow
      panelRef={panelRef}
      collapsed={collapsed}
      unread={unread}
      status={agent.status}
      onRestore={() => setCollapsed(false)}
      header={header}
    >
      {body}
    </FloatingChatWindow>
  );
}

/**
 * The desktop shell: a non-modal window that floats over the app. No backdrop, so
 * every click outside it still lands on whatever's underneath — the point of the
 * thing is talking to Cael *while* using the app.
 *
 * Position and size live in one `Geometry` state, clamped to the viewport and
 * mirrored to localStorage so the window reopens where it was left.
 */
function FloatingChatWindow({
  panelRef,
  collapsed,
  unread,
  status,
  onRestore,
  header,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  unread: number;
  status: AgentStatus;
  onRestore: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [interaction, setInteraction] = useState<"drag" | "resize" | null>(null);

  useLayoutEffect(() => {
    setGeometry(clampGeometry(readStoredGeometry() ?? defaultGeometry()));
  }, []);

  // A shrinking window (or a display swap) can leave the panel off-screen.
  useEffect(() => {
    const onResize = () => setGeometry((g) => (g ? clampGeometry(g) : g));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const persist = useCallback((g: Geometry) => {
    try {
      window.localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(g));
    } catch {
      // Private-mode storage failures shouldn't take the chat down with them.
    }
  }, []);

  /**
   * One pointer-capture loop for both gestures. `edge` is which resize handle was
   * grabbed; dragging from the left edge moves `x` as `w` grows, so the opposite
   * corner stays put.
   */
  const beginGesture = useCallback(
    (
      e: React.PointerEvent,
      mode: "drag" | "resize",
      edge: "left" | "right" = "right",
    ) => {
      if (e.button !== 0) return;
      const start = geometry;
      if (!start) return;
      e.preventDefault();
      const originX = e.clientX;
      const originY = e.clientY;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      setInteraction(mode);

      let latest = start;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - originX;
        const dy = ev.clientY - originY;
        const next =
          mode === "drag"
            ? { ...start, x: start.x + dx, y: start.y + dy }
            : edge === "right"
              ? { ...start, w: start.w + dx, h: start.h + dy }
              : {
                  ...start,
                  x: start.x + Math.min(dx, start.w - MIN_WIDTH),
                  w: start.w - dx,
                  h: start.h + dy,
                };
        latest = clampGeometry(next);
        setGeometry(latest);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        setInteraction(null);
        persist(latest);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [geometry, persist],
  );

  // Nothing to paint until the first layout effect has measured the viewport.
  if (!geometry) return null;

  if (collapsed) {
    const x = Math.min(Math.max(geometry.x, VIEWPORT_MARGIN), window.innerWidth - BUBBLE_SIZE - VIEWPORT_MARGIN);
    const y = Math.min(Math.max(geometry.y, VIEWPORT_MARGIN), window.innerHeight - BUBBLE_SIZE - VIEWPORT_MARGIN);
    return (
      <button
        type="button"
        onClick={onRestore}
        style={{ left: x, top: y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
        className="chat-modal-panel fixed z-[60] flex items-center justify-center rounded-full border border-border/60 bg-background/85 shadow-xl backdrop-blur-xl transition-transform hover:scale-105"
        aria-label={unread ? `Open chat with Cael (${unread} new)` : "Open chat with Cael"}
      >
        <CaelAvatar size={36} active={status === "submitted" || status === "streaming"} />
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chat with Cael"
      style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}
      className={cn(
        "chat-modal-panel fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/85 shadow-2xl backdrop-blur-2xl",
        "[&_.aui-thread-root]:bg-transparent [&_.aui-thread-viewport-footer]:bg-transparent",
        // A drag shouldn't leave a trail of selected message text behind it.
        interaction ? "select-none" : null,
      )}
    >
      <div
        onPointerDown={(e) => beginGesture(e, "drag")}
        className={cn("shrink-0 touch-none", interaction === "drag" ? "cursor-grabbing" : "cursor-grab")}
      >
        {header}
      </div>
      {children}

      {/* Corner resize handles — bottom two, so they never fight the header drag. */}
      <div
        onPointerDown={(e) => beginGesture(e, "resize", "right")}
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none"
        aria-hidden
      />
      <div
        onPointerDown={(e) => beginGesture(e, "resize", "left")}
        className="absolute bottom-0 left-0 size-4 cursor-nesw-resize touch-none"
        aria-hidden
      />
    </div>
  );
}

function ChatWindowHeader({
  status,
  onExpand,
  onCollapse,
  onClose,
}: {
  status: AgentStatus;
  onExpand: () => void;
  /** Absent on mobile, where there's no floating bubble to collapse into. */
  onCollapse?: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 pl-2 pr-1.5">
      <span className="flex min-w-0 items-center gap-1">
        <CaelAvatar size={32} active={status === "submitted" || status === "streaming"} />
        <span className="truncate text-muted-foreground text-sm">Cael</span>
        <StatusDot status={status} />
      </span>
      <span className="flex items-center gap-0.5">
        <TooltipProvider>
          {onCollapse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCollapse}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Collapse chat"
                >
                  <MinusIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Collapse</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onExpand}
                onPointerDown={(e) => e.stopPropagation()}
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
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Close chat"
        >
          <XIcon className="size-4" />
        </button>
      </span>
    </header>
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
