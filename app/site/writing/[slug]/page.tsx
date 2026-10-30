import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { formatDate } from "@/lib/content";
import { getVisiblePost, PUBLIC_SITE_URL } from "@/lib/posts";
import { CHANNELS } from "@/lib/public-site";
import { Prose } from "../../_components/prose";
import { PostFooterCta } from "../../_components/post-footer-cta";
import { PostNewsletterCta } from "../../_components/post-newsletter-cta";
import { SiteLink } from "../../_components/site-link";
import { ReadingProgress } from "./reading-progress";

// Posts are database rows Cael edits (lib/posts.ts), and a draft is shown only
// with its ?preview= token, so this page renders per request.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

const AUTHOR = "Robert Mill";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const post = await getVisiblePost(slug, preview);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.summary,
    keywords: post.tags,
    authors: [{ name: AUTHOR, url: PUBLIC_SITE_URL }],
    alternates: { canonical: `/writing/${post.slug}` },
    robots: post.status === "published" ? undefined : { index: false, follow: false },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: `/writing/${post.slug}`,
      authors: [AUTHOR],
      tags: post.tags,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: post.coverAlt ?? post.title }] : undefined,
    },
    twitter: {
      card: post.coverUrl ? "summary_large_image" : "summary",
      creator: "@robrt_mill",
      images: post.coverUrl ? [post.coverUrl] : undefined,
    },
  };
}

export default async function WritingPostPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const post = await getVisiblePost(slug, preview);
  if (!post) notFound();
  const isDraft = post.status !== "published";

  // Article structured data, so search engines tie the post to Robert Mill and
  // his profiles (sameAs) and can show the cover and dates in results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    image: post.coverUrl ? [post.coverUrl] : undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    keywords: post.tags.join(", "),
    mainEntityOfPage: `${PUBLIC_SITE_URL}/writing/${post.slug}`,
    author: { "@type": "Person", name: AUTHOR, url: PUBLIC_SITE_URL, sameAs: CHANNELS.map((c) => c.href) },
  };

  return (
    <article id="writing-article" className="px-6 pt-10 pb-24">
      {!isDraft && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      <ReadingProgress targetId="writing-article" />

      <div className="mx-auto max-w-[42rem]">
        {isDraft && (
          <p className="mb-8 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Draft preview — not public yet
          </p>
        )}
        <SiteLink
          href="/writing"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeftIcon className="size-3.5" />
          All writing
        </SiteLink>
      </div>

      <header className="mx-auto mt-12 max-w-4xl text-center">
        {post.tags.length > 0 && (
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {post.tags.slice(0, 3).join(" · ")}
          </p>
        )}
        <h1 className="font-display mt-5 text-5xl leading-[1.02] font-medium tracking-tight text-balance sm:text-7xl">
          {post.title}
        </h1>
        {post.summary && (
          <p className="mx-auto mt-6 max-w-2xl font-serif text-xl leading-relaxed text-muted-foreground italic text-balance sm:text-2xl">
            {post.summary}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Image
            src="/berto-headshot.jpg"
            alt=""
            width={80}
            height={80}
            className="size-10 rounded-full object-cover"
          />
          <p className="text-left text-sm leading-tight">
            <span className="font-medium">{AUTHOR}</span>
            <span className="block font-mono text-xs text-muted-foreground">
              {post.publishedAt ? formatDate(post.publishedAt) : "Unpublished"} · {post.readingMinutes} min read
            </span>
          </p>
        </div>
      </header>

      {post.coverUrl && (
        <Image
          src={post.coverUrl}
          alt={post.coverAlt ?? ""}
          width={1600}
          height={1067}
          priority
          sizes="(min-width: 1024px) 960px, 100vw"
          className="mx-auto mt-12 aspect-[3/2] w-full max-w-5xl rounded-3xl object-cover"
        />
      )}

      <div className="mx-auto mt-14 max-w-[42rem]">
        <Prose variant="article">{post.body}</Prose>

        <p aria-hidden className="font-display mt-16 text-center text-2xl tracking-[1em] pl-[1em] text-primary">
          ✳✳✳
        </p>

        <PostNewsletterCta />
        <PostFooterCta />
      </div>
    </article>
  );
}
