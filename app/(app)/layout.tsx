"use client";

import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ActivityIcon, DumbbellIcon, MessageCircleIcon, ListTodoIcon, FileTextIcon, BrainIcon, BrushIcon, ImageIcon, PanelLeftCloseIcon, PanelLeftIcon, CalendarClockIcon, CalendarDaysIcon, ListChecksIcon, BookOpenIcon, GaugeIcon, TelescopeIcon, MoreHorizontalIcon, HomeIcon, HeartIcon, BookMarkedIcon, MailIcon, AppleIcon, UtensilsIcon, BriefcaseIcon, PenLineIcon } from "lucide-react";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { AccountButton } from "@/app/_components/account-button";
import { PinButton } from "@/app/_components/pin-button";
import { NEW_CHAT_EVENT } from "@/app/_components/new-chat-event";
import { HomeScreen, type HomeTarget } from "@/app/_components/home-screen";
import { KonstaApp } from "@/app/_components/konsta-app";
import { Tabbar, TabbarLink } from "konsta/react";
import { PIN_EVENT } from "@/app/_components/pin-button";
import { AppCommandPalette } from "@/app/_components/app-command-palette";
import { ThreadsProvider, useThreads } from "@/app/_components/threads-provider";
// The streak + points live above both the dashboard and the pinned window, so a
// task finished in either one scores in the same place (see lib/streak.ts).
import { StreakProvider } from "@/app/_components/streak-provider";
import { PageContextProvider, useCornerHidden, usePageDetail } from "@/app/_components/page-context";
import { CornerResizeHandles, useCornerSize } from "@/app/_components/corner-resize";
import { setNativePinMode } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

// Every section but Home is split into its own chunk and only downloaded when
// it's opened. The shell used to import them all, which put ~1.8 MB of script
// between launching the app and seeing the home screen on the phone.
const AgentChat = dynamic(() => import("@/app/_components/agent-chat").then((m) => m.AgentChat), { ssr: false });
const ChatSidebar = dynamic(() => import("@/app/_components/chat-sidebar").then((m) => m.ChatSidebar), { ssr: false });
const NewsletterPanel = dynamic(() => import("@/app/_components/newsletter-panel").then((m) => m.NewsletterPanel), { ssr: false });
const WeekPlanPanel = dynamic(() => import("@/app/_components/week-plan-panel").then((m) => m.WeekPlanPanel), { ssr: false });
const TrainingPlanPanel = dynamic(() => import("@/app/_components/training-plan-panel").then((m) => m.TrainingPlanPanel), { ssr: false });
const CareerPanel = dynamic(() => import("@/app/_components/career-panel").then((m) => m.CareerPanel), { ssr: false });
const WritingPanel = dynamic(() => import("@/app/_components/writing-panel").then((m) => m.WritingPanel), { ssr: false });
const Dashboard = dynamic(() => import("@/app/_components/dashboard").then((m) => m.Dashboard), { ssr: false });
const PinView = dynamic(() => import("@/app/_components/pin-view").then((m) => m.PinView), { ssr: false });

type MobileTab = "home" | "chat" | "tasks" | "notes" | "lists" | "calendar" | "journal-templates" | "schedule" | "media" | "sketches" | "measures" | "vision" | "family" | "manual" | "newsletter" | "nutrition" | "meals" | "training" | "career" | "writing";

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
  schedule: "/schedule",
  media: "/media",
  sketches: "/sketches",
  measures: "/measures",
  vision: "/vision",
  family: "/family",
  manual: "/manual",
  newsletter: "/newsletter",
  nutrition: "/nutrition",
  meals: "/meals",
  training: "/training",
  career: "/career",
  writing: "/writing",
};

// How the corner chat names the page Berto is on, in its header and to Cael.
const SECTION_LABELS: Record<MobileTab, string> = {
  home: "Home",
  chat: "Chat",
  tasks: "Tasks",
  notes: "Notes",
  lists: "Lists",
  calendar: "Calendar",
  "journal-templates": "Journal",
  schedule: "Schedule",
  media: "Media",
  sketches: "Sketches",
  measures: "Measures",
  vision: "Vision",
  family: "Family",
  manual: "Manual",
  newsletter: "Newsletter",
  nutrition: "Nutrition",
  meals: "Meals",
  training: "Training",
  career: "Career",
  writing: "Writing",
};

