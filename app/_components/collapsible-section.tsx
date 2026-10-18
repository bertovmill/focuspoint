"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * A home-screen section whose uppercase heading toggles the body open/closed.
 * The choice is remembered per `id` in localStorage. The body stays mounted while
 * collapsed (just hidden) so editors like the journal keep unsaved text and timers.
 */
export function CollapsibleSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const storageKey = `cael:home-section-collapsed:${id}`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  return (
    <section id={id} className="mb-6">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="group flex items-center gap-1.5 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
      >
        {title}
        <CaretDownIcon className={cn("size-3 transition-transform", collapsed && "-rotate-90")} />
      </button>
      <div hidden={collapsed}>{children}</div>
    </section>
  );
}
