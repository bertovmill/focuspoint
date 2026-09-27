import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
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

  const facts: Array<[string, string]> = [];
  if (project.org) facts.push(["For", project.org]);
  if (project.role) facts.push(["As", project.role]);
  if (project.year) facts.push(["When", project.year]);

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <SiteLink
        href="/work"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Work
      </SiteLink>

      <div className="group mt-8">
        <WorkTile project={project} featured />
      </div>

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
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium">{value}</dd>
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
