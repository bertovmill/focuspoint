import type { Metadata } from "next";
import { listContent } from "@/lib/content";
import { SiteLink } from "../_components/site-link";
import { WorkTile } from "./work-tile";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Work",
  description:
    "Projects I've shipped: enterprise AI pilots, a founder community, and a personal agent.",
};

/**
 * The work index, laid out like koto.com/work: a sidebar that stays put with
 * the title and section list, and a grid of project tiles beside it. On a
 * phone the sidebar becomes a header above the tiles.
 */
export default async function WorkIndexPage() {
  const projects = await listContent("work");

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10 lg:py-14">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Work
        </p>
        <h1 className="mt-4 text-2xl font-medium tracking-tight">
          Things I&apos;ve shipped
        </h1>
        <p className="mt-1 text-2xl leading-snug tracking-tight text-muted-foreground">
          What was broken, what I did, what changed.
        </p>

        <nav className="mt-10 hidden lg:block" aria-label="Sections">
          <ul className="flex flex-col gap-4">
            <li>
              <a
                href="#projects"
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <span
                  className="size-1 rounded-full bg-foreground"
                  aria-hidden
                />
                Projects
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <section id="projects" className="mt-10 scroll-mt-24 lg:mt-0">
        {projects.length === 0 ? (
          <p className="py-8 text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((project, i) => (
              <li
                key={project.slug}
                className={i === 0 ? "sm:col-span-2" : undefined}
              >
                <SiteLink
                  href={`/work/${project.slug}`}
                  className="group block"
                >
                  <WorkTile project={project} featured={i === 0} />
                </SiteLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
