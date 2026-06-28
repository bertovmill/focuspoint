"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckIcon, PlusIcon, CircleIcon, CalendarIcon, BrainIcon, ClockIcon, PencilIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { cn } from "@/lib/utils";

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
  if (p === "high") return "text-priority-high";
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

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTodo.trim();
    if (!title) return;
    setNewTodo("");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
    } catch {
      setNewTodo(title);
      toast.error("Couldn't add task. Try again.");
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
    const prevThoughts = thoughts;
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, content } : t)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/thoughts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setThoughts(prevThoughts);
      toast.error("Couldn't save note.");
    }
  };

  const handleDeleteThought = async (id: number) => {
    const prevThoughts = thoughts;
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/thoughts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Note deleted.");
    } catch {
      setThoughts(prevThoughts);
      toast.error("Couldn't delete note.");
    }
  };

  const handleComplete = async (id: number) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: true } : t)));
    try {
      const res = await fetch(`/api/todos/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error();
      setTimeout(() => setTodos((prev) => prev.filter((t) => t.id !== id)), 600);
    } catch {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: false } : t)));
      toast.error("Couldn't complete task.");
    }
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
  const filteredThoughts = tagFilter
    ? thoughts.filter((t) => t.tags?.includes(tagFilter))
    : thoughts;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CalendarIcon className="size-3" />
            <span>{today}</span>
          </div>
          <ModeToggle />
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
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "todos" | "notes")}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border px-5">
          <TabsList variant="line" className="h-auto gap-5 bg-transparent p-0">
            <TabsTrigger value="todos" className="flex-none rounded-none px-0 py-2.5">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-none rounded-none px-0 py-2.5">
              Notes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="todos" className="flex-1 overflow-y-auto px-5 py-4 pb-16 lg:pb-0">
            {/* Quick add */}
            <form onSubmit={handleAddTodo} className="flex gap-2 mb-5">
              <Input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add a task…"
                className="flex-1"
              />
              <Button type="submit" size="icon" aria-label="Add task">
                <PlusIcon className="size-4" />
              </Button>
            </form>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : activeTodos.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CheckIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>All done</EmptyTitle>
                  <EmptyDescription>Nothing on your list right now.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {activeTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-colors group"
                  >
                    <button
                      onClick={() => handleComplete(todo.id)}
                      className="mt-0.5 shrink-0 size-4 rounded-full border border-border group-hover:border-foreground/40 transition-colors flex items-center justify-center"
                    >
                      <CircleIcon className="size-2.5 opacity-0 group-hover:opacity-30 transition-opacity" />
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
                      <Badge
                        variant="outline"
                        className="shrink-0 border-priority-high/40 text-priority-high"
                      >
                        High
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </TabsContent>

        <TabsContent value="notes" className="flex-1 overflow-y-auto px-5 py-4 pb-16 lg:pb-0">
            {/* Tag filter bar */}
            {!loading && allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <Badge
                  asChild
                  variant={tagFilter === null ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  <button onClick={() => setTagFilter(null)}>All</button>
                </Badge>
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    asChild
                    variant={tagFilter === tag ? "default" : "outline"}
                    className="cursor-pointer"
                  >
                    <button onClick={() => setTagFilter(tag)}>{tag}</button>
                  </Badge>
                ))}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : thoughts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No notes yet</EmptyTitle>
                  <EmptyDescription>Share a thought with your agent to capture it.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : filteredThoughts.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No notes tagged &ldquo;{tagFilter}&rdquo;</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="space-y-3">
                {filteredThoughts.map((thought) => (
                  <Card key={thought.id} className="gap-0 rounded-lg px-3 py-2.5 shadow-none group">
                    {editingId === thought.id ? (
                      <div>
                        <Textarea
                          ref={editRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(thought.id); }
                            if (e.key === "Escape") cancelEdit();
                          }}
                          rows={3}
                          className="text-sm leading-relaxed border-0 shadow-none px-0 py-0 min-h-0 focus-visible:ring-0 dark:bg-transparent"
                        />
                        <div className="flex gap-2 mt-2">
                          <Button size="xs" onClick={() => saveEdit(thought.id)}>
                            Save
                          </Button>
                          <Button size="xs" variant="outline" onClick={cancelEdit}>
                            Cancel
                          </Button>
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
                            <Badge
                              key={tag}
                              asChild
                              variant={tagFilter === tag ? "default" : "secondary"}
                              className="cursor-pointer"
                            >
                              <button onClick={() => setTagFilter(tag)}>{tag}</button>
                            </Badge>
                          ))}
                          <div className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => startEdit(thought)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Edit note"
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-destructive"
                                  aria-label="Delete note"
                                >
                                  <TrashIcon className="size-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This can&rsquo;t be undone. The note will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteThought(thought.id)}
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </>
                    )}
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
