import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PUBLIC_HOST, SITE_PREFIX, BOOKING_URL, CHANNELS, isPublicHost } from "@/lib/public-site";
import { SiteBasePathProvider, SiteLink } from "./_components/site-link";
import { SiteNav } from "./_components/site-nav";
import { NewsletterPopup } from "./_components/newsletter-popup";
import { SubscribeForm } from "./_components/subscribe-form";
import { PageGrain } from "./_components/grain";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${PUBLIC_HOST}`),
  title: {
    default: "Berto Mill",
    template: "%s · Berto Mill",
  },
  // The public site gets its own mark; Cael's orb stays on cael.bertomill.com.
  icons: {
    icon: "/bm-icon.svg",
    // Safari ignores SVG for apple-touch-icon; the PNG is rendered from the same
    // source by scripts/render-bm-apple-icon.mjs.
    apple: "/bm-apple-icon.png",
  },
  description:
    "Go-to-market lead at Aucctus, founder of MakersLounge, and builder of AI agents. Writing and a podcast on putting AI to work.",
  openGraph: {
    siteName: "Berto Mill",
    type: "website",
    url: `https://${PUBLIC_HOST}`,
    images: [{ url: "/berto-headshot.jpg", width: 800, height: 800, alt: "Berto Mill" }],
  },
  twitter: {
    // Square portrait, so the large-image card would letterbox it badly.
    card: "summary",
    images: ["/berto-headshot.jpg"],
  },
};

export default async function SiteLayout({ children }: { readonly children: ReactNode }) {
  // On bertomill.com the rewrite makes `/site` invisible, so links are already clean.
  // Anywhere else the prefix is part of the real URL and every link has to carry it.
  const host = (await headers()).get("host");
  const basePath = isPublicHost(host) ? "" : SITE_PREFIX;

  return (
    <SiteBasePathProvider value={basePath}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <PageGrain />
        <SiteNav />
        <main className="flex-1">{children}</main>
        <NewsletterPopup />
        <footer className="border-t border-border/60">
          {/* The always-available way to subscribe. The popup asks once and is gone
              for good; this is here on every page, for everyone who dismissed it. */}
          <div className="border-b border-border/60">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-md">
                <h2 className="font-medium tracking-tight text-foreground">Get what I&apos;m learning</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Occasional notes on building AI agents and running a life with one. No spam, one
                  click to leave.
                </p>
              </div>
              <SubscribeForm className="sm:max-w-sm" />
            </div>
          </div>
          {/* Socials used to live only in the menu sheet, so most visitors never saw them. */}
          <div className="border-b border-border/60">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-sm">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow</span>
              {CHANNELS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-foreground transition-colors hover:text-primary"
                  rel="me noreferrer"
                  target="_blank"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Berto Mill</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <SiteLink href="/about" className="transition-colors hover:text-foreground">
                About
              </SiteLink>
              <SiteLink href="/writing" className="transition-colors hover:text-foreground">
                Writing
              </SiteLink>
              <SiteLink href="/podcast" className="transition-colors hover:text-foreground">
                Podcast
              </SiteLink>
              <SiteLink href="/building" className="transition-colors hover:text-foreground">
                Building
              </SiteLink>
              <SiteLink href="/newsletter" className="transition-colors hover:text-foreground">
                Newsletter
              </SiteLink>
              <a
                href={BOOKING_URL}
                className="transition-colors hover:text-foreground"
                rel="noreferrer"
                target="_blank"
              >
                Book a meeting
              </a>
              <a
                href="https://github.com/bertovmill"
                className="transition-colors hover:text-foreground"
                rel="me noreferrer"
                target="_blank"
              >
                GitHub
              </a>
              <a href="mailto:rmill@aucctus.com" className="transition-colors hover:text-foreground">
                Email
              </a>
            </div>
          </div>
        </footer>
      </div>
    </SiteBasePathProvider>
  );
}
