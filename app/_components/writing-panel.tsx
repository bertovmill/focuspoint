"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  ImagePlusIcon,
  Loader2Icon,
  PenLineIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NotionEditor } from "@/app/_components/notion-editor";
import { cn } from "@/lib/utils";

type PostSummary = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
  url: string;
  tweetUrl: string | null;
  tweetedAt: string | null;
};
type Post = PostSummary & { body: string };

const AUTOSAVE_MS = 900;

// X counts every link as 23 characters, however long it really is.
const TWEET_LIMIT = 280;
function tweetLength(text: string) {
  return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

// The open post is `?post=<slug>`, read from the URL directly rather than with
// useSearchParams, which would force a Suspense boundary on the whole shell.
function slugFromUrl() {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("post");
}
function setUrlSlug(slug: string | null, mode: "push" | "replace" = "push") {
  const url = slug ? `/writing?post=${encodeURIComponent(slug)}` : "/writing";
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Photos go through /api/upload, which sits behind a ~4.5 MB request limit, so
 * shrink them in the browser first: a phone photo is 3–12 MB, and nothing on the
 * page is wider than 2000px anyway. GIFs pass through untouched (canvas would
 * flatten the animation).
 */
async function uploadImage(file: File): Promise<string> {
  let blob: Blob = file;
  if (file.type !== "image/gif") {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", 0.85),
      );
    } catch {
      blob = file; // An unreadable format (HEIC in some browsers) — let the server say no.
    }
  }
  const form = new FormData();
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  form.append("file", new File([blob], blob === file ? file.name : `${base}.webp`, { type: blob.type || file.type }));
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
  return data.url as string;
}

