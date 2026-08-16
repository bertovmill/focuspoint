"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOOKING_URL, CAEL_SIGN_IN_URL } from "@/lib/public-site";
import { ModeToggle } from "@/app/_components/mode-toggle";
import { SiteLink, useSiteHref } from "./site-link";

const NAV = [
  { href: "/writing", label: "Writing" },
  { href: "/podcast", label: "Podcast" },
  { href: "/building", label: "Building" },
  { href: "/chat", label: "Ask Cael" },
];

export function SiteNav() {
  const pathname = usePathname();
  const siteHref = useSiteHref();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(siteHref(href));

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
        <SiteLink href="/" className="group flex items-center gap-2.5 font-medium tracking-tight">
          <Image
            src="/berto-headshot.jpg"
            alt=""
            width={28}
            height={28}
            priority
            className="size-7 rounded-full object-cover ring-1 ring-border"
          />
          <span className="transition-colors group-hover:text-primary">Berto Mill</span>
        </SiteLink>

        <div className="ml-auto hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(item.href) && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </SiteLink>
          ))}
          {/* Accounts live on the private host, so this leaves the site. */}
          <a
            href={CAEL_SIGN_IN_URL}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Sign in
          </a>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className="ml-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Book a meeting
          </a>
          <div className="ml-1">
            <ModeToggle />
          </div>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
        >
          {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-border/60 px-6 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <SiteLink
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive(item.href) && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </SiteLink>
            ))}
            <a
              href={CAEL_SIGN_IN_URL}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Sign in
            </a>
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
            >
              Book a meeting
            </a>
            <div className="pt-2">
              <ModeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
