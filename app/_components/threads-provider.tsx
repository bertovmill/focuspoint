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

type EveSession = UseEveAgentSnapshot<EveMessageData>["session"];
type EveEvents = UseEveAgentSnapshot<EveMessageData>["events"];

export type ThreadRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  session?: EveSession;
  events?: EveEvents;
  /**
   * Whether `session` and `events` are here. The list loads titles only, so a
   * past thread's transcript is fetched when it is opened (`ensureLoaded`).
   * Threads made in this tab start out loaded: there is nothing to fetch.
   */
  loaded: boolean;
};

type Snapshot = {
  /** `null` clears a saved session (the server no longer knows it); `undefined` also clears. */
  session: EveSession | null;
  events: EveEvents;
  firstUserText?: string | undefined;
};

type ThreadsContextValue = {
  hydrated: boolean;
  threads: readonly ThreadRecord[];
  activeId: string;
  runningIds: ReadonlySet<string>;
  getThread: (id: string) => ThreadRecord | undefined;
  /** Fetches a thread's transcript if it isn't here yet. Safe to call repeatedly; rejects on failure. */
  ensureLoaded: (id: string) => Promise<void>;
  /** Creates and persists a thread without switching the main chat view to it. */
  createThread: (title?: string) => string;
  newThread: () => void;
  switchTo: (id: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  saveSnapshot: (id: string, snap: Snapshot) => void;
  setRunning: (id: string, running: boolean) => void;
};

const ThreadsContext = createContext<ThreadsContextValue | null>(null);

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

const bySortKey = (a: ThreadRecord, b: ThreadRecord) => b.updatedAt - a.updatedAt;

type ApiRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type FullApiRow = ApiRow & {
  session: EveSession | null;
  events: EveEvents | null;
};

function rowToRecord(row: ApiRow): ThreadRecord {
  return {
    id: row.id,
    title: row.title ?? "",
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    loaded: false,
  };
}

function freshThread(title = ""): ThreadRecord {
  const now = Date.now();
  return { id: newId(), title, createdAt: now, updatedAt: now, loaded: true };
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  // Load threads from DB on mount.
  useEffect(() => {
    fetch("/api/threads")
      .then((r) => r.json())
      .then((rows: ApiRow[]) => {
        if (rows.length > 0) {
          const loaded = rows.map(rowToRecord);
          // A thread can be created before this fetch resolves (the chat bar
          // sends on a fresh thread immediately). Merge instead of replacing,
          // and never steal the active selection — hydration clobbering
          // activeId used to reroute that first message into whatever thread
          // happened to be newest in the DB.
          setThreads((prev) => {
            const known = new Set(loaded.map((t) => t.id));
            return [...prev.filter((t) => !known.has(t.id)), ...loaded];
          });
          setActiveId((cur) => cur || loaded[0]!.id);
        } else {
          const fresh = freshThread();
          // Same guard as above: a pre-hydration thread keeps its place.
          setThreads((prev) => (prev.length > 0 ? prev : [fresh]));
          setActiveId((cur) => cur || fresh.id);
          // Create the fresh thread in the DB so it persists on first use.
          void fetch("/api/threads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: fresh.id, title: fresh.title }),
          });
        }
      })
      .catch(() => {
        // DB unreachable — fall back to an in-memory thread.
        const fresh = freshThread();
        setThreads((prev) => (prev.length > 0 ? prev : [fresh]));
        setActiveId((cur) => cur || fresh.id);
      })
      .finally(() => setHydrated(true));
  }, []);

  const getThread = useCallback(
    (id: string) => threads.find((t) => t.id === id),
    [threads],
  );

  // One request per thread, however many components ask for it at once.
  const loadRequests = useRef(new Map<string, Promise<void>>());
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const ensureLoaded = useCallback((id: string): Promise<void> => {
    const known = threadsRef.current.find((t) => t.id === id);
    if (!known || known.loaded) return Promise.resolve();
    const inFlight = loadRequests.current.get(id);
    if (inFlight) return inFlight;
    // A failure rejects and leaves the thread unloaded. Opening it empty instead
    // would be worse than an error: its first checkpoint would write the new
    // turn over the whole saved transcript.
    const request = fetch(`/api/threads/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`thread ${id}: ${r.status}`);
        return r.json() as Promise<FullApiRow>;
      })
      .then((row) => {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, session: row.session ?? undefined, events: row.events ?? undefined, loaded: true }
              : t,
          ),
        );
      })
      .finally(() => loadRequests.current.delete(id));
    loadRequests.current.set(id, request);
    return request;
  }, []);

  // Deleting a just-created thread must not race its create POST.
  const createRequests = useRef(new Map<string, Promise<unknown>>());

  const createThread = useCallback((title?: string): string => {
    const fresh = freshThread(title);
    createRequests.current.set(
      fresh.id,
      fetch("/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: fresh.id, title: fresh.title }),
      }).catch(() => undefined),
    );
    setThreads((prev) => [fresh, ...prev]);
    return fresh.id;
  }, []);

  const newThread = useCallback(() => {
    setActiveId(createThread());
  }, [createThread]);

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const rename = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    );
    void fetch(`/api/threads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }, []);

  const remove = useCallback((id: string) => {
    const pendingCreate = createRequests.current.get(id) ?? Promise.resolve();
    createRequests.current.delete(id);
    void pendingCreate.then(() => fetch(`/api/threads/${id}`, { method: "DELETE" }));
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = freshThread();
        setActiveId(fresh.id);
        void fetch("/api/threads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: fresh.id }),
        });
        return [fresh];
      }
      setActiveId((cur) => (cur === id ? next.slice().sort(bySortKey)[0]!.id : cur));
      return next;
    });
  }, []);

  const setRunning = useCallback((id: string, running: boolean) => {
    setRunningIds((prev) => {
      const next = new Set(prev);
      if (running) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const saveSnapshot = useCallback((id: string, snap: Snapshot) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const title =
          t.title || (snap.firstUserText ? deriveTitle(snap.firstUserText) : "");
        const updated = { ...t, title, session: snap.session ?? undefined, events: snap.events, updatedAt: Date.now() };
        void fetch(`/api/threads/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          // `undefined` would drop the key and the route would keep the old
          // session; a cleared session has to land as an explicit null.
          body: JSON.stringify({ title: updated.title, session: snap.session ?? null, events: snap.events }),
        });
        return updated;
      }),
    );
  }, []);

  const value = useMemo<ThreadsContextValue>(
    () => ({
      hydrated,
      threads: [...threads].sort(bySortKey),
      activeId,
      runningIds,
      getThread,
      ensureLoaded,
      createThread,
      newThread,
      switchTo,
      rename,
      remove,
      saveSnapshot,
      setRunning,
    }),
    [hydrated, threads, activeId, runningIds, getThread, ensureLoaded, createThread, newThread, switchTo, rename, remove, saveSnapshot, setRunning],
  );

  return (
    <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
  );
}

export function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}

/**
 * Loads a thread's transcript and reports when it's here. A chat reads the
 * transcript once, when it mounts, so it must not mount before `ready`.
 */
export function useThreadLoaded(id: string): { ready: boolean; failed: boolean; retry: () => void } {
  const { getThread, ensureLoaded } = useThreads();
  const ready = getThread(id)?.loaded ?? false;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (ready) return;
    setFailed(false);
    ensureLoaded(id).catch(() => setFailed(true));
  }, [id, ready, attempt, ensureLoaded]);
  return { ready, failed, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

export function useThreads(): ThreadsContextValue {
  const ctx = useContext(ThreadsContext);
  if (!ctx) throw new Error("useThreads must be used within <ThreadsProvider>");
  return ctx;
}
