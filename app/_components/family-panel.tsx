"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { TrashIcon, UploadIcon, HeartIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface Memory {
  id: number;
  title: string | null;
  description: string | null;
  image_url: string;
  created_at: string;
}

export function FamilyPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchMemories();
    const interval = setInterval(fetchMemories, 15000);
    return () => clearInterval(interval);
  }, [fetchMemories]);

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
        body: JSON.stringify({ image_url: url, title: newTitle.trim() || undefined, description: newDescription.trim() || undefined }),
      });
      if (!createRes.ok) throw new Error("Failed to save memory");
      const row: Memory = await createRes.json();
      setMemories((prev) => [row, ...prev]);
      setNewTitle("");
      setNewDescription("");
      toast.success("Memory added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors mb-5",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? <Spinner className="size-5 text-primary" /> : <UploadIcon className="size-5 text-muted-foreground" />}
        <div className="text-center">
          <p className="text-sm font-medium">{uploading ? "Uploading…" : "Add a family memory"}</p>
          <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · max 5 MB</p>
        </div>
      </div>

      {memories.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HeartIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No memories yet</EmptyTitle>
            <EmptyDescription>Upload photos of the moments worth keeping.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {memories.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.image_url} alt={m.title ?? "Family memory"} className="aspect-square w-full object-cover" />
              {(m.title || m.description) && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-white">
                  {m.title && <p className="text-xs font-medium">{m.title}</p>}
                  {m.description && <p className="text-[11px] opacity-90 line-clamp-2">{m.description}</p>}
                </div>
              )}
              <button
                onClick={() => handleDelete(m.id)}
                className="absolute top-1.5 right-1.5 rounded-md bg-black/50 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                aria-label="Remove memory"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
