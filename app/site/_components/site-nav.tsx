"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
          <span className="grid size-7 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
            B
          </span>
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
            <div className="pt-2">
              <ModeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
