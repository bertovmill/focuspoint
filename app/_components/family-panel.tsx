"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TrashIcon, UploadIcon, HeartIcon, PencilIcon, CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { usePolling } from "@/app/_components/use-polling";

export interface Memory {
  id: number;
  title: string | null;
  description: string | null;
  image_url: string | null;
  memory_date: string;
  created_at: string;
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatMemoryDate(dateStr: string) {
  // memory_date comes back as either "YYYY-MM-DD" or a full ISO timestamp
  // (the neon driver serializes DATE columns as midnight-UTC timestamps).
  // Take just the date part and parse as local, not UTC, so it doesn't shift a day.
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function FamilyPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState(todayDateInput);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (res.ok) setMemories(await res.json());
    } catch {
      // silently fail — panel just stays as-is
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchMemories, 60_000);

  const resetForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewDate(todayDateInput());
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
      const createRes = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: url,
          title: newTitle.trim() || undefined,
          description: newDescription.trim() || undefined,
          memory_date: newDate,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to save memory");
      const row: Memory = await createRes.json();
      setMemories((prev) => [row, ...prev]);
      resetForm();
      toast.success("Memory added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveWithoutPhoto = async () => {
    if (!newTitle.trim() && !newDescription.trim()) {
      toast.error("Add a title or description first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || undefined,
          description: newDescription.trim() || undefined,
          memory_date: newDate,
        }),
      });
      if (!res.ok) throw new Error("Failed to save memory");
      const row: Memory = await res.json();
      setMemories((prev) => [row, ...prev]);
      resetForm();
      toast.success("Memory added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save memory");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const prev = memories;
    setMemories((xs) => xs.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Removed.");
    } catch {
      setMemories(prev);
      toast.error("Couldn't remove memory.");
    }
  };

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditTitle(m.title ?? "");
    setEditDescription(m.description ?? "");
    setEditDate(m.memory_date.slice(0, 10));
    setEditImageUrl(m.image_url);
  };

  const cancelEdit = () => setEditingId(null);

  const handleEditPhotoChange = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setEditUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      setEditImageUrl(url);
    } catch {
      toast.error("Upload failed");
    } finally {
      setEditUploadingPhoto(false);
    }
  };

  const saveEdit = async (m: Memory) => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/memories/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || undefined,
          description: editDescription.trim() || undefined,
          image_url: editImageUrl,
          memory_date: editDate,
        }),
      });
      if (!res.ok) throw new Error();
      const row: Memory = await res.json();
      setMemories((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      setEditingId(null);
      toast.success("Memory updated.");
    } catch {
      toast.error("Couldn't save changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
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
      <div className="flex flex-col gap-2 mb-2">
        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title (optional)…" />
        <Textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Description (optional)…"
          rows={2}
        />
        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
      </div>
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? <Spinner className="size-5 text-primary" /> : <UploadIcon className="size-5 text-muted-foreground" />}
        <div className="text-center">
          <p className="text-sm font-medium">{uploading ? "Uploading…" : "Add a photo (optional)"}</p>
          <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · max 5 MB</p>
        </div>
      </div>
      <Button
        onClick={handleSaveWithoutPhoto}
        disabled={saving || uploading || (!newTitle.trim() && !newDescription.trim())}
        variant="secondary"
        size="sm"
        className="mt-2 w-full"
      >
        {saving ? <Spinner className="size-3.5" /> : "Save memory without a photo"}
      </Button>

      <div className="mt-5">
        {memories.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HeartIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>No memories yet</EmptyTitle>
              <EmptyDescription>Add the moments worth keeping — a photo isn't required.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {memories.map((m) => {
              const isEditing = editingId === m.id;

              if (isEditing) {
                return (
                  <div key={m.id} className="col-span-2 flex flex-col gap-2 rounded-lg border border-border p-3">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleEditPhotoChange(file);
                        e.target.value = "";
                      }}
                    />
                    {editImageUrl ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={editImageUrl} alt="" className="h-40 w-full rounded-md object-cover" />
                        <button
                          onClick={() => setEditImageUrl(null)}
                          className="absolute top-1.5 right-1.5 rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
                          aria-label="Remove photo"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={editUploadingPhoto}
                        className="flex h-20 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30"
                      >
                        {editUploadingPhoto ? <Spinner className="size-4" /> : <UploadIcon className="size-4" />}
                        {editUploadingPhoto ? "Uploading…" : "Add a photo"}
                      </button>
                    )}
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title…" />
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description…"
                      rows={2}
                    />
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-40" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(m)} disabled={savingEdit}>
                        {savingEdit ? <Spinner className="size-3.5" /> : <CheckIcon className="size-3.5" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                        <XIcon className="size-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="group relative overflow-hidden rounded-lg border border-border">
                  {m.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image_url} alt={m.title ?? "Family memory"} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-muted/40">
                      <HeartIcon className="size-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <>
                      <div
                        className={cn(
                          "absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6",
                          m.image_url ? "bg-gradient-to-t from-black/70 to-transparent text-white" : "text-foreground",
                        )}
                      >
                        {m.title && <p className="text-xs font-medium">{m.title}</p>}
                        {m.description && <p className="text-[11px] opacity-90 line-clamp-2">{m.description}</p>}
                        <p className={cn("text-[10px] mt-0.5", m.image_url ? "opacity-75" : "text-muted-foreground")}>
                          {formatMemoryDate(m.memory_date)}
                        </p>
                      </div>
                      <div className="absolute top-1.5 right-1.5 flex gap-1 touch:gap-2 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(m)}
                          className="tap-target rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
                          aria-label="Edit memory"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="tap-target rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
                          aria-label="Remove memory"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                    </>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
