import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { getContent, listContent } from "@/lib/content";
import { Prose } from "../../_components/prose";
import { PostFooterCta } from "../../_components/post-footer-cta";
import { SiteLink } from "../../_components/site-link";
import { WorkTile } from "../work-tile";

export async function generateStaticParams() {
  const projects = await listContent("work");
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getContent("work", slug);
  if (!project) return { title: "Not found" };
  const title = project.org
    ? `${project.org}: ${project.title}`
    : project.title;
  return {
    title,
    description: project.outcome ?? project.summary,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: {
      title,
      description: project.outcome ?? project.summary,
      type: "article",
    },
  };
}

/** One case study: the tile as a hero, a fact row, then the story. */
export default async function WorkProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getContent("work", slug);
  if (!project) notFound();

  const facts: Array<{ label: string; value: string; href?: string }> = [];
  if (project.org) facts.push({ label: "For", value: project.org });
  if (project.role) facts.push({ label: "As", value: project.role });
  if (project.year) facts.push({ label: "When", value: project.year });
  if (project.url)
    facts.push({
      label: "Site",
      // Shown as the bare host ("aucctus.com"), linked to the full URL.
      value: project.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
      href: project.url,
    });

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <SiteLink
        href="/work"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Work
      </SiteLink>

      {/* The hero doubles as the way out to the organisation's site when there is one. */}
      {project.url ? (
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.org ?? project.title} website`}
          className="group mt-8 block"
        >
          <WorkTile project={project} featured />
        </a>
      ) : (
        <div className="group mt-8">
          <WorkTile project={project} featured />
        </div>
      )}

      <header className="mt-10 border-b border-border/60 pb-8">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {project.title}
        </h1>
        {project.outcome && (
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {project.outcome}
          </p>
        )}
        {facts.length > 0 && (
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
            {facts.map(({ label, value, href }) => (
              <div key={label}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-4 transition-colors hover:text-primary hover:underline"
                    >
                      {value}
                      <ArrowUpRightIcon className="size-3.5 opacity-60" />
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      <div className="mt-8">
        <Prose>{project.body}</Prose>
      </div>

      <PostFooterCta />
    </article>
  );
}