const PATH_TABS = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as MobileTab]),
) as Record<string, MobileTab>;

// The nav shows only Home, Chat, Notes, Writing, Sketches, Training, Meals and Career (Berto, 2026-09-14; Meals, Career and Notes added 2026-09-27; Writing 2026-09-30). Every other
// section still exists at its URL and through Cael's tools; it just isn't a
// destination in the shell any more. On the phone the bar holds five slots
// (Berto, 2026-09-30): the first four tabs plus "More", which opens the rest.
// Training sits on the bar and Writing behind More (Berto, 2026-10-03).
const MORE_TABS: { tab: MobileTab; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "writing", label: "Writing", icon: PenLineIcon },
  { tab: "sketches", label: "Sketches", icon: BrushIcon },
  { tab: "meals", label: "Meals", icon: UtensilsIcon },
  { tab: "career", label: "Career", icon: BriefcaseIcon },
];

// The selected state is one element that travels between items rather than a
// background that blinks on and off. Both navs share this spring so the rail and
// the mobile bar move with the same weight.
const NAV_SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.7 };

// Every navigable section, in the order they appear in the desktop nav rail.
const NAV_ITEMS: { tab: MobileTab; label: string; icon: typeof BookOpenIcon }[] = [
  { tab: "home", label: "Home", icon: HomeIcon },
  { tab: "chat", label: "Chat", icon: MessageCircleIcon },
  { tab: "notes", label: "Notes", icon: FileTextIcon },
  { tab: "writing", label: "Writing", icon: PenLineIcon },
  { tab: "sketches", label: "Sketches", icon: BrushIcon },
  { tab: "training", label: "Training", icon: DumbbellIcon },
  { tab: "meals", label: "Meals", icon: UtensilsIcon },
  { tab: "career", label: "Career", icon: BriefcaseIcon },
];

/** A tab's colour: the label/icon tint when active, and the pill behind the icon. */
type TabColor = { text: string; pill: string };

// The four tabs on the phone bar before "More", in order, each in its own colour — the same
// idea as the metric tiles. The rest are behind "More".
const MOBILE_TABS: { tab: MobileTab; label: string; icon: typeof HomeIcon; color: TabColor }[] = [
  { tab: "home", label: "Home", icon: HomeIcon, color: { text: "text-primary", pill: "bg-primary/15" } },
  { tab: "chat", label: "Chat", icon: MessageCircleIcon, color: { text: "text-sky-600 dark:text-sky-400", pill: "bg-sky-500/15" } },
  { tab: "notes", label: "Notes", icon: FileTextIcon, color: { text: "text-yellow-600 dark:text-yellow-400", pill: "bg-yellow-500/15" } },
  { tab: "training", label: "Training", icon: DumbbellIcon, color: { text: "text-orange-600 dark:text-orange-400", pill: "bg-orange-500/15" } },
];
const MORE_COLOR: TabColor = { text: "text-slate-600 dark:text-slate-300", pill: "bg-slate-500/15" };

// Konsta's defaults are iOS blue and Material purple; this is the app's forest green
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
 * blinking. The pill wraps the icon and the label below it with a little room on
 * every side (Berto, 2026-10-03): 72×56, anchored to Konsta's 28px icon box, which
 * is why the links turn off Konsta's `truncate` clipping. 26px icon.
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
    <span className="relative flex size-7 items-center justify-center">
      {active && (
        <motion.span
          layoutId="mobileTabPill"
          transition={reduceMotion ? { duration: 0 } : NAV_SPRING}
          className={cn("absolute -top-1.5 left-[calc(50%-2.25rem)] h-14 w-18 rounded-[1.25rem]", color.pill)}
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
        <PageContextProvider>
          <Workspace>{children}</Workspace>
        </PageContextProvider>
      </StreakProvider>
    </ThreadsProvider>
  );
}

