"use client";

import type { EveMessageData, UseEveAgentSnapshot } from "eve/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Derive the eve cursor + event-log types from the snapshot so we never deep-import
// internal eve protocol types. `events` seeds `initialEvents` to rehydrate a thread's
// transcript; `session` is the durable cursor the next turn resumes from.
type EveSession = UseEveAgentSnapshot<EveMessageData>["session"];
type EveEvents = UseEveAgentSnapshot<EveMessageData>["events"];

export type ThreadRecord = {
  id: string;
  title: string; // "" until derived from the first user message
  createdAt: number;
  updatedAt: number;
  session?: EveSession;
  events?: EveEvents;
};

type Snapshot = {
  session: EveSession;
  events: EveEvents;
  firstUserText?: string | undefined;
};

type ThreadsContextValue = {
  hydrated: boolean;
  threads: readonly ThreadRecord[]; // newest first
  activeId: string;
  getThread: (id: string) => ThreadRecord | undefined;
  newThread: () => void;
  switchTo: (id: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  saveSnapshot: (id: string, snap: Snapshot) => void;
};

const STORAGE_KEY = "cael.threads.v1";

const ThreadsContext = createContext<ThreadsContextValue | null>(null);

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

const isEmpty = (t: ThreadRecord): boolean => !t.events || t.events.length === 0;

const bySortKey = (a: ThreadRecord, b: ThreadRecord) => b.updatedAt - a.updatedAt;

type PersistShape = {
  version: 1;
  activeId: string;
  threads: ThreadRecord[];
};

function load(): { threads: ThreadRecord[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed?.threads?.length) {
        const activeId = parsed.threads.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : parsed.threads[0]!.id;
        return { threads: parsed.threads, activeId };
      }
    }
  } catch {
    // Corrupt/oversized storage — fall through to a fresh thread.
  }
  const fresh = freshThread();
  return { threads: [fresh], activeId: fresh.id };
}

function freshThread(): ThreadRecord {
  const now = Date.now();
  return { id: newId(), title: "", createdAt: now, updatedAt: now };
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount (client only).
  useEffect(() => {
    const { threads: loaded, activeId: id } = load();
    setThreads(loaded);
    setActiveId(id);
    setHydrated(true);
  }, []);

  // Persist on every change (after hydration). Prune empties that aren't active.
  const persist = useCallback(
    (next: ThreadRecord[], active: string) => {
      const toStore = next.filter((t) => !isEmpty(t) || t.id === active);
      const payload: PersistShape = {
        version: 1,
        activeId: active,
        threads: toStore,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Quota exceeded — drop the oldest non-active thread and retry once.
        const pruned = [...toStore]
          .sort(bySortKey)
          .filter((t, i) => t.id === active || i < toStore.length - 1);
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...payload, threads: pruned }),
          );
        } catch {
          // Give up silently; in-memory state still works for this session.
        }
      }
    },
    [],
  );

  const hydratedRef = useRef(false);
  hydratedRef.current = hydrated;
  useEffect(() => {
    if (hydrated) persist(threads, activeId);
  }, [threads, activeId, hydrated, persist]);

  const getThread = useCallback(
    (id: string) => threads.find((t) => t.id === id),
    [threads],
  );

  const newThread = useCallback(() => {
    setThreads((prev) => {
      // Drop other empty threads so we don't stack blank "New chat" entries.
      const kept = prev.filter((t) => !isEmpty(t));
      const fresh = freshThread();
      setActiveId(fresh.id);
      return [fresh, ...kept];
    });
  }, []);

  const switchTo = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id === id || !isEmpty(t)));
    setActiveId(id);
  }, []);

  const rename = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = freshThread();
        setActiveId(fresh.id);
        return [fresh];
      }
      setActiveId((cur) => (cur === id ? next.slice().sort(bySortKey)[0]!.id : cur));
      return next;
    });
  }, []);

  const saveSnapshot = useCallback((id: string, snap: Snapshot) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const title =
          t.title || (snap.firstUserText ? deriveTitle(snap.firstUserText) : "");
        return {
          ...t,
          title,
          session: snap.session,
          events: snap.events,
          updatedAt: Date.now(),
        };
      }),
    );
  }, []);

  const value = useMemo<ThreadsContextValue>(
    () => ({
      hydrated,
      threads: [...threads].sort(bySortKey),
      activeId,
      getThread,
      newThread,
      switchTo,
      rename,
      remove,
      saveSnapshot,
    }),
    [
      hydrated,
      threads,
      activeId,
      getThread,
      newThread,
      switchTo,
      rename,
      remove,
      saveSnapshot,
    ],
  );

  return (
    <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
  );
}

function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}

export function useThreads(): ThreadsContextValue {
  const ctx = useContext(ThreadsContext);
  if (!ctx) throw new Error("useThreads must be used within <ThreadsProvider>");
  return ctx;
}
