"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ImagePlusIcon, NotebookPenIcon, TagIcon, TrashIcon, XIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { uploadPhoto } from "@/lib/upload-photo";

// The Notes tab, laid out like Apple Notes (Berto, 2026-10-06): notes grouped by
// date in inset cards, each row a bold title + date + preview + photo thumbnail,
// and a note opens into its own page — beside the list on desktop, over it on a
// phone — where the first line reads as a title and tapping the text edits it.

export interface Note {
  id: number;
  content: string;
  tags: string[];
  image_url?: string | null;
  created_at: string;
  score?: number;
}

export type NotePatch = { content: string; image_url: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Apple's buckets: Today, Yesterday, Previous 7/30 Days, then months, then years. */
function groupLabel(iso: string, today: number) {
  const d = new Date(iso);
  const t = d.getTime();
  if (t >= today) return "Today";
  if (t >= today - DAY_MS) return "Yesterday";
  if (t >= today - 7 * DAY_MS) return "Previous 7 Days";
  if (t >= today - 30 * DAY_MS) return "Previous 30 Days";
  if (d.getFullYear() === new Date(today).getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long" });
  }
  return String(d.getFullYear());
}

/** The date beside the preview: a time today, a weekday this week, else the date. */
function rowDate(iso: string, today: number) {
  const d = new Date(iso);
  const t = d.getTime();
  if (t >= today) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (t >= today - DAY_MS) return "Yesterday";
  if (t >= today - 6 * DAY_MS) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
}

/** Markdown bits that read as noise in a one-line title or preview. */
function plain(line: string) {
  return line
    .replace(/^#+\s+/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\*\*|__/g, "")
    .trim();
}

/**
 * Title = the first line. Most notes Cael captures are one long paragraph, so with
 * no second line the first sentence becomes the title and the rest the preview,
 * rather than a title that's the whole note and "No additional text".
 */
export function noteTitleAndPreview(content: string) {
  const lines = content.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { title: "Photo", preview: "" };
  let title = plain(lines[0]);
  let preview = lines.slice(1).map(plain).join(" ");
  if (!preview) {
    const sentence = title.match(/^(.{8,100}?[.!?])\s+(.+)$/);
    // No short first sentence: break at a word so the preview line carries on
    // where the title stops, like a two-line clamp.
    const words = sentence ? null : title.length > 60 ? title.match(/^(.{20,55})\s+(.+)$/) : null;
    if (sentence) {
      title = sentence[1];
      preview = sentence[2];
    } else if (words) {
      title = `${words[1]}…`;
      preview = words[2];
    }
  }
  return { title, preview };
}

export function NotesList({
  notes,
  grouped,
  selectedId,
  onOpen,
}: {
  notes: Note[];
  /** False for search results: those are ordered by relevance, not date. */
  grouped: boolean;
  selectedId: number | null;
  onOpen: (id: number) => void;
}) {
  const today = startOfToday();
  const groups: { label: string; notes: Note[] }[] = [];
  if (!grouped) {
    groups.push({ label: "Top Results", notes });
  } else {
    for (const note of notes) {
      const label = groupLabel(note.created_at, today);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.notes.push(note);
      else groups.push({ label, notes: [note] });
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-1.5 px-1 text-lg font-bold tracking-tight">{group.label}</h2>
          <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-border/60">
            {group.notes.map((note, i) => {
              const { title, preview } = noteTitleAndPreview(note.content);
              const selected = note.id === selectedId;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onOpen(note.id)}
                  className={cn(
                    "flex w-full items-center gap-3 pl-4 text-left transition-colors",
                    selected ? "bg-primary/15" : "hover:bg-muted/60 active:bg-muted",
                  )}
                >
                  {/* Inset divider: starts at the text, not the card edge. */}
                  <div className={cn("flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4", i > 0 && "border-t border-border/70")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-snug">{title}</p>
                      <p className="mt-0.5 truncate text-[13px] leading-snug">
                        <span className="text-foreground/80">{rowDate(note.created_at, today)}</span>
                        <span className="ml-2 text-muted-foreground">{preview || "No additional text"}</span>
                      </p>
                      {note.tags?.length > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <TagIcon className="size-3 shrink-0" />
                          <span className="truncate">{note.tags.join(", ")}</span>
                        </p>
                      )}
                    </div>
                    {note.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={note.image_url}
                        alt=""
                        className="size-12 shrink-0 rounded-md object-cover ring-1 ring-border/60"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="pb-2 text-center text-xs text-muted-foreground">
        {notes.length} {notes.length === 1 ? "Note" : "Notes"}
      </p>
    </div>
  );
}

/** Desktop's right pane before a note is picked. */
export function NoNoteSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <NotebookPenIcon className="size-8 opacity-40" />
      <p className="text-sm">Select a note to read it</p>
    </div>
  );
}

/**
 * One note, full page. Reading shows the first line as a title; tapping the text
 * turns it into an editor where Enter is a new line, like Apple Notes. Edits save
 * on Done, Escape, ⌘/Ctrl+Enter, leaving the note, or blur — there's no Cancel,
 * same as Notes. A photo added or removed saves straight away.
 */
export function NoteDetail({
  note,
  onSave,
  onDelete,
  onBack,
  onTagClick,
}: {
  note: Note;
  onSave: (id: number, patch: NotePatch) => void;
  onDelete: (id: number) => void;
  /** Only on a phone, where the note covers the list. */
  onBack?: () => void;
  onTagClick: (tag: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [photo, setPhoto] = useState<string | null>(note.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // What's on the server, as this pane last knew it. A ref so the unmount save
  // and blur compare against the latest value without re-binding.
  const saved = useRef<NotePatch>({ content: note.content.trim(), image_url: note.image_url ?? null });
  const latest = useRef<NotePatch>({ content: draft, image_url: photo });
  latest.current = { content: draft, image_url: photo };

  const commit = (patch: NotePatch = latest.current) => {
    const content = patch.content.trim();
    // An empty note with no photo isn't a note; the server refuses it too.
    if (!content && !patch.image_url) return;
    if (content === saved.current.content && patch.image_url === saved.current.image_url) return;
    saved.current = { content, image_url: patch.image_url };
    onSave(note.id, { content, image_url: patch.image_url });
  };

  // Clicking another note, going back, or switching tabs unmounts this pane —
  // the edit in progress goes with it.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  const startEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const finishEditing = () => {
    if (!draft.trim() && !photo) setDraft(saved.current.content);
    commit();
    setEditing(false);
  };

  const setPhotoAndSave = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhoto(url);
      commit({ content: latest.current.content, image_url: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload photo.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    // A photo-only note would become empty — keep the photo instead.
    if (!latest.current.content.trim()) return;
    setPhoto(null);
    commit({ content: latest.current.content, image_url: null });
  };

  const text = editing ? draft : draft.trim();
  const lines = text.split("\n");
  // A short first line followed by more text reads as a title. A note that's one
  // long paragraph stays a paragraph rather than becoming a wall of bold.
  const hasTitle = lines.length > 1 && lines[0].trim().length > 0 && lines[0].trim().length <= 100;
  const title = hasTitle ? plain(lines[0]) : null;
  const body = hasTitle ? lines.slice(1).join("\n").replace(/^\n+/, "") : text;

  const created = new Date(note.created_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-1 bg-background/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { commit(); onBack(); }}
            className="gap-0.5 px-1.5 text-[17px] font-normal text-primary hover:text-primary"
          >
            <ChevronLeftIcon className="size-5" />
            Notes
          </Button>
        ) : <span />}
        <div className="ml-auto flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              setPhotoAndSave(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="text-primary hover:text-primary"
            aria-label={photo ? "Change photo" : "Add photo"}
          >
            {uploading ? <Spinner className="size-4" /> : <ImagePlusIcon className="size-[18px]" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-primary hover:text-destructive" aria-label="Delete note">
                <TrashIcon className="size-[18px]" />
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
                  onClick={() => {
                    // Nothing left to save once it's gone.
                    saved.current = latest.current = { content: "", image_url: null };
                    onDelete(note.id);
                  }}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {editing && (
            <Button
              variant="ghost"
              size="sm"
              // mousedown, not click: keeps the textarea's blur from firing first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={finishEditing}
              className="px-2 text-[17px] font-semibold text-primary hover:text-primary"
            >
              Done
            </Button>
          )}
        </div>
      </div>

      <article className="mx-auto w-full max-w-2xl flex-1 px-5 pb-16 lg:px-8">
        <p className="mb-1 text-center text-xs text-muted-foreground">{created}</p>
        {note.tags?.length > 0 && (
          <div className="mb-3 flex flex-wrap justify-center gap-1">
            {note.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {photo && (
          <div className="group/photo relative my-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="max-h-[70dvh] w-full rounded-lg bg-muted object-contain" />
            <Button
              variant="secondary"
              size="icon-xs"
              onClick={removePhoto}
              aria-label="Remove photo"
              className="absolute right-2 top-2 rounded-full opacity-0 shadow-sm transition-opacity group-hover/photo:opacity-100 touch:opacity-100"
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        )}

        {editing ? (
          <textarea
            ref={textRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                finishEditing();
              }
            }}
            onPaste={(e) => {
              const image = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
              if (image) { e.preventDefault(); setPhotoAndSave(image); }
            }}
            placeholder="Start writing…"
            className="field-sizing-content mt-2 min-h-[40dvh] w-full resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <div onClick={startEditing} className="mt-2 min-h-[40dvh] cursor-text">
            {title && <h1 className="mb-2 text-2xl font-bold leading-tight tracking-tight">{title}</h1>}
            {body ? (
              <p className="whitespace-pre-wrap break-words text-[17px] leading-relaxed">{body}</p>
            ) : !title ? (
              <p className="text-[17px] text-muted-foreground">Tap to write…</p>
            ) : null}
          </div>
        )}
      </article>
    </div>
  );
}
