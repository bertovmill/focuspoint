"use client";

import type { EveMessagePart } from "eve/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, XIcon } from "lucide-react";
import { StatusDot } from "@/app/_components/agent-chat";
import { useThreads } from "@/app/_components/threads-provider";
import { PromptInputProvider, usePromptInputController } from "@/components/ai-elements/prompt-input";
import { EveComposer } from "@/components/chat/eve-composer";
import { EveThread, type EveAgent, type SentFile } from "@/components/chat/eve-thread";
import { Skeleton } from "@/components/ui/skeleton";
import { useThreadAgent } from "@/hooks/use-thread-agent";
import { withChatContext } from "@/lib/chat-context";

/** Tools that change the post; when one finishes, the editor reloads it. */
const WRITE_TOOLS = new Set(["save_post", "generate_post_image", "publish_post"]);

const QUICK_ACTIONS = [
  { label: "Tighten it", prompt: "Tighten the whole piece: cut filler and repetition, keep my voice. Save the changes, then tell me briefly what you cut." },
  { label: "Suggest titles", prompt: "Suggest five sharper titles and a better one-line summary. Don't change anything yet." },
  { label: "Make a cover", prompt: "Generate a cover image that fits this article and attach it." },
  { label: "Proofread", prompt: "Proofread it: fix typos, grammar and clumsy phrasing only — no rewrites. Save, then list what you changed." },
] as const;

export type PostChatPost = {
  id: number;
  slug: string;
  title: string;
  status: "draft" | "published";
  chatThreadId: string | null;
};

type Props = {
  post: PostChatPost;
  /** Save whatever is typed in the editor, so Cael reads the latest text. */
  beforeSend: () => Promise<void>;
  /** A write tool finished: reload the post into the editor. */
  onPostChanged: () => void;
  /** True while Cael is answering; the editor locks so edits can't cross. */
  onBusyChange: (busy: boolean) => void;
  /** Text to drop into the composer (from "Ask Cael" on a selection); `n` makes repeats land. */
  draft: { text: string; n: number } | null;
  onClose: () => void;
};

/**
 * The chat beside a post in the Writing editor. One ongoing thread per article
 * (posts.chat_thread_id), which also shows in the main Chat history as
 * "Writing: <title>". Every message carries a hidden line saying which post is
 * open, so Cael knows what "this" is.
 */