// A timestamp, not a dateline: show it in local time.
function formatMoment(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDay(iso: string | null) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function StatusBadge({ status }: { status: Post["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "published" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

/**
 * /writing — the articles on bertomill.com/writing. A list of drafts and
 * published posts; open one to write it here, or hand it to Cael, who edits the
 * same rows with save_post. Substack posts aren't here — they're written there.
 */
export function WritingPanel({ onWorkWithCael }: { onWorkWithCael: (message: string) => void }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    setOpenSlug(slugFromUrl());
    const onPop = () => setOpenSlug(slugFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = (slug: string | null) => {
    setUrlSlug(slug);
    setOpenSlug(slug);
  };

  return openSlug ? (
    <PostEditor
      key={openSlug}
      slug={openSlug}
      onBack={() => open(null)}
      onSlugChange={(s) => {
        setUrlSlug(s, "replace");
      }}
      onWorkWithCael={onWorkWithCael}
    />
  ) : (
    <PostList onOpen={open} />
  );
}

// ── the list ───────────────────────────────────────────────────────────────

function PostList({ onOpen }: { onOpen: (slug: string) => void }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      const post = await res.json();
      if (!res.ok) throw new Error(post.error);
      onOpen(post.slug);
    } catch {
      toast.error("Couldn't start a new post.");
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-3 py-4 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Writing</h1>
            <p className="text-sm text-muted-foreground">
              Articles on{" "}
              <a href="https://bertomill.com/writing" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
                bertomill.com/writing
              </a>
              . Write here, or ask Cael to draft and edit. Substack posts show there too, but are written on Substack.
            </p>
          </div>
          <Button onClick={create} disabled={creating} size="sm">
            {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            New post
          </Button>
        </header>

        {posts === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No articles yet. Start one, or ask Cael to draft one.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {posts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.slug)}
                  className="flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex aspect-[3/2] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <PenLineIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.title || "Untitled"}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    {p.summary && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{p.summary}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.status === "published" ? `Published ${formatDay(p.publishedAt)}` : `Edited ${formatDay(p.updatedAt)}`} · {p.readingMinutes} min read
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── one post ───────────────────────────────────────────────────────────────

type Pending = Partial<Pick<Post, "title" | "summary" | "body" | "tags" | "coverUrl" | "coverAlt" | "slug">>;

function PostEditor({
  slug,
  onBack,
  onSlugChange,
  onWorkWithCael,
}: {
  slug: string;
  onBack: () => void;
  onSlugChange: (slug: string) => void;
  onWorkWithCael: (message: string) => void;
}) {
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish">(null);
  const [tweetText, setTweetText] = useState<string | null>(null);
  const [tweeting, setTweeting] = useState(false);
  const pending = useRef<Pending>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postRef = useRef<Post | null>(null);
  postRef.current = post;
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    // The list only knows slugs; the id is what survives a rename.
    fetch("/api/posts")
      .then((r) => r.json())
      .then((all: PostSummary[]) => {
        const hit = all.find((p) => p.slug === slug);
        if (!hit) throw new Error("missing");
        return fetch(`/api/posts/${hit.id}`).then((r) => r.json());
      })
      .then((p: Post) => {
        if (cancelled) return;
        setPost(p);
        setTagsText(p.tags.join(", "));
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const flush = useCallback(async () => {
    const current = postRef.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const changes = pending.current;
    pending.current = {};
    if (!current || Object.keys(changes).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const saved = await res.json();
      if (res.status === 409 && changes.slug) {
        // Title made a URL another post already has; keep the old URL, save the rest.
        const { slug: _s, ...rest } = changes;
        pending.current = { ...rest, ...pending.current };
        return flush();
      }
      if (!res.ok) throw new Error(saved.error);
      setPost((p) => (p ? { ...p, slug: saved.slug, url: saved.url, updatedAt: saved.updatedAt, readingMinutes: saved.readingMinutes } : p));
      if (saved.slug !== current.slug) onSlugChange(saved.slug);
      setSavedAt(new Date());
      setError(false);
    } catch {
      pending.current = { ...changes, ...pending.current };
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [onSlugChange]);

  const change = useCallback(
    (fields: Pending, { now = false } = {}) => {
      setPost((p) => (p ? { ...p, ...fields } : p));
      pending.current = { ...pending.current, ...fields };
      // A draft that's never been out follows its title, so "Untitled" doesn't
      // become the permanent URL. Once published, links exist — the URL stays.
      const current = postRef.current;
      if (fields.title !== undefined && current && !current.publishedAt && slugify(fields.title)) {
        pending.current.slug = slugify(fields.title);
      }
      if (timer.current) clearTimeout(timer.current);
      if (now) void flush();
      else timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // Don't lose the last keystrokes to a closed tab or a section switch.
  useEffect(() => {
    const beacon = () => {
      const current = postRef.current;
      if (!current || Object.keys(pending.current).length === 0) return;
      const body = JSON.stringify(pending.current);
      pending.current = {};
      if (!navigator.sendBeacon?.(`/api/posts/${current.id}`, new Blob([body], { type: "application/json" }))) {
        void fetch(`/api/posts/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      }
    };
    window.addEventListener("beforeunload", beacon);
    return () => {
      window.removeEventListener("beforeunload", beacon);
      beacon();
    };
  }, []);

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadImage(file);
      change({ coverUrl: url, coverAlt: postRef.current?.coverAlt || "" }, { now: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  };

  const setStatus = async (status: Post["status"]) => {
    const current = postRef.current;
    if (!current) return;
    await flush();
    try {
      const res = await fetch(`/api/posts/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error);
      setPost((p) => (p ? { ...p, status: saved.status, publishedAt: saved.publishedAt, url: saved.url } : p));
      toast.success(status === "published" ? "Published — live on bertomill.com within a minute." : "Back to a draft.");
    } catch {
      toast.error("Couldn't change the status.");
    }
  };

  const sendTweet = async () => {
    const current = postRef.current;
    if (!current || !tweetText) return;
    setTweeting(true);
    try {
      const res = await fetch(`/api/posts/${current.id}/tweet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: tweetText }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error);
      setPost((p) => (p ? { ...p, tweetUrl: saved.tweetUrl, tweetedAt: saved.tweetedAt } : p));
      setTweetText(null);
      toast.success("Posted to X.", {
        action: { label: "View", onClick: () => window.open(saved.tweetUrl, "_blank", "noreferrer") },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post to X.");
    } finally {
      setTweeting(false);
    }
  };

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        That post doesn&apos;t exist any more.
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to Writing
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeftIcon />
          Writing
        </Button>
        {post && <StatusBadge status={post.status} />}
        <span className="text-xs text-muted-foreground">
          {error ? <span className="text-destructive">Not saved</span> : saving ? "Saving…" : savedAt ? "Saved" : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {post && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <a href={post.url} aria-label={post.status === "published" ? "View live" : "Preview"} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  <span className="hidden sm:inline">{post.status === "published" ? "View live" : "Preview"}</span>
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await flush();
                  onWorkWithCael(
                    `Let's work on my article "${post.title}" (slug: ${post.slug}). Read it with get_post first, then ask me what I want to change.`,
                  );
                }}
              >
                <SparklesIcon />
                <span className="hidden sm:inline">Work on this with Cael</span>
                <span className="sm:hidden">Cael</span>
              </Button>
              {post.status === "published" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTweetText(`${post.title}\n\n${post.url}`)}
                  title={post.tweetedAt ? `Tweeted ${formatMoment(post.tweetedAt)}` : undefined}
                >
                  <SendIcon />
                  <span className="hidden sm:inline">{post.tweetedAt ? "Tweet again" : "Tweet"}</span>
                </Button>
              )}
              <Button size="sm" variant={post.status === "published" ? "outline" : "default"} onClick={() => setConfirm(post.status === "published" ? "unpublish" : "publish")}>
                {post.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </>
          )}
        </div>
      </div>

      {!post ? (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
          <Skeleton className="aspect-[3/1] w-full" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
          {post.status === "published" && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              This post is live. Edits save as you type and show on bertomill.com within a minute.
              {post.tweetUrl && post.tweetedAt && (
                <>
                  {" "}
                  <a href={post.tweetUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Tweeted {formatMoment(post.tweetedAt)}
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {/* Cover */}
          <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pickCover(e.target.files?.[0])} />
          {post.coverUrl ? (
            <div className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverUrl} alt={post.coverAlt ?? ""} className="aspect-[3/2] w-full rounded-lg border object-cover" />
              <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Button size="sm" variant="secondary" onClick={() => coverInput.current?.click()} disabled={uploadingCover}>
                  {uploadingCover ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
                  Replace
                </Button>
                <Button size="sm" variant="secondary" onClick={() => change({ coverUrl: null, coverAlt: null }, { now: true })} aria-label="Remove cover">
                  <Trash2Icon />
                </Button>
              </div>
              <input
                value={post.coverAlt ?? ""}
                onChange={(e) => change({ coverAlt: e.target.value })}
                placeholder="Describe the cover (for screen readers)"
                className="mt-1.5 w-full bg-transparent text-base text-muted-foreground outline-none placeholder:text-muted-foreground/60 sm:text-xs"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pickCover(e.dataTransfer.files?.[0]);
              }}
              disabled={uploadingCover}
              className="flex aspect-[4/1] w-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {uploadingCover ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
              Add a cover photo — or ask Cael to make one
            </button>
          )}

          {/* Title, summary, tags */}
          <textarea
            value={post.title === "Untitled" ? "" : post.title}
            onChange={(e) => change({ title: e.target.value.replace(/\n/g, " ") || "Untitled" })}
            placeholder="Title"
            rows={1}
            className="field-sizing-content resize-none bg-transparent text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50"
          />
          <textarea
            value={post.summary}
            onChange={(e) => change({ summary: e.target.value })}
            placeholder="A sentence or two that sells it — shown under the title and on the index"
            rows={1}
            className="field-sizing-content resize-none bg-transparent text-base leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50 sm:text-lg"
          />
          <input
            value={tagsText}
            onChange={(e) => {
              setTagsText(e.target.value);
              change({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) });
            }}
            placeholder="Tags, comma separated"
            className="bg-transparent font-mono text-base text-muted-foreground outline-none placeholder:text-muted-foreground/50 sm:text-xs"
          />

          <hr className="border-border" />

          <NotionEditor
            initialContent={post.body}
            onChange={(body) => change({ body })}
            uploadImage={uploadImage}
            placeholder="Write. Type '/' for headings, lists and images — or paste and drop photos straight in."
            className="min-h-[40vh]"
          />
        </div>
      )}

      <Dialog open={tweetText !== null} onOpenChange={(o) => !o && !tweeting && setTweetText(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tweet this post</DialogTitle>
            <DialogDescription>
              Posts publicly to X as @berto_vmill.
              {post?.tweetedAt && ` You already tweeted it on ${formatMoment(post.tweetedAt)}.`}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={tweetText ?? ""}
            onChange={(e) => setTweetText(e.target.value)}
            rows={6}
            autoFocus
            className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <DialogFooter className="items-center sm:justify-between">
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground",
                tweetLength(tweetText ?? "") > TWEET_LIMIT && "text-destructive",
              )}
            >
              {TWEET_LIMIT - tweetLength(tweetText ?? "")} left
            </span>
            <Button
              size="sm"
              onClick={() => void sendTweet()}
              disabled={tweeting || !tweetText?.trim() || tweetLength(tweetText) > TWEET_LIMIT}
            >
              {tweeting ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Post to X
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "publish" ? "Publish this post?" : "Take this post down?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "publish"
                ? `"${post?.title}" goes live on bertomill.com/writing for anyone to read.`
                : `"${post?.title}" goes back to a draft and comes off bertomill.com. The preview link keeps working.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = confirm === "publish" ? "published" : "draft";
                setConfirm(null);
                void setStatus(next);
              }}
            >
              {confirm === "publish" ? "Publish" : "Unpublish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
