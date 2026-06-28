"use client";

import type { EveMessageData, UseEveAgentSnapshot } from "eve/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
};

type Snapshot = {
  session: EveSession;
  events: EveEvents;
  firstUserText?: string | undefined;
};

type ThreadsContextValue = {
  hydrated: boolean;
  threads: readonly ThreadRecord[];
  activeId: string;
  getThread: (id: string) => ThreadRecord | undefined;
  newThread: () => void;
  switchTo: (id: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  saveSnapshot: (id: string, snap: Snapshot) => void;
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
  session: EveSession | null;
  events: EveEvents | null;
  created_at: string;
  updated_at: string;
};

function rowToRecord(row: ApiRow): ThreadRecord {
  return {
    id: row.id,
    title: row.title ?? "",
    session: row.session ?? undefined,
    events: row.events ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function freshThread(): ThreadRecord {
  const now = Date.now();
  return { id: newId(), title: "", createdAt: now, updatedAt: now };
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // Load threads from DB on mount.
  useEffect(() => {
    fetch("/api/threads")
      .then((r) => r.json())
      .then((rows: ApiRow[]) => {
        if (rows.length > 0) {
          const loaded = rows.map(rowToRecord);
          setThreads(loaded);
          setActiveId(loaded[0]!.id);
        } else {
          const fresh = freshThread();
          setThreads([fresh]);
          setActiveId(fresh.id);
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
        setThreads([fresh]);
        setActiveId(fresh.id);
      })
      .finally(() => setHydrated(true));
  }, []);

  const getThread = useCallback(
    (id: string) => threads.find((t) => t.id === id),
    [threads],
  );

  const newThread = useCallback(() => {
    const fresh = freshThread();
    void fetch("/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: fresh.id, title: fresh.title }),
    });
    setThreads((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
  }, []);

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
    void fetch(`/api/threads/${id}`, { method: "DELETE" });
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

  const saveSnapshot = useCallback((id: string, snap: Snapshot) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const title =
          t.title || (snap.firstUserText ? deriveTitle(snap.firstUserText) : "");
        const updated = { ...t, title, session: snap.session, events: snap.events, updatedAt: Date.now() };
        void fetch(`/api/threads/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: updated.title, session: snap.session, events: snap.events }),
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
      getThread,
      newThread,
      switchTo,
      rename,
      remove,
      saveSnapshot,
    }),
    [hydrated, threads, activeId, getThread, newThread, switchTo, rename, remove, saveSnapshot],
  );

  return (
    <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>
  );
}

export function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}

export function useThreads(): ThreadsContextValue {
  const ctx = useContext(ThreadsContext);
  if (!ctx) throw new Error("useThreads must be used within <ThreadsProvider>");
  return ctx;
}
