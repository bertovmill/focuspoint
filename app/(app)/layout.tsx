"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircleIcon, ListTodoIcon, FileTextIcon, BrainIcon, BrushIcon, ImageIcon, PanelLeftCloseIcon, PanelLeftIcon, CalendarClockIcon, CalendarDaysIcon, ListChecksIcon, BookOpenIcon, GaugeIcon, TelescopeIcon, MoreHorizontalIcon, HomeIcon } from "lucide-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { ChatModal, NEW_CHAT_EVENT } from "@/app/_components/chat-modal";
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

type MobileTab = "home" | "chat" | "tasks" | "notes" | "lists" | "calendar" | "journal-templates" | "dreams" | "schedule" | "media" | "sketches" | "measures" | "vision";

// Every section is a real URL. The shell below lives in this layout (not in the
// page files) so it survives navigation between sections — the tab is derived
// from the pathname and switching tabs is a router.push.
const TAB_PATHS: Record<MobileTab, string> = {
  home: "/",
  chat: "/chat",
  tasks: "/tasks",
  notes: "/notes",
  lists: "/lists",
  calendar: "/calendar",
  "journal-templates": "/journal",
  dreams: "/dreams",
  schedule: "/schedule",
  media: "/media",
  sketches: "/sketches",
  measures: "/measures",
  vision: "/vision",
};

const PATH_TABS = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as MobileTab]),
) as Record<string, MobileTab>;

const MORE_TABS: { tab: MobileTab; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "calendar", label: "Calendar", icon: CalendarDaysIcon },
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon },
  { tab: "dreams", label: "Dreams", icon: BrainIcon },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon },
  { tab: "media", label: "Media", icon: ImageIcon },
  { tab: "sketches", label: "Sketches", icon: BrushIcon },
  { tab: "measures", label: "Measures", icon: GaugeIcon },
  { tab: "vision", label: "Vision", icon: TelescopeIcon },
];

// Every navigable section, in the order they appear in the desktop nav rail.
const NAV_ITEMS: { tab: MobileTab; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "home", label: "Home", icon: HomeIcon },
  { tab: "chat", label: "Chat", icon: MessageCircleIcon },
  { tab: "tasks", label: "Tasks", icon: ListTodoIcon },
  { tab: "notes", label: "Notes", icon: FileTextIcon },
  { tab: "lists", label: "Lists", icon: ListChecksIcon },
  { tab: "journal-templates", label: "Journal", icon: BookOpenIcon },
  { tab: "dreams", label: "Dreams", icon: BrainIcon },
  { tab: "schedule", label: "Schedule", icon: CalendarClockIcon },
  { tab: "media", label: "Media", icon: ImageIcon },
  { tab: "measures", label: "Measures", icon: GaugeIcon },
  { tab: "vision", label: "Vision", icon: TelescopeIcon },
  { tab: "sketches", label: "Sketches", icon: BrushIcon },
  { tab: "calendar", label: "Calendar", icon: CalendarDaysIcon },
];

const NAV_RAIL_STORAGE_KEY = "focuspoint:nav-rail-open";

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ThreadsProvider>
      <Workspace>{children}</Workspace>
    </ThreadsProvider>
  );
}

function Workspace({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mobileTab = PATH_TABS[pathname] ?? "home";
  const setMobileTab = useCallback(
    (tab: MobileTab) => router.push(TAB_PATHS[tab]),
    [router],
  );

  // Warm every section route so switching tabs feels instant (the pages are empty
  // stubs, so this is cheap).
  useEffect(() => {
    for (const path of Object.values(TAB_PATHS)) router.prefetch(path);
  }, [router]);
  const [navRailOpen, setNavRailOpen] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem(NAV_RAIL_STORAGE_KEY);
    if (stored !== null) setNavRailOpen(stored === "1");
  }, []);
  const toggleNavRail = useCallback(() => {
    setNavRailOpen((v) => {
      const next = !v;
      window.localStorage.setItem(NAV_RAIL_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const [focusNewTaskSignal, setFocusNewTaskSignal] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [modalThreadId, setModalThreadId] = useState<string | null>(null);
  const { hydrated, activeId, createThread, newThread, switchTo, remove } = useThreads();

  // Starting a chat opens a floating modal on a fresh thread instead of
  // navigating to the full chat view. Fired by the C shortcut and every
  // "new chat" button (via NEW_CHAT_EVENT).
  const openChatModal = useCallback(() => {
    if (modalThreadId) return;
    setModalThreadId(createThread());
  }, [modalThreadId, createThread]);

  useEffect(() => {
    window.addEventListener(NEW_CHAT_EVENT, openChatModal);
    return () => window.removeEventListener(NEW_CHAT_EVENT, openChatModal);
  }, [openChatModal]);

  const handleModalClose = useCallback(
    (hasMessages: boolean) => {
      // A chat dismissed without ever sending anything shouldn't clutter history.
      if (!hasMessages && modalThreadId) remove(modalThreadId);
      setModalThreadId(null);
    },
    [modalThreadId, remove],
  );

  const handleModalExpand = useCallback(() => {
    if (modalThreadId) switchTo(modalThreadId);
    setModalThreadId(null);
    setMobileTab("chat");
  }, [modalThreadId, switchTo]);

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
      if (pinned || modalThreadId) return;
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
        openChatModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openChatModal, pinned, modalThreadId]);

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
      {/* Desktop nav rail — leftmost, always visible, collapsible to icons only */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col shrink-0 border-r border-border bg-background overflow-hidden",
          "lg:transition-[width] lg:duration-200 lg:ease-in-out",
          navRailOpen ? "lg:w-52" : "lg:w-14",
        )}
      >
        <div className="flex items-center h-14 px-2 shrink-0">
          <button
            onClick={toggleNavRail}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label={navRailOpen ? "Collapse navigation" : "Expand navigation"}
          >
            <PanelLeftIcon className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              title={label}
              className={cn(
                "flex items-center gap-3 w-full rounded-lg py-2 text-sm transition-colors",
                navRailOpen ? "px-2.5" : "justify-center px-0",
                mobileTab === tab
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {navRailOpen && <span className="truncate">{label}</span>}
            </button>
          ))}
        </nav>
      </aside>

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
            activeTab={mobileTab === "notes" ? "notes" : mobileTab === "lists" ? "lists" : mobileTab === "journal-templates" ? "journal-templates" : mobileTab === "dreams" ? "dreams" : mobileTab === "calendar" ? "calendar" : mobileTab === "media" ? "media" : mobileTab === "sketches" ? "sketches" : mobileTab === "schedule" ? "schedule" : mobileTab === "measures" ? "measures" : mobileTab === "vision" ? "vision" : "todos"}
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

      {/* Floating new-chat modal */}
      {modalThreadId && hydrated ? (
        <ChatModal
          key={modalThreadId}
          threadId={modalThreadId}
          onClose={handleModalClose}
          onExpand={handleModalExpand}
        />
      ) : null}

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

      {/* Section pages render nothing — the shell above owns the UI. */}
      {children}
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
