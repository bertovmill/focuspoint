"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps } from "react";

/**
 * Public URLs are clean (`bertomill.com/writing`) but the pages live at `/site/writing`.
 * On the public host the rewrite hides that; anywhere else — localhost, a Vercel
 * preview URL, cael.bertomill.com — the `/site` prefix is real and links need it.
 *
 * The server layout resolves which case it's in once and hands the prefix down here,
 * so every link in the tree is written the public way and works in both.
 */
const BasePathContext = createContext("");

export function SiteBasePathProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <BasePathContext.Provider value={value}>{children}</BasePathContext.Provider>;
}

export function useSiteHref() {
  const base = useContext(BasePathContext);
  return (href: string) => {
    if (!href.startsWith("/")) return href;
    if (href === "/") return base || "/";
    return `${base}${href}`;
  };
}

/** Drop-in `next/link` that resolves site-relative hrefs. External links pass through. */
export function SiteLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const siteHref = useSiteHref();
  const external = /^https?:\/\/|^mailto:|^#/.test(href);
  return <Link href={external ? href : siteHref(href)} {...props} />;
}
