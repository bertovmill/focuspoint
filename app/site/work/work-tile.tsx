import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import type { ContentEntry } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * One project on the work grid. Typographic by default: the org name set
 * large on the project's colour, the way koto.com sets a client's logo. If
 * the entry has an `image`, that fills the tile instead and the name sits
 * over its lower edge.
 */
export function WorkTile({
  project,
  featured = false,
}: {
  project: ContentEntry;
  featured?: boolean;
}) {
  const name = project.org ?? project.title;
  return (
    <div
      className={cn(
        "relative flex overflow-hidden rounded-xl text-white",
        featured ? "aspect-[4/3] sm:aspect-[16/9]" : "aspect-[4/3]",
      )}
      style={{ backgroundColor: project.color ?? "#3a3835" }}
    >
      {project.image ? (
        <Image
          src={project.image}
          alt=""
          fill
          sizes={
            featured
              ? "(min-width: 1024px) 56rem, 100vw"
              : "(min-width: 1024px) 28rem, 100vw"
          }
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="absolute inset-x-0 top-0 bottom-20 grid place-items-center px-8">
          <span
            className={cn(
              "text-center font-black leading-none tracking-tight text-white/90 transition-transform duration-500 group-hover:scale-[1.03]",
              featured
                ? "text-4xl sm:text-6xl lg:text-7xl"
                : "text-3xl sm:text-4xl",
            )}
          >
            {name}
          </span>
        </div>
      )}

      <div className="relative mt-auto flex w-full items-end justify-between gap-4 bg-gradient-to-t from-black/50 to-transparent p-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">
            {[project.role, project.year].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug sm:text-base">
            {project.title}
          </p>
        </div>
        <ArrowUpRightIcon className="size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  );
}
