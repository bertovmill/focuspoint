"use client";

import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ActivityIcon, MessageCircleIcon, ListTodoIcon, FileTextIcon, BrainIcon, BrushIcon, ImageIcon, PanelLeftCloseIcon, PanelLeftIcon, CalendarClockIcon, CalendarDaysIcon, ListChecksIcon, BookOpenIcon, GaugeIcon, TelescopeIcon, MoreHorizontalIcon, HomeIcon, HeartIcon, BookMarkedIcon, MailIcon, AppleIcon } from "lucide-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { CaelAvatar } from "@/app/_components/cael-avatar";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { AccountButton } from "@/app/_components/account-button";
import { PinButton } from "@/app/_components/pin-button";
import { NEW_CHAT_EVENT } from "@/app/_components/new-chat-event";
import { ChatSidebar } from "@/app/_components/chat-sidebar";
import { FloatingChatBar } from "@/app/_components/floating-chat-bar";
import { NewsletterPanel } from "@/app/_components/newsletter-panel";
import { Dashboard } from "@/app/_components/dashboard";
import { HomeScreen, type HomeTarget } from "@/app/_components/home-screen";
import { KonstaApp } from "@/app/_components/konsta-app";
import { Tabbar, TabbarLink } from "konsta/react";
import { PIN_EVENT } from "@/app/_components/pin-button";
import { PinView } from "@/app/_components/pin-view";
import { ThreadsProvider, useThreads } from "@/app/_components/threads-provider";
// The streak + points live above both the dashboard and the pinned window, so a
// task finished in either one scores in the same place (see lib/streak.ts).
import { StreakProvider } from "@/app/_components/streak-provider";
import { setNativePinMode } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

type MobileTab = "home" | "chat" | "tasks" | "notes" | "lists" | "calendar" | "journal-templates" | "dreams" | "schedule" | "media" | "sketches" | "measures" | "vision" | "family" | "manual" | "newsletter" | "nutrition";

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
  family: "/family",
  manual: "/manual",
  newsletter: "/newsletter",
  nutrition: "/nutrition",
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
  { tab: "family", label: "Family", icon: HeartIcon },
  { tab: "nutrition", label: "Nutrition", icon: AppleIcon },
  { tab: "manual", label: "Manual", icon: BookMarkedIcon },
  { tab: "newsletter", label: "Newsletter", icon: MailIcon },
];

// Home, Chat, Tasks, Notes, Lists — the same five the mobile bar promotes above
// the "More" menu. The rail draws a rule after them to say the same thing.
const PRIMARY_NAV_COUNT = 5;

// The selected state is one element that travels between items rather than a
// background that blinks on and off. Both navs share this spring so the rail and
// the mobile bar move with the same weight.
const NAV_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 };

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
  { tab: "family", label: "Family", icon: HeartIcon },
  { tab: "nutrition", label: "Nutrition", icon: AppleIcon },
  { tab: "manual", label: "Manual", icon: BookMarkedIcon },
  { tab: "sketches", label: "Sketches", icon: BrushIcon },
  { tab: "calendar", label: "Calendar", icon: CalendarDaysIcon },
  { tab: "newsletter", label: "Newsletter", icon: MailIcon },
];

/** A tab's colour: the label/icon tint when active, and the pill behind the icon. */
type TabColor = { text: string; pill: string };

// The five tabs on the phone bar, in order, each in its own colour — the same
// idea as the metric tiles. The rest are behind "More".
const MOBILE_TABS: { tab: MobileTab; label: string; icon: typeof HomeIcon; color: TabColor }[] = [
  { tab: "home", label: "Home", icon: HomeIcon, color: { text: "text-primary", pill: "bg-primary/15" } },
  { tab: "chat", label: "Chat", icon: MessageCircleIcon, color: { text: "text-sky-600 dark:text-sky-400", pill: "bg-sky-500/15" } },
  { tab: "tasks", label: "Tasks", icon: ListTodoIcon, color: { text: "text-emerald-600 dark:text-emerald-400", pill: "bg-emerald-500/15" } },
  { tab: "notes", label: "Notes", icon: FileTextIcon, color: { text: "text-amber-600 dark:text-amber-400", pill: "bg-amber-500/15" } },
  { tab: "lists", label: "Lists", icon: ListChecksIcon, color: { text: "text-violet-600 dark:text-violet-400", pill: "bg-violet-500/15" } },
];
const MORE_COLOR: TabColor = { text: "text-slate-600 dark:text-slate-300", pill: "bg-slate-500/15" };

// Konsta's defaults are iOS blue and Material purple; this is the app's terracotta
// on the app's own surface, in both themes.
// Background is painted on the bar itself (see the Tabbar className) rather than
// through Konsta's own bg layer — the iOS one is a fade-to-transparent gradient
// meant for content to scroll under, which read as a see-through bar here.
const TABBAR_COLORS = {
  bgIos: "",
  bgMaterial: "",
  tabbarHighlightBgMaterial: "bg-transparent",
};
const TABBAR_LINK_COLORS = {
  textIos: "text-muted-foreground",
  textActiveIos: "text-primary",
  textMaterial: "text-muted-foreground",
  textActiveMaterial: "text-primary",
  // The pill is drawn by TabIcon so it can slide between tabs; Konsta's own stays off.
  iconBgActiveMaterial: "bg-transparent",
};

