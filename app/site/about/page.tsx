import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { RevealOnView } from "../_components/reveal-on-view";
import { AnimatedHeading } from "../_components/animated-heading";

/** The line beside "About". Berto's words, verbatim. */
const TAGLINE = ["Community builder, system implementer,", "innovation driver."];

export const metadata: Metadata = {
  title: "About",
  description: TAGLINE.join(" "),
};

/**
 * The page's sections, in the order they appear. Each one gets a jump-to link
 * under the tagline and an anchored block below the band. Copy is handwritten
 * by Berto; nothing here is generated. An empty list hides the jump-to row.
 */
type Section = { id: string; label: string; body: ReactNode };
const SECTIONS: readonly Section[] = [];

/* Small uppercase mono label, the same one the nav and homepage use. */
const LABEL = "font-mono text-xs uppercase tracking-[0.18em]";

export default function AboutPage() {
  return (
    <div className="px-6">
      {/* Hero, laid out like koto.com/about: the title on the left, the tagline
          on the right, and the jump-to row along the bottom edge. */}
      <RevealOnView
        as="section"
        intensity="hero"
        staggerChildren
        className="mx-auto max-w-6xl py-12 sm:py-16"
      >
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">About</h1>
          <AnimatedHeading
            as="p"
            className="text-3xl leading-snug tracking-tight text-muted-foreground sm:text-4xl"
            lines={TAGLINE}
          />
        </div>

        {SECTIONS.length > 0 && (
          <nav
            aria-label="Jump to"
            className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-3 lg:ml-auto lg:w-1/2 lg:pl-0"
          >
            <span className={`${LABEL} text-muted-foreground`}>(Jump to)</span>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`${LABEL} text-foreground transition-colors hover:text-primary`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}
      </RevealOnView>

      {/* The band, full bleed like koto.com/about: a linocut collage that runs
          edge to edge past the page gutters. Art from scripts/generate-site-art.mjs. */}
      <RevealOnView as="div" className="-mx-6">
        <div className="relative h-56 w-full overflow-hidden sm:h-72 lg:h-96">
          <Image
            src="/site-art/about-band.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </RevealOnView>

      {SECTIONS.length > 0 && (
        <div className="mx-auto max-w-6xl">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-border/60">
              <RevealOnView delay={i * 0.04} className="py-14 lg:grid lg:grid-cols-2 lg:gap-14">
                <h2 className={`${LABEL} text-muted-foreground`}>{s.label}</h2>
                <div className="mt-6 max-w-[62ch] text-lg leading-relaxed lg:mt-0">{s.body}</div>
              </RevealOnView>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
