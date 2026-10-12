import Image from "next/image";
import { BOOKING_URL, CHANNELS } from "@/lib/public-site";
import { SiteLink } from "./site-link";
import { SocialIcons } from "./social-icons";
import { SubscribeForm } from "./subscribe-form";

/**
 * The site footer: a headline, link columns, the social row, and the one
 * always-available newsletter card. The popup asks once and is gone for good;
 * this card is here on every page for everyone who dismissed it.
 */

const EXPLORE = [
  { href: "/about", label: "About" },
  { href: "/writing", label: "Writing" },
  { href: "/podcast", label: "Podcast" },
  { href: "/building", label: "Building" },
  { href: "/newsletter", label: "Newsletter" },
] as const;

const CONTACT = [
  { href: BOOKING_URL, label: "Book a meeting" },
  { href: "mailto:rmill@aucctus.com", label: "Email" },
  { href: "https://github.com/bertovmill", label: "GitHub" },
] as const;

const linkClass = "text-sm text-foreground/80 transition-colors hover:text-primary";

function ColumnHeading({ children }: { readonly children: string }) {
  return (
    <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h3>
  );
}

export function SiteFooter() {
  return (
    <footer id="footer" className="border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
        <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-20">
          <div>
            <h2 className="max-w-md text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl">
              Putting AI to work,
              <br />
              <span className="text-muted-foreground">one agent at a time.</span>
            </h2>

            <div className="mt-12 grid grid-cols-2 gap-10 sm:grid-cols-3">
              <div>
                <ColumnHeading>Explore</ColumnHeading>
                <ul className="space-y-2.5">
                  {EXPLORE.map((item) => (
                    <li key={item.href}>
                      <SiteLink href={item.href} className={linkClass}>
                        {item.label}
                      </SiteLink>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <ColumnHeading>Follow</ColumnHeading>
                <ul className="space-y-2.5">
                  {CHANNELS.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className={linkClass} rel="me noreferrer" target="_blank">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <ColumnHeading>Contact</ColumnHeading>
                <ul className="space-y-2.5">
                  {CONTACT.map((item) => (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={linkClass}
                        rel={item.href.startsWith("http") ? "me noreferrer" : undefined}
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <SocialIcons variant="buttons" className="mt-12" />
          </div>

          <NewsletterCard />
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Berto Mill</p>
          <p>Toronto, Canada · Built with Cael</p>
        </div>
      </div>
    </footer>
  );
}

/** Portrait art card with the subscribe form on a frosted panel at the bottom. */
function NewsletterCard() {
  return (
    <aside
      id="newsletter-card"
      aria-labelledby="newsletter-card-heading"
      className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-border/60 bg-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)] lg:mx-0"
    >
      <div className="relative aspect-[3/4]">
        <Image
          src="/site-art/writing.webp"
          alt=""
          fill
          sizes="300px"
          className="object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/15 bg-white/10 p-4 text-white backdrop-blur-md">
          <h3 id="newsletter-card-heading" className="text-base font-medium leading-snug">
            Get what I&apos;m learning
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">
            Occasional notes on building AI agents and running a life with one. No spam, one click
            to leave.
          </p>
          <SubscribeForm
            variant="stacked"
            className="mt-3.5 [&_input]:border-white/20 [&_input]:bg-white/10 [&_input]:text-white [&_input]:placeholder:text-white/50 [&_p]:text-white/80"
          />
        </div>
      </div>
    </aside>
  );
}
