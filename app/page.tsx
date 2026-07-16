"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircleIcon, ListTodoIcon, FileTextIcon, BrainIcon, ImageIcon, PanelLeftCloseIcon, CalendarClockIcon, ListChecksIcon, BookOpenIcon, GaugeIcon, TelescopeIcon, MoreHorizontalIcon, HomeIcon } from "lucide-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { ChatSidebar } from "@/app/_components/chat-sidebar";
import { Dashboard } from "@/app/_components/dashboard";
import { HomeScreen, type HomeTarget } from "@/app/_components/home-screen";
import { PIN_EVENT } from "@/app/_components/pin-button";
import { PinView } from "@/app/_components/pin-view";
import { ThreadsProvider, useThreads } from "@/app/_components/threads-provider";
import { setNativePinMode } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MobileTab = "home" | "chat" | "tasks" | "notes" | "lists" | "journal-templates" | "dreams" | "schedule" | "media" | "measures" | "vision";

const MORE_TABS: { tab: MobileTab; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon },
  { tab: "dreams", label: "Dreams", icon: BrainIcon },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon },
  { tab: "media", label: "Media", icon: ImageIcon },
  { tab: "measures", label: "Measures", icon: GaugeIcon },
  { tab: "vision", label: "Vision", icon: TelescopeIcon },
];

export default function Page() {
  return (
    <ThreadsProvider>
      <Workspace />
    </ThreadsProvider>
  );
}

function Workspace() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const [focusNewTaskSignal, setFocusNewTaskSignal] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { hydrated, activeId, newThread } = useThreads();

  // Pin mode (desktop app): a PinButton anywhere in the UI fires PIN_EVENT.
  useEffect(() => {
    const onPin = () => {
      setPinned(true);
      setNativePinMode(true);
    };
    window.addEventListener(PIN_EVENT, onPin);
    return () => window.removeEventListener(PIN_EVENT, onPin);
  }, []);

  const handleUnpin = useCallback(() => {
    setPinned(false);
    setNativePinMode(false);
  }, []);

  // Global shortcuts: T opens Tasks, N opens Tasks and focuses the new-task input,
  // C starts a new chat.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (pinned) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === "t") {
        e.preventDefault();
        setMobileTab("tasks");
      } else if (key === "n") {
        e.preventDefault();
        setMobileTab("tasks");
        setFocusNewTaskSignal((n) => n + 1);
      } else if (key === "c") {
        e.preventDefault();
        newThread();
        setMobileTab("chat");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newThread, pinned]);

  const handleRunJobWithChat = useCallback((message: string) => {
    newThread();
    setPendingMessage(message);
    setMobileTab("chat");
  }, [newThread]);

  if (pinned) {
    return <PinView onUnpin={handleUnpin} />;
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Dashboard panel — sidebar when chat is active, takes over the full main view otherwise */}
      <aside
        className={cn(
          "shrink-0 flex-col border-r border-border overflow-hidden",
          mobileTab === "home"
            ? "hidden"
            : mobileTab !== "chat"
              ? "flex flex-1"
              : cn(
                  "hidden lg:flex lg:flex-none lg:transition-[width] lg:duration-300 lg:ease-in-out",
                  sidebarOpen ? "lg:w-[380px] xl:w-[420px]" : "lg:w-0",
                ),
        )}
      >
        {/* Inner wrapper keeps a fixed width so content doesn't reflow during animation, only when acting as a sidebar */}
        <div className={cn("flex flex-col flex-1 h-full", mobileTab === "chat" && "lg:w-[380px] xl:w-[420px] lg:shrink-0")}>
          <Dashboard
            activeTab={mobileTab === "notes" ? "notes" : mobileTab === "lists" ? "lists" : mobileTab === "journal-templates" ? "journal-templates" : mobileTab === "dreams" ? "dreams" : mobileTab === "media" ? "media" : mobileTab === "schedule" ? "schedule" : mobileTab === "measures" ? "measures" : mobileTab === "vision" ? "vision" : "todos"}
            onCollapse={() => setSidebarOpen(false)}
            onRunJobWithChat={handleRunJobWithChat}
            onTabChange={(tab) => setMobileTab(tab === "todos" ? "tasks" : tab)}
            isExpanded={mobileTab !== "chat"}
            onBackToChat={() => setMobileTab("chat")}
            focusNewTaskSignal={focusNewTaskSignal}
          />
        </div>
      </aside>

      {/* Home screen — the vision-first landing view */}
      {mobileTab === "home" && (
        <HomeScreen onNavigate={(tab: HomeTarget) => setMobileTab(tab)} />
      )}

      {/* Chat panel — shown only when the chat tab is active, on both mobile and desktop */}
      <div
        className={cn(
          "min-w-0 flex-row",
          mobileTab === "chat" ? "flex flex-1" : "hidden",
        )}
      >
        {/* Desktop chat-history rail */}
        <div
          className={cn(
            "hidden shrink-0 flex-col border-r border-border overflow-hidden",
            "lg:flex lg:flex-none lg:transition-[width] lg:duration-300 lg:ease-in-out",
            chatSidebarOpen ? "lg:w-64" : "lg:w-0",
          )}
        >
          {/* Fixed-width inner so content doesn't reflow during animation */}
          <div className="w-64 h-full shrink-0 relative">
            <ChatSidebar className="h-full" />
            <button
              onClick={() => setChatSidebarOpen(false)}
              className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Hide chat history"
            >
              <PanelLeftCloseIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {hydrated && activeId ? (
            <AgentChat
              key={activeId}
              threadId={activeId}
              hasMobileNav
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              chatSidebarOpen={chatSidebarOpen}
              onToggleChatSidebar={() => setChatSidebarOpen((v) => !v)}
              initialMessage={pendingMessage}
              onInitialMessageSent={() => setPendingMessage(undefined)}
            />
          ) : null}
        </div>
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="fixed bottom-0 inset-x-0 h-16 lg:hidden flex items-center border-t border-border bg-background/95 backdrop-blur-sm z-50">
        <NavButton
          label="Home"
          icon={<HomeIcon className="size-5" />}
          active={mobileTab === "home"}
          onClick={() => setMobileTab("home")}
        />
        <NavButton
          label="Chat"
          icon={<MessageCircleIcon className="size-5" />}
          active={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
        />
        <NavButton
          label="Tasks"
          icon={<ListTodoIcon className="size-5" />}
          active={mobileTab === "tasks"}
          onClick={() => setMobileTab("tasks")}
        />
        <NavButton
          label="Notes"
          icon={<FileTextIcon className="size-5" />}
          active={mobileTab === "notes"}
          onClick={() => setMobileTab("notes")}
        />
        <NavButton
          label="Lists"
          icon={<ListChecksIcon className="size-5" />}
          active={mobileTab === "lists"}
          onClick={() => setMobileTab("lists")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 h-full transition-colors",
                MORE_TABS.some((t) => t.tab === mobileTab) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <MoreHorizontalIcon className="size-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2">
            {MORE_TABS.map(({ tab, label, icon: Icon }) => (
              <DropdownMenuItem
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={cn(mobileTab === tab && "text-primary")}
              >
                <Icon className="size-4" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </main>
  );
}

function NavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 h-full transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
