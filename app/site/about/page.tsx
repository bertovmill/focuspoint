import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { RevealOnView } from "../_components/reveal-on-view";
import { AnimatedHeading } from "../_components/animated-heading";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";
import { PhotoRevealGrid } from "../_components/photo-reveal-grid";

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
const SECTIONS: readonly Section[] = [
  {
    id: "my-story",
    label: "My story",
    body: (
      <div className="space-y-6">
        <p>
          I grew up playing competitive sports. I went on to play at Western University where I
          won two national football championships.
        </p>
        <p>
          I then joined Ivey Business School and started my career in corporate innovation. I
          then joined Aucctus, an AI start up that builds AI innovation systems for enterprises.
        </p>
        <p>
          I&apos;ve always been fascinated by digital creativity, spending hours on the paint tool
          when Microsoft first released it, and making blog pages when I was 12 years old.
          I&apos;m passionate about building the best possible products and solving information
          that way.
        </p>
      </div>
    ),
  },
];

/* Small uppercase mono label, the same one the nav and homepage use. */
const LABEL = "font-mono text-xs uppercase tracking-[0.18em]";

export default function AboutPage() {
  return (
    <div className="px-6">
      {/* Hero, laid out like koto.com/about: the title on the left, the tagline
          on the right, and the jump-to row along the bottom edge. It sits on the
          same lit concrete wall as the homepage, without the chalk drawings. */}
      <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
        <ConcreteWall />
        <RevealOnView
          as="section"
          intensity="hero"
          staggerChildren
          className="mx-auto max-w-6xl py-16 sm:py-24"
        >
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">About</h1>
              {/* A print taped to the concrete: white border, a slight tilt, a
                  strip of tape at the top and a soft shadow on the wall. */}
              <figure className="relative mt-10 w-full max-w-sm -rotate-2 bg-white p-2.5 pb-9 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.25)] transition-transform duration-500 hover:rotate-0 sm:max-w-md">
                <span
                  aria-hidden
                  className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-3 bg-[#f3ecd8]/80 shadow-sm backdrop-blur-[1px]"
                />
                <Image
                  src="/site-art/about-community.jpg"
                  alt="Four people laughing around a table at a community event"
                  width={1400}
                  height={934}
                  sizes="(min-width: 640px) 448px, 90vw"
                  priority
                  className="block h-auto w-full"
                />
              </figure>
            </div>
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
      </div>

      {/* Photos from the moments, each hidden until hovered (after netic.ai/company). */}
      <section id="in-the-room" aria-label="Photos" className="mx-auto mb-14 max-w-6xl">
        <PhotoRevealGrid />
      </section>

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
