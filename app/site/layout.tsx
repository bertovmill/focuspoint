import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PUBLIC_HOST, SITE_PREFIX, CHANNELS, isPublicHost } from "@/lib/public-site";
import { SiteBasePathProvider } from "./_components/site-link";
import { SiteNav } from "./_components/site-nav";
import { NewsletterPopup } from "./_components/newsletter-popup";
import { SiteCommandPalette } from "./_components/site-command-palette";
import { SiteFooter } from "./_components/site-footer";
import { PageGrain } from "./_components/grain";
import { AskAiProvider } from "./_components/ask-ai";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${PUBLIC_HOST}`),
  title: {
    // The site goes by his full name; "Berto" stays in the prose and the JSON-LD
    // alternateName so searches for either land here.
    default: "Robert Mill",
    template: "%s · Robert Mill",
  },
  // The public site gets its own mark; Cael's orb stays on cael.bertomill.com.
  icons: {
    icon: "/bm-icon.svg",
    // Safari ignores SVG for apple-touch-icon; the PNG is rendered from the same
    // source by scripts/render-bm-apple-icon.mjs.
    apple: "/bm-apple-icon.png",
  },
  description:
    "GTM lead at Aucctus who builds the AI agents and pipeline systems his team runs on. Writing on AI-native go-to-market.",
  openGraph: {
    siteName: "Robert Mill",
    type: "website",
    url: `https://${PUBLIC_HOST}`,
    images: [{ url: "/berto-headshot.jpg", width: 800, height: 800, alt: "Robert Mill" }],
  },
  twitter: {
    // Square portrait, so the large-image card would letterbox it badly.
    card: "summary",
    images: ["/berto-headshot.jpg"],
  },
};

const PERSON_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Robert Mill",
  alternateName: "Berto Mill",
  url: `https://${PUBLIC_HOST}`,
  image: `https://${PUBLIC_HOST}/berto-headshot.jpg`,
  jobTitle: "Go-to-Market Lead",
  worksFor: { "@type": "Organization", name: "Aucctus", url: "https://aucctus.com" },
  alumniOf: "Ivey Business School at Western University",
  address: { "@type": "PostalAddress", addressLocality: "Toronto", addressCountry: "CA" },
  sameAs: [...CHANNELS.map((c) => c.href), "https://github.com/bertovmill"],
};

export default async function SiteLayout({ children }: { readonly children: ReactNode }) {
  // On bertomill.com the rewrite makes `/site` invisible, so links are already clean.
  // Anywhere else the prefix is part of the real URL and every link has to carry it.
  const host = (await headers()).get("host");
  const basePath = isPublicHost(host) ? "" : SITE_PREFIX;

  return (
    <SiteBasePathProvider value={basePath}>
      {/* AskAiProvider renders the page wrapper itself, so it can slide the page
          over when the Ask AI panel opens. */}
      <AskAiProvider>
        <PageGrain />
        <script
          type="application/ld+json"
          // Tells search engines and AI assistants that both names are the same person.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON_JSON_LD) }}
        />
        <SiteNav />
        <main className="flex-1">{children}</main>
        <NewsletterPopup />
        {/* `/` or ⌘K anywhere on the site opens search; nothing on screen advertises it. */}
        <SiteCommandPalette />
        <SiteFooter />
      </AskAiProvider>
    </SiteBasePathProvider>
  );
}