function Workspace({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Sub-pages of a section (e.g. /training/workouts/upper-body/2026-10-03) stay on its tab.
  const mobileTab = PATH_TABS[pathname] ?? PATH_TABS["/" + pathname.split("/")[1]] ?? "home";
  const setMobileTab = useCallback(
    (tab: MobileTab) => router.push(TAB_PATHS[tab]),
    [router],
  );

  // Warm every section route so switching tabs feels instant (the pages are empty
  // stubs, so this is cheap).
  useEffect(() => {
    for (const path of Object.values(TAB_PATHS)) router.prefetch(path);
  }, [router]);

  // The shell is h-dvh and never scrolls as a whole, but on the installed iPhone
  // app the keyboard scrolls the whole document up to keep a field in view, and
  // doesn't always scroll it back. The shell is then left shifted up under the
  // status bar with a blank band above the tab bar (Berto, 2026-10-11, after typing
  // reps on a workout). Put it back once no field has focus.
  useEffect(() => {
    const editing = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement && (el.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !(el as HTMLInputElement).readOnly));
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      // After focus has moved on (tapping from one set box to the next keeps the keyboard up).
      timer = setTimeout(() => {
        // Leave a pinch-zoom alone (it's how a sketch gets zoomed on a phone).
        if ((window.visualViewport?.scale ?? 1) > 1.01) return;
        if (!editing() && (window.scrollY !== 0 || window.scrollX !== 0)) window.scrollTo(0, 0);
      }, 60);
    };
    document.addEventListener("focusout", settle);
    window.addEventListener("scroll", settle, { passive: true });
    window.visualViewport?.addEventListener("resize", settle);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusout", settle);
      window.removeEventListener("scroll", settle);
      window.visualViewport?.removeEventListener("resize", settle);
    };
  }, []);
  // The service worker keeps the app's script files on the device (public/sw.js),
  // so it has to be running from the first launch, not just once Chat's push bell
  // registers it. After load, so it never competes with the launch it speeds up.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
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
  const [focusNewTaskSignal, setFocusNewTaskSignal] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { hydrated, activeId, getThread, newThread, switchTo } = useThreads();
  // On the phone a conversation gets the whole screen, the way the Claude and
  // Muse apps do it: the tab bar steps aside and the chat header's Home button
  // is the way back (his ask, 2026-10-04).
  const chatFullScreen = mobileTab === "chat";
  // The chat stays mounted once opened, so an answer keeps streaming while you
  // look at another section. Until then it isn't mounted at all: launching on
  // Home shouldn't download the chat or the newest thread's transcript.
  const [chatOpened, setChatOpened] = useState(mobileTab === "chat");
  // The corner chat (Berto, 2026-10-16): on every page but Chat, Cael sits in a
  // bubble bottom-right and opens into a small window on the *same* chat — the
  // one AgentChat below, restyled, so a conversation is never live twice. It
  // sends what's on screen with each message (page-context.tsx).
  const [cornerOpen, setCornerOpen] = useState(false);
  const corner = mobileTab !== "chat";
  const cornerHidden = useCornerHidden();
  const cornerSize = useCornerSize();
  useEffect(() => {
    if (mobileTab === "chat" || cornerOpen) setChatOpened(true);
  }, [mobileTab, cornerOpen]);
  const pageDetail = usePageDetail();
  const sectionLabel = SECTION_LABELS[mobileTab];
  const pageContext =
    `Berto is on the ${sectionLabel} page (${pathname}) of the Cael app, talking to you from the chat in its corner. ` +
    "\"This\" or \"here\" means what's on that page." +
    (pageDetail ? ` ${pageDetail}` : "");

  // Starting a chat opens the full chat page on a fresh thread. Fired by the C
  // shortcut and every "new chat" button (via NEW_CHAT_EVENT).
  const openNewChat = useCallback((event?: Event) => {
    // A thread only gets a title once it has been talked to, so an untitled
    // active thread is a blank one — reuse it rather than stacking up empty
    // "New chat" rows in the history rail.
    const active = activeId ? getThread(activeId) : undefined;
    if (!active || active.title) newThread();
    // The corner chat's "new chat" starts over where Berto is.
    if ((event as CustomEvent<{ stay?: boolean }> | undefined)?.detail?.stay) return;
    setMobileTab("chat");
  }, [activeId, getThread, newThread, setMobileTab]);

  // Arriving at Chat from anywhere else — the nav rail, the tab bar, a link, a
  // fresh load of /chat — lands on a blank thread, not the last conversation
  // (Berto, 2026-10-16). Past chats stay one click away in the history rail. A
  // specific chat is opened with /chat?thread=<id> (the command palette does).
  // Waits for the threads to hydrate, or the reuse check can't see them.
  const pendingChatEntryRef = useRef(false);
  const prevTabRef = useRef<MobileTab | null>(null);
  useEffect(() => {
    if (mobileTab === "chat" && prevTabRef.current !== "chat") pendingChatEntryRef.current = true;
    if (mobileTab !== "chat") pendingChatEntryRef.current = false;
    prevTabRef.current = mobileTab;
    if (!pendingChatEntryRef.current || !hydrated) return;
    pendingChatEntryRef.current = false;
    const requested = new URLSearchParams(window.location.search).get("thread");
    if (requested && getThread(requested)) {
      switchTo(requested);
      return;
    }
    const active = activeId ? getThread(activeId) : undefined;
    if (!active || active.title) newThread();
  }, [mobileTab, hydrated, activeId, getThread, newThread, switchTo]);

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

  if (pinned) {
    return <PinView onUnpin={handleUnpin} />;
  }

  return (
    <KonstaApp>
    {/* `/` or ⌘K: jump anywhere. Lives beside the T/N/C shortcuts above; see app-command-palette.tsx. */}
    <AppCommandPalette
      onNewChat={() => openNewChat()}
      onNewTask={() => {
        setMobileTab("tasks");
        setFocusNewTaskSignal((n) => n + 1);
      }}
    />
    <main
      className={cn(
        "flex h-dvh overflow-hidden bg-background text-foreground",
        // The installed iPhone app draws under the status bar (black-translucent, see
        // app/layout.tsx). Home's photo is meant to run up under the clock; every
        // other section starts below it.
        mobileTab !== "home" && "pt-[var(--safe-top)]",
      )}
    >
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
              <span className="text-sm font-semibold tracking-tight truncate">Cael</span>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }) => {
            const active = mobileTab === tab;
            return (
              <Fragment key={tab}>
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
        data-cael-page
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
          ) : mobileTab === "meals" ? (
            <div className="h-full overflow-y-auto px-3 py-4 sm:px-4">
              <WeekPlanPanel />
            </div>
          ) : mobileTab === "training" ? (
            <div className="h-full overflow-y-auto px-3 py-4 sm:px-4">
              <TrainingPlanPanel />
            </div>
          ) : mobileTab === "writing" ? (
            <WritingPanel />
          ) : mobileTab === "career" ? (
            <div className="h-full overflow-y-auto px-3 py-4 sm:px-4">
              <CareerPanel />
            </div>
          ) : mobileTab === "home" ? null : (
          <Dashboard
            activeTab={mobileTab === "notes" ? "notes" : mobileTab === "lists" ? "lists" : mobileTab === "journal-templates" ? "journal-templates" : mobileTab === "calendar" ? "calendar" : mobileTab === "media" ? "media" : mobileTab === "sketches" ? "sketches" : mobileTab === "schedule" ? "schedule" : mobileTab === "measures" ? "measures" : mobileTab === "vision" ? "vision" : mobileTab === "family" ? "family" : mobileTab === "nutrition" ? "nutrition" : mobileTab === "manual" ? "manual" : "todos"}
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
        role={corner && cornerOpen && !cornerHidden ? "dialog" : undefined}
        aria-label={corner && cornerOpen && !cornerHidden ? "Chat with Cael" : undefined}
        style={corner ? cornerSize.style : undefined}
        className={cn(
          "min-w-0 flex-row",
          !corner
            ? "flex flex-1"
            : cornerOpen && !cornerHidden
              ? cn(
                  // Phone: the whole screen, over the tab bar. Desktop: a window
                  // bottom-right, clear of the page's own controls.
                  "fixed inset-0 z-[60] flex bg-background pt-[var(--safe-top)]",
                  "lg:inset-auto lg:right-5 lg:bottom-5 lg:h-[min(var(--corner-h),calc(100dvh-2.5rem))] lg:w-[min(var(--corner-w),calc(100vw-2.5rem))] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:pt-0 lg:shadow-2xl lg:shadow-black/15",
                )
              : "hidden",
        )}
      >
        {corner && cornerOpen && !cornerHidden ? <CornerResizeHandles {...cornerSize} /> : null}
        {/* Desktop chat-history rail */}
        <div
          className={cn(
            "hidden shrink-0 flex-col border-r border-border overflow-hidden",
            corner && "lg:hidden!",
            "lg:flex lg:flex-none lg:transition-[width] lg:duration-300 lg:ease-in-out",
            chatSidebarOpen ? "lg:w-64" : "lg:w-0",
          )}
        >
          {/* Fixed-width inner so content doesn't reflow during animation */}
          <div className="w-64 h-full shrink-0 relative">
            {chatOpened && <ChatSidebar
              className="h-full"
              searchTrailing={
                <button
                  onClick={() => setChatSidebarOpen(false)}
                  className="shrink-0 p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Hide chat history"
                >
                  <PanelLeftCloseIcon className="size-3.5" />
                </button>
              }
            />}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {chatOpened && hydrated && activeId ? (
            <AgentChat
              key={activeId}
              threadId={activeId}
              hasMobileNav={!chatFullScreen}
              onGoHome={() => setMobileTab("home")}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              chatSidebarOpen={chatSidebarOpen}
              onToggleChatSidebar={() => setChatSidebarOpen((v) => !v)}
              variant={corner ? "corner" : "page"}
              pageContext={pageContext}
              pageLabel={`on ${sectionLabel}`}
              onClose={() => setCornerOpen(false)}
              onExpand={() => {
                setCornerOpen(false);
                router.push(`/chat?thread=${encodeURIComponent(activeId)}`);
              }}
            />
          ) : null}
        </div>
      </div>

      {corner && !cornerOpen && !cornerHidden && hydrated ? (
        <button
          type="button"
          onClick={() => setCornerOpen(true)}
          className={cn(
            // Liquid glass (globals.css .liquid-bubble), bigger than a stock FAB.
            "liquid-bubble fixed right-4 z-50 flex size-15 items-center justify-center lg:size-16",
            // Above the phone's floating tab bar; bottom-right corner on desktop.
            "bottom-[calc(var(--mobile-nav-h)_+_0.75rem)] lg:right-6 lg:bottom-6",
          )}
          aria-label="Chat with Cael"
          title="Chat with Cael"
        >
          <MessageCircleIcon className="size-7 drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.25)]" strokeWidth={2.4} />
        </button>
      ) : null}

      {/* Mobile bottom navigation bar — Konsta's Tabbar as a floating pill above the
          bottom edge, every tab in its own colour, and a filled pill that slides to
          the active icon (his ask, 2026-09-05: "a more fun menu bar"). The "More"
          sheet is still vaul, opened from the last tab. */}
      <Tabbar
        labels
        icons
        className={cn(
          "fixed inset-x-3 z-50 rounded-[2rem] border border-border/60 bg-background/90 shadow-lg shadow-black/10 backdrop-blur-md lg:hidden!",
          chatFullScreen && "hidden!",
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
            className="min-w-0 flex-1 basis-0 px-0! overflow-visible!"
          />
        ))}
        {MORE_TABS.length > 0 && <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
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
              className="min-w-0 flex-1 basis-0 px-0! overflow-visible!"
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
        </Drawer>}
      </Tabbar>

      {/* Section pages render nothing — the shell above owns the UI. */}
      {children}
    </main>
    </KonstaApp>
  );
}