/**
 * A tab's icon with the coloured pill behind it. The pill shares one `layoutId`
 * across all six tabs, so it slides from the old tab to the new one instead of
 * blinking. Sized for a thumb: 56×36 pill, 26px icon.
 */
function TabIcon({
  icon: Icon,
  color,
  active,
  reduceMotion,
}: {
  icon: typeof HomeIcon;
  color: TabColor;
  active: boolean;
  reduceMotion?: boolean | null;
}) {
  return (
    <span className="relative flex h-9 w-14 items-center justify-center">
      {active && (
        <motion.span
          layoutId="mobileTabPill"
          transition={reduceMotion ? { duration: 0 } : NAV_SPRING}
          className={cn("absolute inset-0 rounded-full", color.pill)}
        />
      )}
      <motion.span
        className="relative"
        animate={reduceMotion ? undefined : { scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
        transition={NAV_SPRING}
      >
        <Icon className="size-6.5" strokeWidth={active ? 2.4 : 2} />
      </motion.span>
    </span>
  );
}

const NAV_RAIL_STORAGE_KEY = "focuspoint:nav-rail-open";

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <ThreadsProvider>
      <StreakProvider>
        <Workspace>{children}</Workspace>
      </StreakProvider>
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
  const reduceMotion = useReducedMotion();
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
  // The chat page is a full page, not a widget: the dashboard panel starts
  // collapsed there so the conversation fills the view. The header toggle brings
  // it back.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const [focusNewTaskSignal, setFocusNewTaskSignal] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { hydrated, activeId, getThread, newThread } = useThreads();

  // Starting a chat opens the full chat page on a fresh thread. Fired by the C
  // shortcut and every "new chat" button (via NEW_CHAT_EVENT).
  const openNewChat = useCallback(() => {
    // A thread only gets a title once it has been talked to, so an untitled
    // active thread is a blank one — reuse it rather than stacking up empty
    // "New chat" rows in the history rail.
    const active = activeId ? getThread(activeId) : undefined;
    if (!active || active.title) newThread();
    setMobileTab("chat");
  }, [activeId, getThread, newThread, setMobileTab]);

  useEffect(() => {
    window.addEventListener(NEW_CHAT_EVENT, openNewChat);
    return () => window.removeEventListener(NEW_CHAT_EVENT, openNewChat);
  }, [openNewChat]);

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
      // The floating chat is non-modal, so these still work with it open — unless
      // the keypress came from inside the window itself.
      if (target?.closest('[role="dialog"]')) return;
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
        openNewChat();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNewChat, pinned]);

  const handleRunJobWithChat = useCallback((message: string) => {
    newThread();
    setPendingMessage(message);
    setMobileTab("chat");
  }, [newThread]);

  if (pinned) {
    return <PinView onUnpin={handleUnpin} />;
  }

  return (
    <KonstaApp>
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop nav rail — leftmost, always visible, collapsible to icons only */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col shrink-0 border-r border-border bg-background overflow-hidden",
          "lg:transition-[width] lg:duration-200 lg:ease-in-out",
          navRailOpen ? "lg:w-52" : "lg:w-14",
        )}
      >
        <div className="flex items-center gap-1.5 h-14 px-2 shrink-0">
          <button
            onClick={toggleNavRail}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label={navRailOpen ? "Collapse navigation" : "Expand navigation"}
          >
            <PanelLeftIcon className="size-4" />
          </button>
          {/* The identity that used to sit in the dashboard's top bar. */}
          {navRailOpen && (
            <div className="flex items-center gap-2 min-w-0">
              <CaelAvatar size={24} />
              <span className="text-sm font-semibold tracking-tight truncate">Cael</span>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }, i) => {
            const active = mobileTab === tab;
            return (
              <Fragment key={tab}>
              {/* The mobile bar already treats the first five as primary and
                  buries the rest under "More". The rail says the same thing
                  with a rule instead of a menu — same order, same hierarchy. */}
              {i === PRIMARY_NAV_COUNT && (
                <div aria-hidden className="mx-2.5 my-1.5 border-t border-border/70" />
              )}
              <button
                onClick={() => setMobileTab(tab)}
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-lg py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  navRailOpen ? "px-2.5" : "justify-center px-0",
                  active
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {/* Hover wash sits under the indicator so the two never stack. */}
                {!active && (
                  <span className="absolute inset-0 rounded-lg bg-muted opacity-0 transition-opacity group-hover:opacity-100" />
                )}
                {active && (
                  <motion.span
                    layoutId="navRailActive"
                    transition={reduceMotion ? { duration: 0 } : NAV_SPRING}
                    className="absolute inset-0 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15"
                  />
                )}
                <motion.span
                  className="relative shrink-0"
                  animate={reduceMotion ? undefined : { scale: active ? 1.08 : 1 }}
                  transition={NAV_SPRING}
                >
                  <Icon className="size-4" />
                </motion.span>
                {navRailOpen && <span className="relative truncate">{label}</span>}
              </button>
              </Fragment>
            );
          })}
        </nav>
        {/* Utility controls — pin, traces, panel collapse, theme. These used to
            live in the dashboard's top bar; the rail holds them now so the
            content panel is header-free. */}
        <div
          className={cn(
            "shrink-0 border-t border-border px-2 py-2 flex items-center gap-1",
            navRailOpen ? "flex-row" : "flex-col",
          )}
        >
          <PinButton iconClassName="size-4" />
          <Link
            href="/traces"
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="View agent traces"
            title="Agent traces"
          >
            <ActivityIcon className="size-4" />
          </Link>
          {mobileTab === "chat" && sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Collapse panel"
              title="Collapse panel"
            >
              <PanelLeftCloseIcon className="size-4" />
            </button>
          )}
          <ModeToggle />
          <AccountButton />
        </div>
      </aside>

      {/* Dashboard panel — sidebar when chat is active, takes over the full main view otherwise */}
      <aside
        className={cn(
          "shrink-0 flex-col border-r border-border overflow-hidden",
          // The fixed bottom nav reserves no space, so the panel gives it back here
          // once, for every section — rather than each panel remembering to.
          "pb-[var(--mobile-nav-h)] lg:pb-0",
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
          {mobileTab === "newsletter" ? (
            <NewsletterPanel />
          ) : (
          <Dashboard
            activeTab={mobileTab === "notes" ? "notes" : mobileTab === "lists" ? "lists" : mobileTab === "journal-templates" ? "journal-templates" : mobileTab === "dreams" ? "dreams" : mobileTab === "calendar" ? "calendar" : mobileTab === "media" ? "media" : mobileTab === "sketches" ? "sketches" : mobileTab === "schedule" ? "schedule" : mobileTab === "measures" ? "measures" : mobileTab === "vision" ? "vision" : mobileTab === "family" ? "family" : mobileTab === "nutrition" ? "nutrition" : mobileTab === "manual" ? "manual" : "todos"}
            onRunJobWithChat={handleRunJobWithChat}
            onTabChange={(tab) => setMobileTab(tab === "todos" ? "tasks" : tab)}
            focusNewTaskSignal={focusNewTaskSignal}
          />
          )}
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

      {/* Mobile bottom navigation bar — Konsta's Tabbar as a floating pill above the
          bottom edge, every tab in its own colour, and a filled pill that slides to
          the active icon (his ask, 2026-09-05: "a more fun menu bar"). The "More"
          sheet is still vaul, opened from the last tab. */}
      <Tabbar
        labels
        icons
        className={cn(
          "fixed inset-x-3 z-50 rounded-[2rem] border border-border/60 bg-background/90 shadow-lg shadow-black/10 backdrop-blur-md lg:hidden!",
          "bottom-[calc(var(--mobile-nav-gap)_+_var(--safe-bottom))] w-auto!",
        )}
        colors={TABBAR_COLORS}
        innerClassName="h-17! rounded-[2rem] px-1"
      >
        {MOBILE_TABS.map(({ tab, label, icon: Icon, color }) => (
          <TabbarLink
            key={tab}
            active={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            icon={<TabIcon icon={Icon} color={color} active={mobileTab === tab} reduceMotion={reduceMotion} />}
            label={label}
            colors={{ ...TABBAR_LINK_COLORS, textActiveIos: color.text, textActiveMaterial: color.text }}
            className="min-w-0 flex-1 basis-0 px-0!"
          />
        ))}
        <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
          <DrawerTrigger asChild>
            <TabbarLink
              active={MORE_TABS.some((t) => t.tab === mobileTab)}
              icon={
                <TabIcon
                  icon={MoreHorizontalIcon}
                  color={MORE_COLOR}
                  active={MORE_TABS.some((t) => t.tab === mobileTab)}
                  reduceMotion={reduceMotion}
                />
              }
              label="More"
              colors={{ ...TABBAR_LINK_COLORS, textActiveIos: MORE_COLOR.text, textActiveMaterial: MORE_COLOR.text }}
              className="min-w-0 flex-1 basis-0 px-0!"
            />
          </DrawerTrigger>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle className="sr-only">More sections</DrawerTitle>
            <div className="grid grid-cols-4 gap-2 overflow-y-auto p-4 pb-[max(1rem,var(--safe-bottom))]">
              {MORE_TABS.map(({ tab, label, icon: Icon }) => (
                <button
                  key={tab}
                  onClick={() => {
                    setMoreOpen(false);
                    setMobileTab(tab);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 transition-colors active:scale-95 active:transition-transform",
                    mobileTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </Tabbar>

      {/* Ever-present line to Cael — floats over every section except the chat
          page, which has its own composer. Sending rides the same path as
          "Run now": fresh thread, message on its way, chat page open. */}
      {mobileTab !== "chat" && <FloatingChatBar onSend={handleRunJobWithChat} />}

      {/* Section pages render nothing — the shell above owns the UI. */}
      {children}
    </main>
    </KonstaApp>
  );
}

