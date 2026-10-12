import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PUBLIC_HOST, SITE_PREFIX, isPublicHost } from "@/lib/public-site";
import { SiteBasePathProvider } from "./_components/site-link";
import { SiteNav } from "./_components/site-nav";
import { NewsletterPopup } from "./_components/newsletter-popup";
import { SiteFooter } from "./_components/site-footer";
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
        <SiteFooter />
      </div>
    </SiteBasePathProvider>
  );
}