export function PostChat(props: Props) {
  const { hydrated, getThread, createThread } = useThreads();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const creating = useRef(false);

  useEffect(() => {
    if (!hydrated || threadId || creating.current) return;
    const saved = props.post.chatThreadId;
    if (saved && getThread(saved)) {
      setThreadId(saved);
      return;
    }
    // No thread yet, or it was deleted from Chat: start the article's conversation.
    creating.current = true;
    const id = createThread(`Writing: ${props.post.title}`);
    void fetch(`/api/posts/${props.post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatThreadId: id }),
    });
    setThreadId(id);
  }, [hydrated, threadId, getThread, createThread, props.post.chatThreadId, props.post.id, props.post.title]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-sm font-medium">Cael</span>
        <span className="truncate text-xs text-muted-foreground">on this article</span>
        <button
          type="button"
          onClick={props.onClose}
          className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close chat"
        >
          <XIcon className="size-4" />
        </button>
      </header>
      {threadId ? (
        <PromptInputProvider>
          <PostChatSession key={`${threadId}:${epoch}`} threadId={threadId} onSessionLost={() => setEpoch((n) => n + 1)} {...props} />
        </PromptInputProvider>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="ml-auto h-10 w-1/2" />
        </div>
      )}
    </div>
  );
}

function PostChatSession({
  threadId,
  onSessionLost,
  post,
  beforeSend,
  onPostChanged,
  onBusyChange,
  draft,
}: Props & { threadId: string; onSessionLost: () => void }) {
  const agent = useThreadAgent(threadId, { onSessionLost });
  const controller = usePromptInputController();
  const rootRef = useRef<HTMLDivElement>(null);

  const latest = useRef({ post, beforeSend, onPostChanged, onBusyChange });
  latest.current = { post, beforeSend, onPostChanged, onBusyChange };

  // Every send goes out with the open post named, after the editor has saved.
  const wrapped = useMemo(
    () =>
      new Proxy(agent, {
        get(target, prop, receiver) {
          if (prop !== "send") return Reflect.get(target, prop, receiver);
          return async (content: Parameters<EveAgent["send"]>[0], ...rest: unknown[]) => {
            await latest.current.beforeSend();
            const p = latest.current.post;
            const context =
              `Writing editor — Berto has the article "${p.title}" (slug: ${p.slug}, ${p.status}) open beside this chat. ` +
              "Read it with get_post before changing it and save with save_post; your saves appear in his editor as soon as they land. " +
              "Don't publish unless he says so.";
            const next =
              typeof content === "string"
                ? withChatContext(context, content)
                : Array.isArray(content)
                  ? [{ type: "text" as const, text: withChatContext(context, "") }, ...content]
                  : content;
            return (target.send as (...a: unknown[]) => unknown)(next, ...rest);
          };
        },
      }) as EveAgent,
    [agent],
  );

  const busy = agent.status === "submitted" || agent.status === "streaming";

  // A turn that fails on the server (e.g. the model gateway refusing the call)
  // arrives as a `turn.failed` event, not as agent.error, so look for one after
  // the last turn started.
  const failure = useMemo(() => {
    if (agent.error) return agent.error.message;
    for (let i = agent.events.length - 1; i >= 0; i--) {
      const e = agent.events[i] as { type?: string; data?: { message?: string } };
      if (e.type === "turn.failed") return e.data?.message ?? "The turn failed.";
      if (e.type === "turn.started" || e.type === "turn.completed") return null;
    }
    return null;
  }, [agent.error, agent.events]);
  useEffect(() => {
    latest.current.onBusyChange(busy);
  }, [busy]);
  useEffect(() => () => latest.current.onBusyChange(false), []);

  // Reload the post when Cael's write tools finish. Calls already in the
  // transcript when the chat opened don't count.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const done: string[] = [];
    for (const m of agent.data.messages) {
      for (const part of m.parts as EveMessagePart[]) {
        if (part.type !== "dynamic-tool") continue;
        const tool = part as Extract<EveMessagePart, { type: "dynamic-tool" }>;
        if (WRITE_TOOLS.has(tool.toolName) && tool.state === "output-available") done.push(tool.toolCallId);
      }
    }
    if (!seen.current) {
      seen.current = new Set(done);
      return;
    }
    const fresh = done.filter((id) => !seen.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current.add(id);
    latest.current.onPostChanged();
  }, [agent.data.messages]);

  // "Ask Cael" on a selection: quote it into the composer and focus it.
  useEffect(() => {
    if (!draft) return;
    const quoted = draft.text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    controller.textInput.setInput(`${quoted}\n\n`);
    const box = rootRef.current?.querySelector("textarea");
    if (box) {
      box.focus();
      requestAnimationFrame(() => box.setSelectionRange(box.value.length, box.value.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.n]);

  const sentFilesRef = useRef(new Map<number, readonly SentFile[]>());
  const [, bump] = useState(0);
  const rememberSentFiles = useCallback((index: number, files: readonly SentFile[]) => {
    if (files.length === 0) return;
    sentFilesRef.current.set(index, files);
    bump((n) => n + 1);
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground">
        <StatusDot status={agent.status} />
        {busy ? "Cael is working — the article is locked until it's done." : null}
      </div>
      {failure && !busy ? (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium">Cael couldn&apos;t answer</p>
            <p className="mt-0.5 break-words text-muted-foreground">{failure}</p>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <EveThread
          agent={wrapped}
          sentFiles={sentFilesRef.current}
          suggestions={[]}
          className="gap-5 px-3 pt-3 pb-4"
          welcome={
            <p className="max-w-64 text-center text-sm text-muted-foreground">
              Ask Cael to draft, rewrite, cut or illustrate this article. Select text in the editor to ask about one passage.
            </p>
          }
        />
      </div>
      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={busy}
              onClick={() => void wrapped.send(a.prompt)}
              className="shrink-0 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
        <EveComposer
          agent={wrapped}
          onSend={rememberSentFiles}
          placeholder="Ask Cael about this article…"
          autoFocus={false}
          globalDrop={false}
        />
      </div>
    </div>
  );
}
