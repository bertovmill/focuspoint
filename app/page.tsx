"use client";

import { useCallback, useState } from "react";
import { MessageCircleIcon, ListTodoIcon, FileTextIcon, BrainIcon, ImageIcon, PanelLeftCloseIcon, CalendarClockIcon, ListChecksIcon, BookOpenIcon } from "lucide-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { ChatSidebar } from "@/app/_components/chat-sidebar";
import { Dashboard } from "@/app/_components/dashboard";
import { ThreadsProvider, useThreads } from "@/app/_components/threads-provider";
import { cn } from "@/lib/utils";

type MobileTab = "chat" | "tasks" | "notes" | "lists" | "journal-templates" | "dreams" | "schedule" | "media";

export default function Page() {
  return (
    <ThreadsProvider>
      <Workspace />
    </ThreadsProvider>
  );
}

function Workspace() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const { hydrated, activeId, newThread } = useThreads();

  const handleRunJobWithChat = useCallback((message: string) => {
    newThread();
    setPendingMessage(message);
    setMobileTab("chat");
  }, [newThread]);

  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Dashboard panel — sidebar on desktop, full-screen on mobile for tasks/notes */}
      <aside
        className={cn(
          "shrink-0 flex-col border-r border-border overflow-hidden",
          mobileTab !== "chat" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-none lg:transition-[width] lg:duration-300 lg:ease-in-out",
          sidebarOpen ? "lg:w-[380px] xl:w-[420px]" : "lg:w-0",
        )}
      >
        {/* Inner wrapper keeps a fixed width so content doesn't reflow during animation */}
        <div className="flex flex-col flex-1 h-full lg:w-[380px] xl:w-[420px] lg:shrink-0">
          <Dashboard
            activeTab={mobileTab === "notes" ? "notes" : mobileTab === "lists" ? "lists" : mobileTab === "journal-templates" ? "journal-templates" : mobileTab === "dreams" ? "dreams" : mobileTab === "media" ? "media" : mobileTab === "schedule" ? "schedule" : "todos"}
            onCollapse={() => setSidebarOpen(false)}
            onRunJobWithChat={handleRunJobWithChat}
          />
        </div>
      </aside>

      {/* Chat panel — full width on mobile (when chat tab active), remainder on desktop */}
      <div
        className={cn(
          "min-w-0 flex-row",
          mobileTab === "chat" ? "flex flex-1" : "hidden",
          "lg:flex lg:flex-1",
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
        <NavButton
          label="Journal"
          icon={<BookOpenIcon className="size-5" />}
          active={mobileTab === "journal-templates"}
          onClick={() => setMobileTab("journal-templates")}
        />
        <NavButton
          label="Dreams"
          icon={<BrainIcon className="size-5" />}
          active={mobileTab === "dreams"}
          onClick={() => setMobileTab("dreams")}
        />
        <NavButton
          label="Schedule"
          icon={<CalendarClockIcon className="size-5" />}
          active={mobileTab === "schedule"}
          onClick={() => setMobileTab("schedule")}
        />
        <NavButton
          label="Media"
          icon={<ImageIcon className="size-5" />}
          active={mobileTab === "media"}
          onClick={() => setMobileTab("media")}
        />
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
