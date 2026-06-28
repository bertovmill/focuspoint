"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckIcon, PlusIcon, CircleIcon, CalendarIcon, BrainIcon, ClockIcon, PencilIcon, TrashIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  created_at: string;
}

interface Thought {
  id: number;
  content: string;
  tags: string[];
  created_at: string;
  score?: number;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function priorityColor(p: string) {
  if (p === "high") return "text-red-500";
  if (p === "low") return "text-muted-foreground";
  return "text-foreground";
}

export function Dashboard({ activeTab: controlledTab }: { activeTab?: "todos" | "notes" }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"todos" | "notes">(controlledTab ?? "todos");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<Thought[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (controlledTab) setActiveTab(controlledTab);
  }, [controlledTab]);

  const fetchData = useCallback(async () => {
    try {
      const [todosRes, thoughtsRes] = await Promise.all([
        fetch("/api/todos"),
        fetch("/api/thoughts"),
      ]);
      if (todosRes.ok) setTodos(await todosRes.json());
      if (thoughtsRes.ok) setThoughts(await thoughtsRes.json());
    } catch {
      // silently fail — agent can still be used
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Debounced semantic search: when the user types a query, search notes by
  // meaning via the embeddings API rather than exact text/tag match.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSemanticResults(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (tagFilter) params.set("tag", tagFilter);
        const res = await fetch(`/api/thoughts/semantic-search?${params}`);
        if (!res.ok) throw new Error("search failed");
        setSemanticResults(await res.json());
      } catch {
        setSearchError(true);
        setSemanticResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, tagFilter]);

  const clearSearch = () => {
    setQuery("");
    setSemanticResults(null);
    setSearchError(false);
  };

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTodo.trim();
    if (!title) return;
    setNewTodo("");
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
    }
  };

  const startEdit = (thought: Thought) => {
    setEditingId(thought.id);
    setEditContent(thought.content);
    setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const saveEdit = async (id: number) => {
    const content = editContent.trim();
    if (!content) return;
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, content } : t)));
    setEditingId(null);
    await fetch(`/api/thoughts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };

  const handleDeleteThought = async (id: number) => {
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
  };

  const handleComplete = async (id: number) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: true } : t)));
    await fetch(`/api/todos/${id}/complete`, { method: "POST" });
    setTimeout(() => setTodos((prev) => prev.filter((t) => t.id !== id)), 600);
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const activeTodos = todos.filter((t) => !t.completed);
  const highPriority = activeTodos.filter((t) => t.priority === "high");

  const allTags = Array.from(
    new Set(thoughts.flatMap((t) => t.tags ?? [])),
  ).sort();
  const searchActive = query.trim().length > 0;
  const displayedThoughts = searchActive
    ? semanticResults ?? []
    : tagFilter
      ? thoughts.filter((t) => t.tags?.includes(tagFilter))
      : thoughts;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <CalendarIcon className="size-3" />
          <span>{today}</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Cael</h1>
        {!loading && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeTodos.length === 0
              ? "All clear — nothing on your list"
              : `${activeTodos.length} task${activeTodos.length !== 1 ? "s" : ""}${highPriority.length > 0 ? `, ${highPriority.length} high priority` : ""}`}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-5">
        <button
          onClick={() => setActiveTab("todos")}
          className={cn(
            "py-2.5 text-sm font-medium border-b-2 mr-5 transition-colors",
            activeTab === "todos"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={cn(
            "py-2.5 text-sm font-medium border-b-2 transition-colors",
            activeTab === "notes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Notes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-16 lg:pb-0">
        {activeTab === "todos" ? (
          <div className="px-5 py-4">
            {/* Quick add */}
            <form onSubmit={handleAddTodo} className="flex gap-2 mb-5">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add a task…"
                className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-80 transition-opacity"
              >
                <PlusIcon className="size-4" />
              </button>
            </form>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : activeTodos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <CheckIcon className="size-8 mb-3 opacity-30" />
                <p className="text-sm">All done</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {activeTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-colors group"
                  >
                    <button
                      onClick={() => handleComplete(todo.id)}
                      className="mt-0.5 shrink-0 size-4 rounded-full border border-border group-hover:border-primary/60 transition-colors flex items-center justify-center"
                    >
                      <CircleIcon className="size-2.5 text-primary opacity-0 group-hover:opacity-40 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", priorityColor(todo.priority))}>
                        {todo.title}
                      </p>
                      {todo.due_date && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <ClockIcon className="size-3" />
                          {formatDate(todo.due_date)}
                        </p>
                      )}
                    </div>
                    {todo.priority === "high" && (
                      <span className="shrink-0 text-xs text-red-500 font-medium">!</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* Semantic search box */}
            {!loading && thoughts.length > 0 && (
              <InputGroup className="mb-3">
                {searching ? (
                  <InputGroupAddon>
                    <Spinner />
                  </InputGroupAddon>
                ) : (
                  <InputGroupAddon>
                    <SparklesIcon />
                  </InputGroupAddon>
                )}
                <InputGroupInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes by meaning…"
                />
                {searchActive && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            )}

            {/* Tag filter bar — stays active during search to narrow results by tag */}
            {!loading && allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => setTagFilter(null)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    tagFilter === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
                  )}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full border transition-colors",
                      tagFilter === tag
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : thoughts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <BrainIcon className="size-8 mb-3 opacity-30" />
                <p className="text-sm">No notes yet</p>
                <p className="text-xs mt-1">Share a thought with your agent to capture it</p>
              </div>
            ) : searchActive && searchError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <SparklesIcon className="size-8 mb-3 opacity-30" />
                <p className="text-sm">Semantic search is unavailable</p>
                <p className="text-xs mt-1">Try again, or filter by tag instead</p>
              </div>
            ) : searchActive && searching && displayedThoughts.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : displayedThoughts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <BrainIcon className="size-8 mb-3 opacity-30" />
                <p className="text-sm">
                  {searchActive
                    ? `No notes match "${query.trim()}"`
                    : `No notes tagged "${tagFilter}"`}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {displayedThoughts.map((thought) => (
                  <li key={thought.id} className="rounded-lg border border-border px-3 py-2.5 group">
                    {editingId === thought.id ? (
                      <div>
                        <textarea
                          ref={editRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(thought.id); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          rows={3}
                          className="w-full text-sm leading-relaxed bg-transparent outline-none resize-none"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => saveEdit(thought.id)}
                            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-80 transition-opacity"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{thought.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(thought.created_at)}
                          </span>
                          {thought.tags?.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => setTagFilter(tag)}
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded transition-colors",
                                tagFilter === tag
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/20",
                              )}
                            >
                              {tag}
                            </button>
                          ))}
                          <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(thought)}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <PencilIcon className="size-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteThought(thought.id)}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                              title="Delete"
                            >
                              <TrashIcon className="size-3" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
