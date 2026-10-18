"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { BoldIcon, Heading1Icon, Heading2Icon, ItalicIcon, ListChecksIcon, ListIcon, ListOrderedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 900;

function toMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

/**
 * The written training plan: one markdown document under the week grid, the
 * same Tiptap setup as the daily journal (type "# " for a heading, "- " for a
 * bullet, "[] " for a checkbox; stored as markdown so Cael reads it as text and
 * the weekly drafts are written against it). Autosaves; no save button.
 */
export function TrainingPlanDoc() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [, forceRender] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (content: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/training/doc", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      setSavedAt(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "The plan in your own words — blocks, the weekly shape, what the February build looks like. Cael drafts each week against this.",
      }),
      Markdown.configure({ transformPastedText: true, breaks: true }),
    ],
    editorProps: { attributes: { class: "journal-prose focus:outline-none min-h-[10rem]" } },
    onUpdate({ editor }) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => save(toMarkdown(editor)), AUTOSAVE_MS);
    },
    onSelectionUpdate: () => forceRender((n) => n + 1),
    onTransaction: () => forceRender((n) => n + 1),
  });

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    fetch("/api/training/doc")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((row: { content: string; updated_at: string | null }) => {
        if (cancelled) return;
        editor.commands.setContent(row.content || "", { emitUpdate: false });
        setSavedAt(row.updated_at ? new Date(row.updated_at) : null);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [editor]);

  // Don't lose the last keystrokes to a closed tab or a section switch.
  useEffect(() => {
    const flush = () => {
      if (!editor || !timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      const body = JSON.stringify({ content: toMarkdown(editor) });
      const sent = navigator.sendBeacon?.("/api/training/doc", new Blob([body], { type: "application/json" }));
      if (!sent) save(toMarkdown(editor));
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [editor, save]);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">The plan</h2>
          <p className="text-sm text-muted-foreground">Cael drafts each week from this.</p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {error ? <span className="text-destructive">Not saved</span> : saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </span>
      </div>
      <div className="rounded-lg border">
        {editor && (
          <div className="flex items-center gap-0.5 border-b px-2 py-1">
            <Tb editor={editor} label="Heading" icon={Heading1Icon} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
            <Tb editor={editor} label="Subheading" icon={Heading2Icon} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <Tb editor={editor} label="Bold" icon={BoldIcon} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
            <Tb editor={editor} label="Italic" icon={ItalicIcon} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <Tb editor={editor} label="Bullet list" icon={ListIcon} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <Tb editor={editor} label="Numbered list" icon={ListOrderedIcon} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <Tb editor={editor} label="Checklist" icon={ListChecksIcon} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
          </div>
        )}
        <div className="px-4 py-3">{loading ? <Skeleton className="h-24 w-full" /> : <EditorContent editor={editor} />}</div>
      </div>
    </section>
  );
}

function Tb({ label, icon: Icon, active, onClick }: { editor: Editor; label: string; icon: typeof BoldIcon; active: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={cn("text-muted-foreground", active && "bg-accent text-foreground")}>
      <Icon className="size-4" />
    </Button>
  );
}
