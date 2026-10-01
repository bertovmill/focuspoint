import type { Metadata } from "next";
import { ArrowUpRightIcon } from "lucide-react";
import { getPublishedPortfolio, type PortfolioProject } from "@/lib/portfolio";
import { SiteLink } from "../_components/site-link";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";
import { cn } from "@/lib/utils";

// Short, so an edit from Cael or the Career tab shows up within a minute.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Capabilities",
  description:
    "What I build, and the shipped projects that prove it: AI agents, retrieval, evaluation, full-stack apps and the operations around them.",
};

/**
 * Capabilities, each backed by the projects that show it. Filter with
 * `?capability=<slug>` — a stable URL to send someone for one skill. Everything
 * here comes from the database (lib/portfolio.ts); nothing is hardcoded.
 */
export default async function CapabilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ capability?: string }>;
}) {
  const { capability: selectedSlug } = await searchParams;
  const { capabilities: all, projects } = await getPublishedPortfolio();

  // A capability with nothing published behind it isn't a claim worth showing.
  const capabilities = all
    .map((c) => ({ ...c, count: projects.filter((p) => p.capabilities.some((l) => l.capabilityId === c.id)).length }))
    .filter((c) => c.count > 0);
  const selected = capabilities.find((c) => c.slug === selectedSlug) ?? null;
  const shown = selected
    ? projects.filter((p) => p.capabilities.some((l) => l.capabilityId === selected.id))
    : projects;

  return (
    <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
      <ConcreteWall sketches={false} className="bottom-auto h-[min(100%,48rem)]" />
      <div className="mx-auto max-w-6xl px-6 py-10 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10 lg:py-14">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Capabilities</p>
          <h1 className="mt-4 text-2xl font-medium tracking-tight">What I build</h1>
          <p className="mt-1 text-2xl leading-snug tracking-tight text-muted-foreground">
            And the shipped work that proves it.
          </p>

          <nav className="mt-8" aria-label="Filter by capability">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              <li>
                <FilterLink href="/capabilities" active={!selected} label="All" count={projects.length} />
              </li>
              {capabilities.map((c) => (
                <li key={c.id}>
                  <FilterLink
                    href={`/capabilities?capability=${c.slug}`}
                    active={selected?.id === c.id}
                    label={c.name}
                    count={c.count}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <section id="projects" className="mt-10 scroll-mt-24 lg:mt-0">
          {selected && (
            <header className="mb-6">
              <h2 className="text-xl font-medium tracking-tight">{selected.name}</h2>
              {selected.summary && <p className="mt-2 max-w-2xl text-muted-foreground">{selected.summary}</p>}
            </header>
          )}

          {shown.length === 0 ? (
            <p className="py-8 text-muted-foreground">Nothing published yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {shown.map((project) => (
                <li key={project.id} id={project.slug} className="scroll-mt-24">
                  <ProjectCard project={project} focusCapabilityId={selected?.id ?? null} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <SiteLink
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-full border px-3 py-1.5 text-sm transition-colors lg:rounded-md lg:border-transparent lg:px-2",
        active ? "border-foreground bg-foreground text-background lg:bg-muted lg:text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="font-mono text-xs tabular-nums opacity-70">{count}</span>
    </SiteLink>
  );
}

/**
 * One project. With a capability selected, that capability's evidence leads and
 * the rest follow; with none selected, every capability is listed with its evidence.
 */
function ProjectCard({ project, focusCapabilityId }: { project: PortfolioProject; focusCapabilityId: number | null }) {
  const focus = project.capabilities.find((l) => l.capabilityId === focusCapabilityId) ?? null;
  const rest = project.capabilities.filter((l) => l !== focus);

  return (
    <article className="rounded-xl border bg-background/80 p-6 backdrop-blur">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg font-medium tracking-tight">{project.name}</h3>
        {project.year && <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{project.year}</span>}
      </div>
      {project.summary && <p className="mt-2 text-muted-foreground">{project.summary}</p>}

      {focus && focus.evidence && (
        <p className="mt-4 border-l-2 border-foreground pl-4 leading-relaxed">{focus.evidence}</p>
      )}

      {rest.length > 0 && (
        <ul className={cn("flex flex-col gap-3", focus ? "mt-5" : "mt-4")}>
          {rest.map((l) => (
            <li key={l.capabilityId} className="text-sm">
              <SiteLink
                href={`/capabilities?capability=${l.capabilitySlug}`}
                scroll={false}
                className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                {l.capabilityName}
              </SiteLink>
              {l.evidence && <p className="mt-1 leading-relaxed">{l.evidence}</p>}
            </li>
          ))}
        </ul>
      )}

      {(project.workSlug || project.liveUrl || project.repoUrl) && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {project.workSlug && (
            <SiteLink href={`/work/${project.workSlug}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Case study <ArrowUpRightIcon className="size-3.5" />
            </SiteLink>
          )}
          {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Live <ArrowUpRightIcon className="size-3.5" />
            </a>
          )}
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              Code <ArrowUpRightIcon className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </article>
  );
}
