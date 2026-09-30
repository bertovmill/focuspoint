"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorContent, ReactRenderer, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import {
  BoldIcon,
  CheckIcon,
  ChevronRightIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  SparklesIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** tiptap-markdown hangs its serializer off editor.storage without typing it. */
function toMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

// ── images ─────────────────────────────────────────────────────────────────

/**
 * Images are blocks here (their own line in the article), but tiptap-markdown
 * serializes them the inline way, so the next paragraph got glued onto the end
 * of the `![](url)` line. Close the block after writing it.
 */
const BlockImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write(s: string): void; esc(s: string): string; closeBlock(node: unknown): void },
          node: { attrs: { src: string; alt?: string | null; title?: string | null } },
        ) {
          const alt = state.esc(node.attrs.alt ?? "");
          const title = node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : "";
          state.write(`![${alt}](${node.attrs.src}${title})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

/**
 * Where an editor sends picked, pasted or dropped image files. Only editors
 * given an `uploadImage` prop have one; the rest still keep images already in
 * their markdown (so a round trip never drops a `![](url)`), they just can't add.
 */
const ImageUpload = Extension.create<object, { upload: ((file: File) => Promise<string>) | null }>({
  name: "imageUpload",
  addStorage() {
    return { upload: null };
  },
});

function uploaderOf(editor: Editor) {
  return (editor.storage as unknown as { imageUpload?: { upload: ((file: File) => Promise<string>) | null } }).imageUpload?.upload ?? null;
}

async function insertImageFiles(editor: Editor, files: File[], pos?: number) {
  const upload = uploaderOf(editor);
  if (!upload) return;
  for (const file of files.filter((f) => f.type.startsWith("image/"))) {
    try {
      const src = await upload(file);
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      const chain = editor.chain().focus();
      (pos === undefined ? chain : chain.setTextSelection(pos)).setImage({ src, alt }).run();
    } catch (err) {
      console.error("image upload failed", err);
      window.alert("That image couldn't be uploaded.");
    }
  }
}

function pickImage(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    if (input.files?.length) void insertImageFiles(editor, [...input.files]);
  };
  input.click();
}

// editorProps get a ProseMirror view, not the Tiptap editor that owns it.
const editorsByView = new WeakMap<object, Editor>();
function uploaderOfView(view: object): Editor | null {
  const editor = editorsByView.get(view);
  return editor && uploaderOf(editor) ? editor : null;
}

// ── the "/" menu ───────────────────────────────────────────────────────────

type SlashItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Extra words that find the item: "/h1", "/todo", "/hr". */
  aliases: string[];
  run: (editor: Editor, range: Range) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  { title: "Text", description: "Just start writing", icon: PilcrowIcon, aliases: ["paragraph", "plain"], run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Heading 1", description: "Big section heading", icon: Heading1Icon, aliases: ["h1", "title"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { title: "Heading 2", description: "Medium section heading", icon: Heading2Icon, aliases: ["h2", "subheading"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { title: "Heading 3", description: "Small section heading", icon: Heading3Icon, aliases: ["h3"], run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { title: "Bulleted list", description: "A simple bulleted list", icon: ListIcon, aliases: ["ul", "bullet", "unordered"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", description: "A list with numbering", icon: ListOrderedIcon, aliases: ["ol", "ordered", "number"], run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "To-do list", description: "Track things with checkboxes", icon: ListChecksIcon, aliases: ["todo", "task", "checkbox"], run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Toggle", description: "Tuck the detail under a line", icon: ChevronRightIcon, aliases: ["details", "collapse", "expand"], run: (e, r) => {
    e.chain().focus().deleteRange(r).run();
    // A toggle inside a list item puts the caret in its fold button, so lift
    // the line out of any lists first (one level per lift).
    for (let i = 0; i < 8 && (e.isActive("listItem") || e.isActive("taskItem")); i++) {
      if (!e.commands.liftListItem(e.isActive("taskItem") ? "taskItem" : "listItem")) break;
    }
    e.commands.setDetails();
  } },
  { title: "Quote", description: "Pull a line out", icon: QuoteIcon, aliases: ["blockquote"], run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Divider", description: "Separate sections", icon: MinusIcon, aliases: ["hr", "line", "separator"], run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { title: "Code", description: "A block of code", icon: SquareCodeIcon, aliases: ["codeblock", "snippet"], run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
];

const IMAGE_ITEM: SlashItem = {
  title: "Image",
  description: "Upload a photo",
  icon: ImageIcon,
  aliases: ["img", "photo", "picture"],
  run: (e, r) => {
    e.chain().focus().deleteRange(r).run();
    pickImage(e);
  },
};

function filterSlashItems(query: string, canUpload: boolean): SlashItem[] {
  const all = canUpload ? [...SLASH_ITEMS, IMAGE_ITEM] : SLASH_ITEMS;
  const q = query.toLowerCase().trim();
  if (!q) return all;
  return all.filter(
    (item) => item.title.toLowerCase().includes(q) || item.aliases.some((a) => a.startsWith(q)),
  );
}

type SlashMenuProps = { items: SlashItem[]; command: (item: SlashItem) => void };
type SlashMenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu({ items, command }, ref) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // A new query is a new list; start from the top like Notion does.
  useEffect(() => setSelected(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        // Nothing matches: let Enter make a new line instead of eating it.
        if (!items.length) return false;
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert a block"
      className="w-72 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {items.length ? (
        <>
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Basic blocks</p>
          {items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              role="option"
              aria-selected={i === selected}
              data-index={i}
              // Keep the caret in the editor; the command runs on click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelected(i)}
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left",
                i === selected && "bg-accent text-accent-foreground",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                <item.icon className="size-4.5 text-muted-foreground" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-tight">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
            </button>
          ))}
        </>
      ) : (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">No results</p>
      )}
    </div>
  );
});

function renderSlashMenu() {
  let renderer: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
  let unmount: (() => void) | null = null;
  return {
    onStart(props: SuggestionProps<SlashItem, SlashItem>) {
      renderer = new ReactRenderer(SlashMenu, {
        editor: props.editor,
        props: { items: props.items, command: props.command },
        className: "z-50",
      });
      // The plugin appends it to <body> and keeps it pinned to the caret.
      unmount = props.mount(renderer.element as HTMLElement);
    },
    onUpdate(props: SuggestionProps<SlashItem, SlashItem>) {
      renderer?.updateProps({ items: props.items, command: props.command });
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      return renderer?.ref?.onKeyDown(props) ?? false;
    },
    onExit() {
      unmount?.();
      renderer?.destroy();
      renderer = null;
      unmount = null;
    },
  };
}

const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        // A "/" inside code is a slash, not a command.
        allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "codeBlock",
        items: ({ query, editor }) => filterSlashItems(query, Boolean(uploaderOf(editor))),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: renderSlashMenu,
      }),
    ];
  },
});

// ── the selection bubble ───────────────────────────────────────────────────

function FormatBubble({ editor, onAsk }: { editor: Editor; onAsk?: (selection: string) => void }) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  // Stable, because every new options object is pushed into the plugin as a transaction.
  // Closing the bubble drops a half-typed link, so the next selection opens on the buttons.
  const options = useMemo(() => ({ placement: "top" as const, offset: 8, onHide: () => setLinking(false) }), []);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      linkHref: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  const applyLink = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    else chain.unsetLink().run();
    setLinking(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={options}
      // Pressing a button mustn't blur the editor and drop the selection it acts
      // on; the link field is the one thing here that needs real focus.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
      className="z-50 flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {linking ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setLinking(false);
                editor.commands.focus();
              }
            }}
            placeholder="Paste a link…"
            className="h-7 w-56 rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          <BubbleButton label="Apply link" icon={CheckIcon} onClick={applyLink} />
          <BubbleButton label="Cancel" icon={XIcon} onClick={() => setLinking(false)} />
        </form>
      ) : (
        <>
          <BubbleButton label="Bold" icon={BoldIcon} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
          <BubbleButton label="Italic" icon={ItalicIcon} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <BubbleButton label="Strikethrough" icon={StrikethroughIcon} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <BubbleButton label="Inline code" icon={CodeIcon} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()} />
          <span className="mx-0.5 h-5 w-px bg-border" />
          <BubbleButton
            label="Link"
            icon={LinkIcon}
            active={state.link}
            onClick={() => {
              setHref(state.linkHref);
              setLinking(true);
            }}
          />
          {onAsk && (
            <>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <button
                type="button"
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, "\n\n").trim();
                  if (text) onAsk(text);
                }}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <SparklesIcon className="size-3.5" />
                Ask Cael
              </button>
            </>
          )}
        </>
      )}
    </BubbleMenu>
  );
}

function BubbleButton({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

// ── the editor ─────────────────────────────────────────────────────────────

/**
 * A Notion-style page: no box and no toolbar, just text. Type "/" for a block
 * menu, select text for bold/italic/link, and the markdown shortcuts work too
 * ("# ", "- ", "[] ", "> ", "---"). Content goes in and comes out as markdown,
 * so Cael reads it as text. The parent owns loading and saving.
 */
export function NotionEditor({
  initialContent,
  onChange,
  placeholder,
  className,
  uploadImage,
  editable = true,
  onAskAboutSelection,
}: {
  initialContent: string;
  onChange: (markdown: string) => void;
  /** Turns on adding images ("/image", paste, drop); returns the uploaded file's public URL. */
  uploadImage?: (file: File) => Promise<string>;
  /** False locks the page (e.g. while Cael is rewriting it). */
  editable?: boolean;
  /** Adds "Ask Cael" to the selection bubble; called with the selected text. */
  onAskAboutSelection?: (selection: string) => void;
  /** Shown while the whole document is empty. */
  placeholder: string;
  className?: string;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // Tiptap fires updates that don't change the text (the trailing empty line it
  // adds on load, toggling a fold), so only report when the markdown moves.
  const lastMarkdown = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    content: initialContent,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: "https" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Details.configure({ persist: true }),
      DetailsSummary,
      DetailsContent,
      Placeholder.configure({
        includeChildren: true,
        // Decided from the node alone: the extension builds these while the
        // editor still holds the previous state, so asking it "am I in a list?"
        // answers for the line you just left. List, to-do and empty-page text
        // come from CSS in globals.css instead.
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
          if (node.type.name === "detailsSummary") return "Toggle";
          return "Type '/' for commands";
        },
      }),
      BlockImage,
      ImageUpload,
      Markdown.configure({ transformPastedText: true, breaks: true }),
      SlashCommand,
    ],
    editorProps: {
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !uploaderOfView(view)) return false;
        void insertImageFiles(uploaderOfView(view)!, files);
        return true;
      },
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !uploaderOfView(view)) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImageFiles(uploaderOfView(view)!, files, pos);
        return true;
      },
      attributes: {
        class: cn("journal-prose notion-prose focus:outline-none", className),
        // A CSS string, read by the empty-page placeholder rule.
        style: `--notion-empty-placeholder: ${JSON.stringify(placeholder)}`,
      },
    },
    onCreate({ editor: e }) {
      editorsByView.set(e.view, e);
      lastMarkdown.current = toMarkdown(e);
    },
    onUpdate({ editor: e }) {
      const markdown = toMarkdown(e);
      if (markdown === lastMarkdown.current) return;
      lastMarkdown.current = markdown;
      onChangeRef.current(markdown);
    },
  });

  // The uploader can change identity between renders; the extension reads it at use time.
  useEffect(() => {
    if (!editor) return;
    (editor.storage as unknown as { imageUpload: { upload: typeof uploadImage | null } }).imageUpload.upload = uploadImage ?? null;
  }, [editor, uploadImage]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <>
      <FormatBubble editor={editor} onAsk={onAskAboutSelection} />
      <EditorContent editor={editor} />
    </>
  );
}
