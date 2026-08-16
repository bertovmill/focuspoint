import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SiteLink } from "./site-link";
import { RevealOnView } from "./reveal-on-view";

export type StoryCardProps = {
  /** Kicker above the title — "01 · Cael". */
  eyebrow: string;
  title: string;
  description: string;
  /** Small facts rendered as pills at the top of the card — live counts, dates. */
  tags?: string[];
  href: string;
  imageSrc: string;
  /** The card's own accent, used for the gradient hairline around it. */
  gradientFrom: string;
  gradientTo: string;
  /** Only the first card should preload its art. */
  priority?: boolean;
  revealDelay?: number;
  className?: string;
};

/**
 * One full-height panel in the homepage's right-hand column: abstract art under
 * a wash of black, with the headline and a single onward link sitting on top.
 * The whole card is the link; the pill at the bottom is an affordance, not a
 * second target.
 */
export function StoryCard({
  eyebrow,
  title,
  description,
  tags = [],
  href,
  imageSrc,
  gradientFrom,
  gradientTo,
  priority = false,
  revealDelay = 0,
  className,
}: StoryCardProps) {
  return (
    <article className={cn("group relative", className)}>
      <RevealOnView
        delay={revealDelay}
        className="rounded-3xl p-px shadow-[0_10px_60px_-15px_rgba(0,0,0,0.5)] lg:h-full"
        style={{ backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
      >
        <SiteLink
          href={href}
          className="relative block overflow-hidden rounded-[calc(1.5rem-1px)] bg-black lg:h-full"
        >
          <div className="relative aspect-4/3 w-full sm:aspect-16/9 lg:aspect-auto lg:h-full">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority={priority}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
            {/* Keeps the copy legible no matter how bright the render gets. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
          </div>

          {tags.length > 0 && (
            <div className="absolute inset-x-5 top-5 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[11px] tracking-wide text-white/75 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/50">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">{description}</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/20">
              Take a look
              <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </div>
        </SiteLink>
      </RevealOnView>
    </article>
  );
}
