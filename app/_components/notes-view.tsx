"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ImagePlusIcon, NotebookPenIcon, SquarePenIcon, TagIcon, TrashIcon, XIcon } from "lucide-react";
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
import { NotionEditor } from "@/app/_components/notion-editor";
import { noteTitleAndPreview } from "@/lib/note-title";

export { noteTitleAndPreview };

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

/**
 * Notes written before the editor (and most of Cael's) break lines with a single
 * newline, which the editor reads as one paragraph with line breaks — so the whole
 * note took the first line's title styling. Give each line its own paragraph,
 * leaving list items together and anything with a code block untouched.
 */
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/;
function toEditor(content: string) {
  if (content.includes("```")) return content;
  const lines = content.split("\n");
  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      if (next === undefined || !line.trim() || !next.trim()) return line + (next === undefined ? "" : "\n");
      return line + (LIST_LINE.test(line) && LIST_LINE.test(next) ? "\n" : "\n\n");
    })
    .join("");
}

/**
 * The editor writes a line break inside a paragraph as a trailing backslash.
 * Notes have always used a bare newline (and the editor reads it back as the same
 * break), so keep them that way rather than sprinkling backslashes through notes.
 */
function fromEditor(markdown: string) {
  return markdown.replace(/\\\n/g, "\n");
}

/** Markdown bits that read as noise in a one-line title or preview. */
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
          {/* Apple Notes list: no card, just hairlines between rows. */}
          <div>
            {group.notes.map((note, i) => {
              const { title, preview } = noteTitleAndPreview(note.content);
              const selected = note.id === selectedId;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onOpen(note.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 text-left transition-colors",
                    selected ? "bg-primary/15" : "hover:bg-muted/60 active:bg-muted",
                  )}
                >
                  <div className={cn("flex min-w-0 flex-1 items-center gap-3 py-2.5", i > 0 && "border-t border-border/70")}>
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

/** Apple's compose button: a blank note, cursor ready. */
export function ComposeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="New note"
      title="New note"
      className="text-primary hover:text-primary"
    >
      <SquarePenIcon className="size-[22px]" />
    </Button>
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
 * same as Notes. A photo added or removed saves straight away, and typing saves
 * itself after a short pause so the list keeps up.
 *
 * A note from the compose button arrives with `id: 0`: a blank page with the
 * cursor in it. Nothing reaches the server until there's something to keep —
 * the first save creates the row (`onCreate`), later saves edit it.
 */
export function NoteDetail({
  note,
  onSave,
  onCreate,
  onDelete,
  onBack,
  onTagClick,
}: {
  note: Note;
  onSave: (id: number, patch: NotePatch) => void;
  /** Saves a new note (id 0); resolves to the stored note, or null if it failed. */
  onCreate?: (patch: NotePatch) => Promise<Note | null>;
  /** Called with 0 to throw away a new note that never got any words. */
  onDelete: (id: number) => void;
  /** Only on a phone, where the note covers the list. */
  onBack?: () => void;
  onTagClick: (tag: string) => void;
}) {
  const isNew = note.id === 0;
  // Whether the cursor is in the note — only decides when Done shows.
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(note.content);
  // Apple styles the first line as a title. A note Cael captured as one long
  // paragraph would become a wall of bold, so those keep plain text. Decided once
  // per open so the styling doesn't flip mid-sentence.
  const [titled] = useState(() => (note.content.trim().split("\n")[0] ?? "").length <= 100);
  const [photo, setPhoto] = useState<string | null>(note.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // What's on the server, as this pane last knew it. A ref so the unmount save
  // and blur compare against the latest value without re-binding.
  const saved = useRef<NotePatch>({ content: note.content.trim(), image_url: note.image_url ?? null });
  const latest = useRef<NotePatch>({ content: draft, image_url: photo });
  latest.current = { content: draft, image_url: photo };
  // The row this pane writes to: 0 until a new note's first save comes back.
  const idRef = useRef(note.id);
  // The create in flight, so a save that lands meanwhile waits for the id
  // instead of creating the note twice.
  const creating = useRef<Promise<void> | null>(null);
  // Deleted: the unmount save mustn't write the note back.
  const gone = useRef(false);

  const commit = (patch: NotePatch = latest.current) => {
    if (gone.current) return;
    const content = patch.content.trim();
    // An empty note with no photo isn't a note; the server refuses it too.
    if (!content && !patch.image_url) return;
    if (content === saved.current.content && patch.image_url === saved.current.image_url) return;
    saved.current = { content, image_url: patch.image_url };
    if (idRef.current) {
      onSave(idRef.current, { content, image_url: patch.image_url });
    } else if (creating.current) {
      creating.current.then(() => {
        if (idRef.current) onSave(idRef.current, { content, image_url: patch.image_url });
      });
    } else if (onCreate) {
      creating.current = onCreate({ content, image_url: patch.image_url }).then((created) => {
        if (created) idRef.current = created.id;
        // Failed: forget it was saved so the next pause tries again.
        else saved.current = { content: "", image_url: null };
        creating.current = null;
      });
    }
  };

  // Clicking another note, going back, or switching tabs unmounts this pane —
  // the edit in progress goes with it.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  // Apple Notes has no save button: a second of quiet after typing saves.
  useEffect(() => {
    const t = setTimeout(() => commitRef.current(), 1000);
    return () => clearTimeout(t);
  }, [draft]);

  const finishEditing = () => {
    // Done on a blank new note: there's nothing to keep, so it just goes away.
    if (!idRef.current && !creating.current && !draft.trim() && !photo) {
      onDelete(0);
      return;
    }
    commit();
    (document.activeElement as HTMLElement | null)?.blur();
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
                    gone.current = true;
                    // A new note still being created is deleted once it has an id.
                    if (creating.current) creating.current.then(() => onDelete(idRef.current));
                    else onDelete(idRef.current);
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
              // mousedown, not click: keeps the editor's blur from firing first.
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

        {/* The same Notion-style editor as Writing and Principles: "/" for blocks,
            select text to format. Always editable, like Apple Notes. Notes are
            stored as markdown, which Cael reads as text. */}
        <div
          ref={paneRef}
          className={cn("note-editor mt-2 min-h-[40dvh] cursor-text pb-8", titled && "note-titled")}
          onFocus={() => setEditing(true)}
          onBlur={(e) => {
            // Focus moving within the note (a toggle, a checkbox) isn't leaving it.
            if (paneRef.current?.contains(e.relatedTarget as Node | null)) return;
            setEditing(false);
            commit();
          }}
          onKeyDown={(e) => {
            // Escape closes the "/" menu first; with nothing open it means Done.
            if (e.key === "Escape" && !e.defaultPrevented) finishEditing();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finishEditing(); }
          }}
          onPasteCapture={(e) => {
            // A pasted picture becomes the note's photo (the one its list row shows).
            const image = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (image) { e.preventDefault(); e.stopPropagation(); setPhotoAndSave(image); }
          }}
          onClick={(e) => {
            // Clicking the blank space under the text puts the cursor at the end.
            if (e.target === e.currentTarget) paneRef.current?.querySelector<HTMLElement>(".ProseMirror")?.focus();
          }}
        >
          <NotionEditor
            initialContent={toEditor(note.content)}
            onChange={(markdown) => setDraft(fromEditor(markdown))}
            placeholder="Start writing…"
            autoFocus={isNew}
          />
        </div>
      </article>
    </div>
  );
}
