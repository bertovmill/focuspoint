"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BrainIcon,
  CheckSquareIcon,
  TrashIcon,
  SearchIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Thought {
  id: number;
  content: string;
  tags: string[];
  created_at: string;
}

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Stats {
  totalThoughts: number;
  activeTodos: number;
  completedToday: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityBadge(p: string) {
  if (p === "high") return "bg-red-500/10 text-red-500";
  if (p === "low") return "bg-muted text-muted-foreground";
  return "bg-blue-500/10 text-blue-500";
}

export default function ExplorePage() {
  const [tab, setTab] = useState<"memories" | "todos">("memories");
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [thoughtsRes, todosRes, statsRes] = await Promise.all([
        fetch("/api/thoughts?limit=100"),
        fetch("/api/todos?include_completed=true&limit=100"),
        fetch("/api/stats"),
      ]);
      if (thoughtsRes.ok) setThoughts(await thoughtsRes.json());
      if (todosRes.ok) setTodos(await todosRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const deleteThought = async (id: number) => {
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
  };

  const deleteTodo = async (id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
  };

  const filteredThoughts = thoughts.filter(
    (t) =>
      !search ||
      t.content.toLowerCase().includes(search.toLowerCase()) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase())),
  );

  const filteredTodos = todos.filter((t) => {
    if (!showCompleted && t.completed) return false;
    if (!search) return true;
    return t.title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <h1 className="font-semibold text-lg">Database Explorer</h1>
        </div>

        {/* Stats */}
        {stats && (
          <div className="max-w-4xl mx-auto px-6 pb-4 flex gap-6">
            <div className="flex items-center gap-2 text-sm">
              <BrainIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{stats.totalThoughts}</span>
              <span className="text-muted-foreground">memories</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckSquareIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{stats.activeTodos}</span>
              <span className="text-muted-foreground">active todos</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckIcon className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{stats.completedToday}</span>
              <span className="text-muted-foreground">done today</span>
            </div>
          </div>
        )}

        {/* Tabs + Search */}
        <div className="max-w-4xl mx-auto px-6 flex items-center gap-4 border-t border-border pt-3 pb-0">
          <div className="flex">
            <button
              onClick={() => setTab("memories")}
              className={cn(
                "py-2.5 px-1 text-sm font-medium border-b-2 mr-6 transition-colors",
                tab === "memories"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Memories ({thoughts.length})
            </button>
            <button
              onClick={() => setTab("todos")}
              className={cn(
                "py-2.5 px-1 text-sm font-medium border-b-2 transition-colors",
                tab === "todos"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Todos ({todos.length})
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3 pb-2">
            {tab === "todos" && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  className="rounded"
                />
                Show completed
              </label>
            )}
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring w-48 placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : tab === "memories" ? (
          filteredThoughts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <BrainIcon className="size-10 mb-3 opacity-20" />
              <p className="text-sm">{search ? "No memories match your search" : "No memories yet"}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredThoughts.map((thought) => (
                <li
                  key={thought.id}
                  className="group flex items-start gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{thought.content}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatDate(thought.created_at)}
                      </span>
                      {thought.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteThought(thought.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all shrink-0"
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : filteredTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <CheckSquareIcon className="size-10 mb-3 opacity-20" />
            <p className="text-sm">{search ? "No todos match your search" : "No todos yet"}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredTodos.map((todo) => (
              <li
                key={todo.id}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-border px-4 py-3 hover:bg-muted/30 transition-colors",
                  todo.completed && "opacity-50",
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {todo.completed ? (
                    <CheckIcon className="size-4 text-green-500" />
                  ) : (
                    <div className="size-4 rounded-full border border-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm leading-relaxed", todo.completed && "line-through")}>
                    {todo.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {formatDate(todo.created_at)}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", priorityBadge(todo.priority))}>
                      {todo.priority}
                    </span>
                    {todo.due_date && (
                      <span className="text-xs text-muted-foreground">due {todo.due_date}</span>
                    )}
                    {todo.completed_at && (
                      <span className="text-xs text-green-600">
                        ✓ {formatDate(todo.completed_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all shrink-0"
                >
                  <TrashIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
