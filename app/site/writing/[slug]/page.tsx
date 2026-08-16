import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getContent, listContent, formatDate } from "@/lib/content";
import { Prose } from "../../_components/prose";
import { PostFooterCta } from "../../_components/post-footer-cta";
import { SiteLink } from "../../_components/site-link";

export async function generateStaticParams() {
  const posts = await listContent("writing");
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getContent("writing", slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.summary,
    openGraph: { title: post.title, description: post.summary, type: "article", publishedTime: post.date },
  };
}

export default async function WritingPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getContent("writing", slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
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
          {formatDate(post.date)} · {post.readingMinutes} min read
          {post.tags.length > 0 ? ` · ${post.tags.join(" · ")}` : ""}
        </p>
      </header>

      <div className="mt-8">
        <Prose>{post.body}</Prose>
      </div>

      <PostFooterCta />
    </article>
  );
}
