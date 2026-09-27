"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BOOKING_URL, CAEL_SIGN_IN_URL } from "@/lib/public-site";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { SiteLink, useSiteHref } from "./site-link";

// Building stays reachable at /building; it left the header when Work arrived.
const NAV = [
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/writing", label: "Writing" },
  { href: "/podcast", label: "Podcast" },
  { href: "/chat", label: "Ask Cael" },
];

const CHANNELS = [
  { href: "https://www.linkedin.com/in/bertomill", label: "LinkedIn" },
  { href: CAEL_SIGN_IN_URL, label: "Sign in" },
];

/* Small uppercase mono label, used for the desktop links and the menu eyebrows. */
const LABEL = "font-mono text-xs uppercase tracking-[0.18em]";

export function SiteNav() {
  const pathname = usePathname();
  const siteHref = useSiteHref();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(siteHref(href));

  // Close on route change and keep the page from scrolling behind the overlay.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-5xl items-center gap-10 px-6">
        <SiteLink href="/" className="group font-medium tracking-tight">
          <span className="transition-colors group-hover:text-primary">
            Berto Mill
          </span>
        </SiteLink>

        {/* Desktop: links sit right beside the name, Koto-style. Actions stay on the right. */}
        <div className="hidden items-center gap-7 sm:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className={cn(
                LABEL,
                "text-muted-foreground transition-colors hover:text-foreground",
                isActive(item.href) && "text-foreground",
              )}
            >
              {item.label}
            </SiteLink>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-4 sm:flex">
          {/* Accounts live on the private host, so this leaves the site. */}
          <a
            href={CAEL_SIGN_IN_URL}
            className={cn(
              LABEL,
              "text-muted-foreground transition-colors hover:text-foreground",
            )}
          >
            Sign in
          </a>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Book a meeting
          </a>
          <ModeToggle />
        </div>

        {/* Mobile: a boxed MENU button on the right. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen(true)}
          className={cn(
            LABEL,
            "ml-auto rounded-md border border-border/60 bg-muted/60 px-4 py-2.5 text-foreground transition-colors hover:bg-muted sm:hidden",
          )}
        >
          Menu
        </button>
      </nav>

      {/* Mobile menu: a full-screen sheet with a big link list, like koto.com.
          Portaled to <body>: the header's backdrop-filter would otherwise trap
          a fixed child inside it. */}
      {open &&
        createPortal(
          <div
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-50 flex flex-col bg-background sm:hidden"
          >
            <div className="flex h-16 items-center px-6">
              <SiteLink
                href="/"
                onClick={() => setOpen(false)}
                className="font-medium tracking-tight"
              >
                Berto Mill
              </SiteLink>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={cn(
                  LABEL,
                  "ml-auto rounded-md border border-border/60 bg-muted/60 px-4 py-2.5 text-foreground",
                )}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6">
              <p className={cn(LABEL, "text-muted-foreground")}>Explore</p>
              <ul className="mt-6 flex flex-col">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <SiteLink
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block py-2.5 text-3xl tracking-tight transition-colors hover:text-primary",
                        isActive(item.href)
                          ? "text-primary"
                          : "text-foreground",
                      )}
                    >
                      {item.label}
                    </SiteLink>
                  </li>
                ))}
              </ul>

              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="mt-10 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
              >
                Book a meeting
              </a>
            </div>

            <div className="border-t border-border/60 px-6 py-6">
              <p className={cn(LABEL, "text-muted-foreground")}>Channels</p>
              <ul className="mt-4 flex flex-col gap-2">
                {CHANNELS.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        LABEL,
                        "text-foreground transition-colors hover:text-primary",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <ModeToggle />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
