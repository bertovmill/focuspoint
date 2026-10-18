"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BOOKING_URL, CHANNELS } from "@/lib/public-site";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { SiteLink, useSiteHref } from "./site-link";
import { SocialIcons } from "./social-icons";
import { AskAiButton } from "./ask-ai";
import { SparklesIcon } from "lucide-react";

// Building stays reachable at /building; it left the header when Work arrived.
// The chat is no tab either: it is the Ask AI button at the right of every header.
const NAV = [
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/capabilities", label: "Capabilities" },
  { href: "/writing", label: "Writing" },
  { href: "/podcast", label: "Podcast" },
  { href: "/fitness", label: "Fitness" },
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
                Robert Mill
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

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="inline-flex rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
                >
                  Book a meeting
                </a>
                <AskAiButton onClick={() => setOpen(false)} className="px-5 py-3" />
              </div>
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
      <header className="relative z-50 flex items-center justify-between gap-3 px-6 pt-4">
        {/* Tighter on phones so the box and the Ask AI button share the row; the
            page label gives way (truncates) before anything else does. */}
        <nav className="inline-flex h-14 min-w-0 items-center gap-4 rounded-md border border-border/60 bg-muted/70 pl-5 pr-3 backdrop-blur-md sm:gap-8">
          <SiteLink href="/" className="group shrink-0 font-medium tracking-tight">
            <span className="transition-colors group-hover:text-primary">Robert Mill</span>
          </SiteLink>
          <span className={cn(LABEL, "min-w-0 truncate text-muted-foreground sm:min-w-24")}>{pageLabel}</span>
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
        {/* The same box as the nav, so the two read as one row of controls.
            Icon only on phones, where the row is already full. */}
        <AskAiButton
          aria-label="Ask AI"
          className={cn(
            LABEL,
            "h-14 w-14 shrink-0 justify-center rounded-md border-border/60 bg-muted/70 px-0 text-foreground hover:bg-muted sm:w-auto sm:px-5",
          )}
        >
          <SparklesIcon className="size-4" aria-hidden />
          <span className="hidden sm:inline">Ask AI</span>
        </AskAiButton>
        {menuSheet}
      </header>
    );
  }

  return (
    // A container query, not a viewport one: the row needs ~1180px, and with the
    // Ask AI panel open the header is 420px narrower than the window. Below that
    // it collapses to the boxed Ask AI + Menu pair, same as on a phone.
    <header className="relative z-50 @container">
      {/* No bar behind the links: the header is transparent and sits over the
          homepage wall, full-width with everything flush left, like koto.com.
          The wall's light follows the visitor's weather and time of day, so a
          soft fade of the page colour sits behind the row to keep the links
          readable whether the wall comes out bright or dark. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-background/85 via-background/50 to-transparent"
      />
      <nav className="flex h-16 items-center gap-4 px-6 @min-[1180px]:gap-10">
        <SiteLink href="/" className="group flex shrink-0 items-center gap-3 whitespace-nowrap text-lg font-medium tracking-tight">
          <Image
            src="/berto-headshot.jpg"
            alt="Robert Mill"
            width={36}
            height={36}
            priority
            className="size-9 rounded-full object-cover"
          />
          <span className="transition-colors group-hover:text-primary">
            Robert Mill
          </span>
        </SiteLink>

        {/* Wide: links sit right beside the name, Koto-style. Actions stay on the right. */}
        <div className="hidden items-center gap-7 @min-[1180px]:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className={cn(
                LABEL,
                "text-foreground/75 transition-colors hover:text-foreground",
                isActive(item.href) && "text-foreground",
              )}
            >
              {item.label}
            </SiteLink>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-4 @min-[1180px]:flex">
          {/* Icons only on wide headers: below ~1500px they push the links row onto two
              lines. They're still in the footer and the menu sheet. */}
          <SocialIcons className="hidden @min-[1500px]:flex [&_a]:text-foreground/70 [&_a:hover]:text-foreground" />
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Book a meeting
          </a>
          <AskAiButton className="px-5 text-base" />
          <ModeToggle />
        </div>

        {/* Narrow (phones, tablets, a laptop with the panel open): boxed ASK AI and
            MENU buttons on the right. */}
        <div className="ml-auto flex items-center gap-2 @min-[1180px]:hidden">
          <AskAiButton
            className={cn(LABEL, "rounded-md border-border/60 bg-muted/60 px-3 py-2.5 text-foreground hover:bg-muted")}
          >
            Ask AI
          </AskAiButton>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
            className={cn(
              LABEL,
              "rounded-md border border-border/60 bg-muted/60 px-4 py-2.5 text-foreground transition-colors hover:bg-muted",
            )}
          >
            Menu
          </button>
        </div>
      </nav>

      {menuSheet}
    </header>
  );
}
