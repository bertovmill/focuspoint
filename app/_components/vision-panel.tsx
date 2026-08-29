"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CheckIcon, CircleIcon, PlusIcon, PencilIcon, TrashIcon, UploadIcon, SparklesIcon, TargetIcon, ImageIcon, TelescopeIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { usePolling } from "@/app/_components/use-polling";

interface VisionItem {
  id: number;
  kind: "statement" | "goal" | "image";
  title: string | null;
  content: string | null;
  image_url: string | null;
  horizon: "1yr" | "5yr" | "10yr" | "someday" | null;
  achieved: boolean;
  achieved_at: string | null;
  created_at: string;
}

const SECTIONS = [
  { key: "statements" as const, label: "Statements", icon: SparklesIcon },
  { key: "goals" as const, label: "Goals", icon: TargetIcon },
  { key: "board" as const, label: "Board", icon: ImageIcon },
];

const HORIZONS = [
  { key: "1yr" as const, label: "This year" },
  { key: "5yr" as const, label: "5 years" },
  { key: "10yr" as const, label: "10 years" },
  { key: "someday" as const, label: "Someday" },
];

export function VisionPanel() {
  const [items, setItems] = useState<VisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<(typeof SECTIONS)[number]["key"]>("statements");

  const [newStatementArea, setNewStatementArea] = useState("");
  const [newStatement, setNewStatement] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newGoalHorizon, setNewGoalHorizon] = useState<VisionItem["horizon"]>("1yr");
  const [newCaption, setNewCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editHorizon, setEditHorizon] = useState<VisionItem["horizon"]>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/vision");
      if (res.ok) setItems(await res.json());
    } catch {
      // silently fail — panel just stays as-is
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchItems);

  const createItem = async (body: Partial<VisionItem>) => {
    const res = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
    const row: VisionItem = await res.json();
    setItems((prev) => [row, ...prev]);
    return row;
  };

  const handleAddStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newStatement.trim();
    if (!content) return;
    setSaving(true);
    try {
      await createItem({ kind: "statement", title: newStatementArea.trim() || undefined, content });
      setNewStatement("");
      setNewStatementArea("");
    } catch {
      toast.error("Couldn't save statement. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newGoal.trim();
    if (!title) return;
    setSaving(true);
    try {
      await createItem({ kind: "goal", title, horizon: newGoalHorizon });
      setNewGoal("");
    } catch {
      toast.error("Couldn't save goal. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const { url } = await res.json();
      await createItem({ kind: "image", image_url: url, title: newCaption.trim() || undefined });
      setNewCaption("");
      toast.success("Added to your vision board.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleToggleAchieved = async (item: VisionItem) => {
    const achieved = !item.achieved;
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, achieved } : x)));
    try {
      const res = await fetch(`/api/vision/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achieved }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Couldn't update goal.");
    }
  };

  const startEdit = (item: VisionItem) => {
    setEditingId(item.id);
    setEditTitle(item.title ?? "");
    setEditContent(item.content ?? "");
    setEditHorizon(item.horizon);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
  };

  const saveEdit = async (item: VisionItem) => {
    if (item.kind === "statement" && !editContent.trim()) return;
    if (item.kind === "goal" && !editTitle.trim()) return;
    const patch = {
      title: editTitle.trim() || null,
      content: editContent.trim() || null,
      horizon: editHorizon,
    };
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    setEditingId(null);
    try {
      const res = await fetch(`/api/vision/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Couldn't save changes.");
    }
  };

  const handleDelete = async (id: number) => {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/vision/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Removed.");
    } catch {
      setItems(prev);
      toast.error("Couldn't remove item.");
    }
  };

  const statements = items.filter((i) => i.kind === "statement");
  const goals = items.filter((i) => i.kind === "goal");
  const images = items.filter((i) => i.kind === "image");

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <Badge
            key={key}
            asChild
            variant={section === key ? "default" : "outline"}
            className="tap-target cursor-pointer gap-1"
          >
            <button type="button" onClick={() => setSection(key)}>
              <Icon className="size-3" />
              {label}
            </button>
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Statements */}
          {section === "statements" && (
            <div>
              <form onSubmit={handleAddStatement} className="flex flex-col gap-2 mb-5">
                <Input
                  value={newStatementArea}
                  onChange={(e) => setNewStatementArea(e.target.value)}
                  placeholder="Area (optional) — e.g. Career, Health…"
                />
                <Textarea
                  value={newStatement}
                  onChange={(e) => setNewStatement(e.target.value)}
                  placeholder="Write a vision statement — where you're headed and why…"
                  rows={3}
                />
                <Button type="submit" disabled={saving || !newStatement.trim()} className="self-start">
                  {saving ? <Spinner className="size-3.5 mr-2" /> : <PlusIcon className="size-3.5 mr-2" />}
                  Add statement
                </Button>
              </form>

              {statements.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <TelescopeIcon className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>No vision statements yet</EmptyTitle>
                    <EmptyDescription>Write down where you&rsquo;re headed — Cael will hold you to it.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {statements.map((s) => (
                    <Card key={s.id} className="gap-0 rounded-lg px-4 py-3 shadow-none group">
                      {editingId === s.id ? (
                        <div>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Area (optional)"
                            className="mb-2"
                          />
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(s); }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            rows={3}
                          />
                          <div className="flex gap-2 mt-2">
                            <Button size="xs" onClick={() => saveEdit(s)}>Save</Button>
                            <Button size="xs" variant="outline" onClick={cancelEdit}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {s.title && (
                            <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">{s.title}</p>
                          )}
                          <p className="text-sm leading-relaxed break-words">{s.content}</p>
                          <div className="flex justify-end gap-0.5 touch:gap-2 mt-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => startEdit(s)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Edit statement"
                            >
                              <PencilIcon className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDelete(s.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Delete statement"
                            >
                              <TrashIcon className="size-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Goals */}
          {section === "goals" && (
            <div>
              <form onSubmit={handleAddGoal} className="flex flex-col gap-2 mb-5">
                <div className="flex gap-2">
                  <Input
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    placeholder="Add a long-term goal…"
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={saving} aria-label="Add goal">
                    <PlusIcon className="size-4" />
                  </Button>
                </div>
                {newGoal.trim() && (
                  <div className="flex items-center gap-1.5">
                    <TargetIcon className="size-3 text-muted-foreground shrink-0" />
                    {HORIZONS.map((h) => (
                      <Badge
                        key={h.key}
                        asChild
                        variant={newGoalHorizon === h.key ? "default" : "outline"}
                        className="cursor-pointer"
                      >
                        <button type="button" onClick={() => setNewGoalHorizon(h.key)}>{h.label}</button>
                      </Badge>
                    ))}
                  </div>
                )}
              </form>

              {goals.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <TargetIcon className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>No long-term goals yet</EmptyTitle>
                    <EmptyDescription>Add goals for this year, 5 years, 10 years, or someday.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-5">
                  {HORIZONS.map(({ key, label }) => {
                    const horizonGoals = goals.filter((g) => (g.horizon ?? "someday") === key);
                    if (horizonGoals.length === 0) return null;
                    return (
                      <div key={key}>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                          {label}
                        </p>
                        <ul className="space-y-1.5">
                          {horizonGoals.map((g) =>
                            editingId === g.id ? (
                              <li key={g.id} className="rounded-lg px-2 py-2.5 bg-muted/40">
                                <Input
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveEdit(g);
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  className="mb-2"
                                />
                                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                  {HORIZONS.map((h) => (
                                    <Badge
                                      key={h.key}
                                      asChild
                                      variant={editHorizon === h.key ? "default" : "outline"}
                                      className="cursor-pointer"
                                    >
                                      <button type="button" onClick={() => setEditHorizon(h.key)}>{h.label}</button>
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <Button size="xs" onClick={() => saveEdit(g)}>Save</Button>
                                  <Button size="xs" variant="outline" onClick={cancelEdit}>Cancel</Button>
                                </div>
                              </li>
                            ) : (
                              <li
                                key={g.id}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40 transition-colors group",
                                  g.achieved && "opacity-60",
                                )}
                              >
                                <button
                                  onClick={() => handleToggleAchieved(g)}
                                  title={g.achieved ? "Mark not achieved" : "Mark achieved"}
                                  className={cn(
                                    "mt-0.5 shrink-0 size-4 rounded-full border transition-colors flex items-center justify-center",
                                    g.achieved
                                      ? "bg-primary border-primary"
                                      : "border-border group-hover:border-primary/60",
                                  )}
                                >
                                  {g.achieved ? (
                                    <CheckIcon className="size-2.5 text-primary-foreground" />
                                  ) : (
                                    <CircleIcon className="size-2.5 text-primary opacity-0 group-hover:opacity-40 touch:opacity-40 transition-opacity" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm leading-snug", g.achieved && "line-through text-muted-foreground")}>
                                    {g.title}
                                  </p>
                                  {g.content && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{g.content}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => startEdit(g)}
                                  className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                  aria-label="Edit goal"
                                >
                                  <PencilIcon className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(g.id)}
                                  className="tap-target shrink-0 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                  aria-label="Delete goal"
                                >
                                  <TrashIcon className="size-3.5" />
                                </button>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Board */}
          {section === "board" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
              <Input
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                placeholder="Caption for the next image (optional)…"
                className="mb-2"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleUpload(file);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors mb-5",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                  uploading && "pointer-events-none opacity-60",
                )}
              >
                {uploading ? (
                  <Spinner className="size-5 text-primary" />
                ) : (
                  <UploadIcon className="size-5 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium">{uploading ? "Uploading…" : "Add an image to your vision board"}</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · max 5 MB</p>
                </div>
              </div>

              {images.length === 0 ? (
                <Empty className="py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ImageIcon className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>Your board is empty</EmptyTitle>
                    <EmptyDescription>Upload images of the life you&rsquo;re building toward.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {images.map((img) => (
                    <div key={img.id} className="group relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.image_url ?? ""}
                        alt={img.title ?? "Vision board image"}
                        className="aspect-square w-full object-cover"
                      />
                      {img.title && (
                        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white">
                          {img.title}
                        </p>
                      )}
                      <button
                        onClick={() => handleDelete(img.id)}
                        className="tap-target absolute top-1.5 right-1.5 rounded-md bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity hover:bg-black/70"
                        aria-label="Remove image"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
