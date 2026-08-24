"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpenIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Minimal styling for the handful of markdown elements a pasted chapter is likely
// to use — headings, bold/italic, lists, paragraphs. Keeping the source as plain
// markdown text (not HTML) also means Cael can read/parse it cleanly via the API.
const markdownComponents = {
  h1: ({ className, ...props }: React.ComponentProps<"h1">) => (
    <h1 className={cn("mt-4 mb-2 text-lg font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }: React.ComponentProps<"h2">) => (
    <h2 className={cn("mt-4 mb-1.5 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }: React.ComponentProps<"h3">) => (
    <h3 className={cn("mt-3 mb-1 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  p: ({ className, ...props }: React.ComponentProps<"p">) => (
    <p className={cn("my-2 leading-relaxed first:mt-0 last:mb-0", className)} {...props} />
  ),
  strong: ({ className, ...props }: React.ComponentProps<"strong">) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  ul: ({ className, ...props }: React.ComponentProps<"ul">) => (
    <ul className={cn("my-2 ms-5 list-disc [&>li]:mt-0.5", className)} {...props} />
  ),
  ol: ({ className, ...props }: React.ComponentProps<"ol">) => (
    <ol className={cn("my-2 ms-5 list-decimal [&>li]:mt-0.5", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: React.ComponentProps<"blockquote">) => (
    <blockquote className={cn("my-2 border-s-2 border-muted-foreground/30 ps-3 text-muted-foreground", className)} {...props} />
  ),
  hr: ({ className, ...props }: React.ComponentProps<"hr">) => (
    <hr className={cn("my-3 border-muted-foreground/20", className)} {...props} />
  ),
};

interface Chapter {
  id: number;
  title: string | null;
  content: string | null;
  created_at: string;
}

// A place to paste reference text verbatim — book chapters, essays, notes — so it
// lands exactly as written instead of going through a model that might not
// reproduce it faithfully. Reuses the vision_items table with kind="chapter".
export function ManualPanel() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch("/api/vision?kind=chapter");
      if (res.ok) setChapters(await res.json());
    } catch {
      // silently fail — panel just stays as-is
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chapter", title, content }),
      });
      if (!res.ok) throw new Error();
      const row: Chapter = await res.json();
      setChapters((prev) => [row, ...prev]);
      setNewTitle("");
      setNewContent("");
      toast.success("Saved to the manual.");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: Chapter) => {
    setEditingId(c.id);
    setEditTitle(c.title ?? "");
    setEditContent(c.content ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
  };

  const saveEdit = async (c: Chapter) => {
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) return;
    const prev = chapters;
    setChapters((xs) => xs.map((x) => (x.id === c.id ? { ...x, title, content } : x)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/vision/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setChapters(prev);
      toast.error("Couldn't save changes.");
    }
  };

  const handleDelete = async (id: number) => {
    const prev = chapters;
    setChapters((xs) => xs.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/vision/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Removed.");
    } catch {
      setChapters(prev);
      toast.error("Couldn't remove item.");
    }
  };

  return (
    <div>
      <form onSubmit={handleAdd} className="flex flex-col gap-2 mb-5">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Source — e.g. 'Craft — Robin, The 8 Forms of Wealth'"
        />
        <Textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={"Paste the full text here… Markdown supported: # Heading, **bold**, - list item"}
          rows={14}
          className="font-mono text-xs"
        />
        <Button type="submit" disabled={saving || !newTitle.trim() || !newContent.trim()} className="self-start">
          {saving ? <Spinner className="size-3.5 mr-2" /> : <PlusIcon className="size-3.5 mr-2" />}
          Save to the manual
        </Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : chapters.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>Nothing saved yet</EmptyTitle>
            <EmptyDescription>Paste in reference text — book chapters, essays, notes. Markdown headings and bold are supported.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {chapters.map((c) => {
            const isExpanded = expandedId === c.id;
            const isEditing = editingId === c.id;
            return (
              <Card key={c.id} className="gap-0 rounded-lg px-4 py-3 shadow-none group">
                {isEditing ? (
                  <div>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Source"
                      className="mb-2"
                    />
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={14}
                      className="font-mono text-xs"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button size="xs" onClick={() => saveEdit(c)}>Save</Button>
                      <Button size="xs" variant="outline" onClick={cancelEdit}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <p className="text-sm font-medium">{c.title}</p>
                      {isExpanded ? (
                        <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="text-sm mt-2 break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {c.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    <div className="flex justify-end gap-0.5 touch:gap-2 mt-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startEdit(c)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Edit"
                      >
                        <PencilIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(c.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
