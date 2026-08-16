import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getContent, listContent, formatDate } from "@/lib/content";
import { Prose } from "../../_components/prose";
import { SiteLink } from "../../_components/site-link";

export async function generateStaticParams() {
  const episodes = await listContent("podcast");
  return episodes.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ep = await getContent("podcast", slug);
  if (!ep) return { title: "Not found" };
  return {
    title: ep.title,
    description: ep.summary,
    openGraph: { title: ep.title, description: ep.summary, type: "article", publishedTime: ep.date },
  };
}

export default async function PodcastEpisodePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ep = await getContent("podcast", slug);
  if (!ep) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <SiteLink
        href="/podcast"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Podcast
      </SiteLink>

      <header className="mt-8 border-b border-border/60 pb-8">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{ep.title}</h1>
        {ep.summary && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{ep.summary}</p>}
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          {formatDate(ep.date)}
          {ep.duration ? ` · ${ep.duration}` : ""}
        </p>
      </header>

      {ep.youtube && (
        <div className="mt-8 aspect-video overflow-hidden rounded-xl border border-border bg-muted">
          <iframe
            src={`https://www.youtube.com/embed/${ep.youtube}`}
            title={ep.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="size-full"
          />
        </div>
      )}

      {ep.audio && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={ep.audio} className="mt-8 w-full">
          Your browser doesn&apos;t support audio playback.
        </audio>
      )}

      <div className="mt-10">
        <Prose>{ep.body}</Prose>
      </div>
    </article>
  );
}
