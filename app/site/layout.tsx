import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PUBLIC_HOST, SITE_PREFIX, BOOKING_URL, isPublicHost } from "@/lib/public-site";
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
  description:
    "I build AI agents and write about it. Currently building Cael, a personal life agent — in public, with the numbers showing.",
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
  // Resend is provisioned through the Vercel Marketplace; until its env vars land
  // the signup form can't submit, so the popup stays hidden rather than erroring.
  const newsletterEnabled = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
  const basePath = isPublicHost(host) ? "" : SITE_PREFIX;

  return (
    <SiteBasePathProvider value={basePath}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <PageGrain />
        <SiteNav />
        <main className="flex-1">{children}</main>
        <NewsletterPopup enabled={newsletterEnabled} />
        <footer className="border-t border-border/60">
          {/* The always-available way to subscribe. The popup asks once and is gone
              for good; this is here on every page, for everyone who dismissed it. */}
          {newsletterEnabled && (
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
          )}
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Berto Mill</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
