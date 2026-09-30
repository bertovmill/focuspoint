"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BOOKING_URL, CAEL_SIGN_IN_URL, CHANNELS } from "@/lib/public-site";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { SiteLink, useSiteHref } from "./site-link";
import { SocialIcons } from "./social-icons";

// Building stays reachable at /building; it left the header when Work arrived.
const NAV = [
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/writing", label: "Writing" },
  { href: "/podcast", label: "Podcast" },
  { href: "/chat", label: "Ask Cael" },
];

/* Small uppercase mono label, used for the desktop links and the menu eyebrows. */
const LABEL = "font-mono text-sm uppercase tracking-[0.18em]";

export function SiteNav() {
  const pathname = usePathname();
  const siteHref = useSiteHref();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(siteHref(href));

  // Inner pages get Koto's compact box: name, the page you're on, and a dot
  // that opens the full menu. Only the homepage shows the whole link row.
  const home = siteHref("/");
  const isHome = pathname === home || pathname === home.replace(/\/$/, "") || pathname === "/";
  const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  const pageLabel =
    NAV.find((item) => isActive(item.href))?.label ??
    lastSegment.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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

  // Full-screen menu sheet, like koto.com. Portaled to <body> so the header
  // can never trap its fixed positioning.
  const menuSheet =
    open &&
        createPortal(
          <div
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-50 flex flex-col bg-background"
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
              {/* Accounts live on the private host, so this leaves the site. */}
              <a
                href={CAEL_SIGN_IN_URL}
                onClick={() => setOpen(false)}
                className={cn(LABEL, "mt-10 ml-6 inline-flex text-muted-foreground transition-colors hover:text-foreground")}
              >
                Sign in
              </a>
            </div>

            <div className="border-t border-border/60 px-6 py-6">
              <p className={cn(LABEL, "text-muted-foreground")}>Channels</p>
              <ul className="mt-4 flex flex-col gap-2">
                {CHANNELS.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
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
        );

  if (!isHome) {
    return (
      <header className="relative z-50 px-6 pt-4">
        <nav className="inline-flex h-14 items-center gap-8 rounded-md border border-border/60 bg-muted/70 pl-5 pr-3 backdrop-blur-md">
          <SiteLink href="/" className="group font-medium tracking-tight">
            <span className="transition-colors group-hover:text-primary">Berto Mill</span>
          </SiteLink>
          <span className={cn(LABEL, "min-w-24 text-muted-foreground")}>{pageLabel}</span>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-md transition-colors hover:bg-background/60"
          >
            <span className="size-1.5 rounded-full bg-muted-foreground" />
          </button>
        </nav>
        {menuSheet}
      </header>
    );
  }

  return (
    <header className="relative z-50">
      {/* No bar behind the links: the header is transparent and sits over the
          homepage wall, full-width with everything flush left, like koto.com. */}
      <nav className="flex h-16 items-center gap-10 px-6">
        <SiteLink href="/" className="group flex items-center gap-3 text-lg font-medium tracking-tight">
          <Image
            src="/berto-headshot.jpg"
            alt="Berto Mill"
            width={36}
            height={36}
            priority
            className="size-9 rounded-full object-cover"
          />
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
          {/* Icons only from lg up: at sm/md they'd crowd the links row. */}
          <SocialIcons className="hidden lg:flex" />
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
            className="rounded-full bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
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

      {menuSheet}
    </header>
  );
}
