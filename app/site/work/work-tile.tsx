import Image, { getImageProps } from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import type { ContentEntry } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * One project on the work grid. Typographic by default: the org name set
 * large on the project's colour, the way koto.com sets a client's logo. If
 * the entry has an `image`, that fills the tile instead and the name sits
 * over its lower edge.
 *
 * If it has a `logo`, the tile is the organisation's real wordmark on a plain
 * card that follows the site's theme instead of the brand colour: the
 * dark-type file on an off-white card in light mode, and `logoDark` (white
 * type) on a near-black card in dark mode. See `ThemedLogo` for the swap.
 *
 * With both, the photo fills the tile and the logo (the brand mark) sits
 * beside the name in the top corner, so the subject of the photo stays clear.
 */
export function WorkTile({
  project,
  featured = false,
}: {
  project: ContentEntry;
  featured?: boolean;
}) {
  const name = project.org ?? project.title;
  const logo = project.image ? undefined : project.logo;
  const photoLogo = project.image ? project.logo : undefined;

  return (
    <div
      className={cn(
        "relative flex overflow-hidden rounded-xl",
        featured ? "aspect-[4/3] sm:aspect-[16/9]" : "aspect-[4/3]",
        logo
          ? "bg-[#fbfaf8] text-[#1c1b19] ring-1 ring-inset ring-black/[0.06] dark:bg-[#141312] dark:text-white dark:ring-white/10"
          : "text-white",
      )}
      style={logo ? undefined : { backgroundColor: project.color ?? "#3a3835" }}
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
      ) : logo ? (
        <div className="absolute inset-x-0 top-0 bottom-20 grid place-items-center px-8 sm:px-12">
          <ThemedLogo
            light={logo}
            dark={project.logoDark}
            alt={name}
            featured={featured}
          />
        </div>
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

      {photoLogo && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent p-5 pb-12 sm:gap-3">
          <Image
            src={photoLogo}
            alt=""
            width={246}
            height={258}
            className={cn("w-auto", featured ? "h-9 sm:h-11" : "h-7 sm:h-8")}
          />
          <span
            className={cn(
              "font-black leading-none tracking-tight text-white",
              featured ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
            )}
          >
            {name}
          </span>
        </div>
      )}

      <div
        className={cn(
          "relative mt-auto flex w-full items-end justify-between gap-4 p-5",
          !logo &&
            (project.image
              ? "bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-16"
              : "bg-gradient-to-t from-black/50 to-transparent"),
        )}
      >
        <div>
          <p
            className={cn(
              "font-mono text-[11px] uppercase tracking-[0.18em]",
              logo ? "opacity-60" : "text-white/70",
            )}
          >
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

/**
 * The wordmark as a `<picture>`: the browser fetches only the file that
 * matches its colour scheme and swaps the moment the scheme changes, with no
 * JavaScript and no second download. Both files still go through next/image's
 * optimizer via `getImageProps`. `prefers-color-scheme` is also what the
 * site's `dark:` styles key on, so the logo and the card behind it always
 * agree.
 */
function ThemedLogo({
  light,
  dark,
  alt,
  featured,
}: {
  light: string;
  dark?: string;
  alt: string;
  featured: boolean;
}) {
  const common = {
    alt,
    width: 2000,
    height: 411,
    sizes: featured
      ? "(min-width: 640px) 30rem, 72vw"
      : "(min-width: 640px) 18rem, 72vw",
  };
  const {
    props: { srcSet: darkSrcSet },
  } = getImageProps({ ...common, src: dark ?? light });
  const {
    props: { srcSet: lightSrcSet, ...img },
  } = getImageProps({ ...common, src: light });

  return (
    <picture
      className={cn(
        "block transition-transform duration-500 group-hover:scale-[1.03]",
        featured ? "w-[min(72%,30rem)]" : "w-[min(72%,18rem)]",
      )}
    >
      {dark && (
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={darkSrcSet}
          sizes={common.sizes}
        />
      )}
      <img {...img} srcSet={lightSrcSet} className="h-auto w-full" />
    </picture>
  );
}
