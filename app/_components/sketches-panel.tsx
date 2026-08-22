"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { BrushIcon, DownloadIcon, TrashIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import "@excalidraw/excalidraw/index.css";

// Excalidraw touches window/document at module scope, so it can't be server-rendered.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

interface Sketch {
  id: number;
  title: string;
  image_data: string;
  created_at: string;
  updated_at: string;
  has_scene?: boolean;
}

// The persisted document. appState is deliberately a small whitelist — the full appState
// carries transient junk (and a `collaborators` Map that doesn't survive JSON).
interface Scene {
  elements: readonly ExcalidrawElement[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null };
  files: BinaryFiles;
}

const AUTOSAVE_MS = 1500;

export function SketchesPanel() {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  // Bumped on every edit so the debounce effect re-arms even when `dirty` was already true.
  const [editVersion, setEditVersion] = useState(0);

  const { resolvedTheme } = useTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors so the debounced save always reads current values without re-arming the timer.
  const editingIdRef = useRef<number | null>(null);
  const titleRef = useRef("");
  editingIdRef.current = editingId;
  titleRef.current = title;

  const loadSketches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sketches");
      if (res.ok) setSketches(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSketches();
  }, [loadSketches]);

  const cancelPendingSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const autoSave = useCallback(async () => {
    if (!api) return;
    const elements = api.getSceneElements();
    // Nothing drawn yet — don't create an empty row just because the canvas was touched.
    if (elements.length === 0) return;
    setSaving(true);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const appState = api.getAppState();
      const files = api.getFiles();
      const blob = await exportToBlob({
        elements,
        appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
        files,
        mimeType: "image/png",
        // A gallery thumbnail, not the source of truth — the scene JSON is.
        maxWidthOrHeight: 640,
      });
      const image_data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const scene: Scene = {
        elements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize },
        files,
      };
      const body = JSON.stringify({ title: titleRef.current.trim() || "Untitled", image_data, scene });
      const currentId = editingIdRef.current;
      const res = currentId
        ? await fetch(`/api/sketches/${currentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/sketches", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error();
      const saved: Sketch = await res.json();
      if (!currentId) setEditingId(saved.id);
      setDirty(false);
      setSketches((prev) => {
        const rest = prev.filter((s) => s.id !== saved.id);
        return [saved, ...rest];
      });
    } catch {
      toast.error("Failed to save sketch");
    } finally {
      setSaving(false);
    }
  }, [api]);

  // Debounced autosave, ~1.5s after the last edit. Keyed on editVersion so consecutive
  // edits keep pushing the timer out rather than saving mid-stroke.
  useEffect(() => {
    if (editVersion === 0) return;
    cancelPendingSave();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      autoSave();
    }, AUTOSAVE_MS);
    return cancelPendingSave;
  }, [editVersion, autoSave, cancelPendingSave]);

  // Excalidraw fires onChange for pure viewport moves (pan/zoom/selection) too, so compare
  // the element version to avoid marking the sketch dirty when nothing actually changed.
  const lastElementsRef = useRef<readonly ExcalidrawElement[]>([]);
  const handleChange = useCallback((elements: readonly ExcalidrawElement[]) => {
    const prev = lastElementsRef.current;
    const changed =
      prev.length !== elements.length || elements.some((el, i) => prev[i] !== el);
    lastElementsRef.current = elements;
    if (!changed || elements.length === 0) return;
    setDirty(true);
    setEditVersion((v) => v + 1);
  }, []);

  const resetCanvas = useCallback(() => {
    cancelPendingSave();
    api?.resetScene();
    lastElementsRef.current = [];
    setTitle("");
    setEditingId(null);
    setDirty(false);
  }, [api, cancelPendingSave]);

  const handleEdit = useCallback(
    async (sketch: Sketch) => {
      if (!api) return;
      cancelPendingSave();
      try {
        const res = await fetch(`/api/sketches/${sketch.id}`);
        if (!res.ok) throw new Error();
        const full: Sketch & { scene: Scene | null } = await res.json();
        api.resetScene();
        if (full.scene?.elements) {
          if (full.scene.files) api.addFiles(Object.values(full.scene.files));
          api.updateScene({
            elements: full.scene.elements as ExcalidrawElement[],
            appState: { viewBackgroundColor: full.scene.appState?.viewBackgroundColor ?? "#ffffff" },
          });
        } else {
          // Pre-Excalidraw sketch: it only exists as flat pixels, so bring it in as an
          // image element. It can be moved/resized/drawn over, just not un-flattened.
          const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
          const dims = await new Promise<{ w: number; h: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve({ w: 1200, h: 900 });
            img.src = full.image_data;
          });
          const fileId = `legacy-${sketch.id}` as never;
          api.addFiles([
            { id: fileId, dataURL: full.image_data as never, mimeType: "image/png" as never, created: Date.now() },
          ]);
          api.updateScene({
            elements: convertToExcalidrawElements([
              { type: "image", fileId, x: 0, y: 0, width: dims.w, height: dims.h },
            ]),
          });
        }
        lastElementsRef.current = api.getSceneElements();
        api.scrollToContent(api.getSceneElements(), { fitToContent: true });
        setTitle(full.title);
        setEditingId(full.id);
        setDirty(false);
      } catch {
        toast.error("Failed to open sketch");
      }
    },
    [api, cancelPendingSave],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/sketches/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSketches((prev) => prev.filter((s) => s.id !== id));
        if (editingId === id) resetCanvas();
        toast.success("Sketch deleted");
      } else {
        toast.error("Failed to delete sketch");
      }
    },
    [editingId, resetCanvas],
  );

  const handleDownload = useCallback((sketch: Sketch) => {
    const a = document.createElement("a");
    a.href = sketch.image_data;
    a.download = `${sketch.title.replace(/[^a-z0-9-_ ]/gi, "") || "sketch"}.png`;
    a.click();
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-y-auto">
      {/* Title + autosave status */}
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (editingId !== null) setEditVersion((v) => v + 1);
          }}
          placeholder="Sketch title…"
          className="h-9 max-w-xs font-medium"
        />
        <span className="text-xs text-muted-foreground min-w-16">
          {saving ? (
            <span className="flex items-center gap-1.5">
              <Spinner className="size-3" />
              Saving…
            </span>
          ) : dirty ? (
            "Unsaved"
          ) : editingId ? (
            "Saved"
          ) : null}
        </span>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={resetCanvas}>
          <XIcon className="size-3.5" />
          New sketch
        </Button>
      </div>

      {/* Excalidraw owns its own toolbar, shortcuts, zoom and infinite canvas. Full-bleed:
          negative margins cancel the panel padding so it runs edge-to-edge. */}
      <div className="-mx-4 mb-2 h-[calc(100%-5rem)] min-h-[24rem] w-[calc(100%+2rem)] shrink-0 overflow-hidden lg:mb-0">
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={handleChange}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          initialData={{ appState: { viewBackgroundColor: "#ffffff" } }}
          UIOptions={{ canvasActions: { loadScene: false } }}
        />
      </div>

      {/* Saved sketches */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Saved sketches</h3>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : sketches.length === 0 ? (
          <Empty className="border border-dashed border-border rounded-xl py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrushIcon />
              </EmptyMedia>
              <EmptyTitle>No sketches yet</EmptyTitle>
              <EmptyDescription>Draw something above — it saves itself.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sketches.map((sketch) => (
              <Card key={sketch.id} className="group overflow-hidden p-0 gap-0">
                <button onClick={() => handleEdit(sketch)} className="block w-full" aria-label={`Edit ${sketch.title}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sketch.image_data} alt={sketch.title} className="aspect-[4/3] w-full object-cover bg-white" />
                </button>
                <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{sketch.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(sketch.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(sketch)} aria-label="Download PNG">
                      <DownloadIcon className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label="Delete sketch">
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{sketch.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>This permanently deletes the sketch.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(sketch.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
