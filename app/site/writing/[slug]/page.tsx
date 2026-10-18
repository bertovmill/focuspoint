import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { formatDate } from "@/lib/content";
import { getVisiblePost } from "@/lib/posts";
import { Prose } from "../../_components/prose";
import { PostFooterCta } from "../../_components/post-footer-cta";
import { PostNewsletterCta } from "../../_components/post-newsletter-cta";
import { SiteLink } from "../../_components/site-link";

// Posts are database rows Cael edits (lib/posts.ts), and a draft is shown only
// with its ?preview= token, so this page renders per request.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const post = await getVisiblePost(slug, preview);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.summary,
    robots: post.status === "published" ? undefined : { index: false, follow: false },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: post.coverAlt ?? post.title }] : undefined,
    },
    twitter: post.coverUrl ? { card: "summary_large_image", images: [post.coverUrl] } : undefined,
  };
}

export default async function WritingPostPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const post = await getVisiblePost(slug, preview);
  if (!post) notFound();
  const isDraft = post.status !== "published";

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      {isDraft && (
        <p className="mb-8 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
          Draft preview — not public yet
        </p>
      )}

      <SiteLink
        href="/writing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Writing
      </SiteLink>

      <header className="mt-8 border-b border-border/60 pb-8">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
        {post.summary && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{post.summary}</p>}
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          {post.publishedAt ? formatDate(post.publishedAt) : "Unpublished"} · {post.readingMinutes} min read
          {post.tags.length > 0 ? ` · ${post.tags.join(" · ")}` : ""}
        </p>
      </header>

      {post.coverUrl && (
        <Image
          src={post.coverUrl}
          alt={post.coverAlt ?? ""}
          width={1600}
          height={1067}
          priority
          sizes="(min-width: 768px) 720px, 100vw"
          className="mt-8 aspect-[3/2] w-full rounded-lg border border-border object-cover"
        />
      )}

      <div className="mt-8">
        <Prose>{post.body}</Prose>
      </div>

      <PostNewsletterCta />
      <PostFooterCta />
    </article>
  );
}
