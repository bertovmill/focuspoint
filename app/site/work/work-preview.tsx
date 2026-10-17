"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRightIcon, Loader2Icon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { SiteLink } from "../_components/site-link";

/**
 * Wraps a work tile so clicking it opens the project in a browser-window
 * frame instead of navigating away: the live site in an iframe, or, for sites
 * that refuse to be framed, a scrollable screenshot. The frame is only
 * mounted while open, so no third-party page loads until someone asks for it.
 *
 * The case study stays one click away from the frame's footer.
 */
export function WorkPreview({
  slug,
  title,
  name,
  url,
  previewUrl,
  previewImage,
  children,
}: {
  slug: string;
  title: string;
  name: string;
  /** The real site, for the "open" link. */
  url?: string;
  previewUrl?: string;
  previewImage?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const target = url ?? previewUrl;
  const host = target ? new URL(target).host.replace(/^www\./, "") : name;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLoaded(false);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="group block w-full cursor-pointer text-left"
          aria-label={`Preview ${name}`}
        >
          {children}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex h-[min(90vh,52rem)] w-[min(96vw,76rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-black/10 bg-background shadow-2xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-white/10"
        >
          <DialogPrimitive.Title className="sr-only">
            {name}: {title}
          </DialogPrimitive.Title>

          {/* Browser chrome: close, address pill, open in a new tab. */}
          <div className="flex items-center gap-3 border-b bg-muted/60 px-3 py-2">
            <DialogPrimitive.Close
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              aria-label="Close preview"
            >
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
            <div className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-1 text-center font-mono text-xs text-muted-foreground">
              {host}
            </div>
            {target && (
              <a
                href={target}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                Open
                <ArrowUpRightIcon className="size-3.5" />
              </a>
            )}
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            {previewUrl ? (
              <>
                {!loaded && (
                  <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <Loader2Icon className="size-5 animate-spin" />
                  </div>
                )}
                <iframe
                  src={previewUrl}
                  title={`${name} website`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  onLoad={() => setLoaded(true)}
                  className="size-full border-0"
                />
              </>
            ) : previewImage ? (
              <div className="size-full overflow-y-auto">
                {/* A tall full-page capture; the frame scrolls it like a page. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt={`${name} profile`}
                  className="block h-auto w-full"
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 border-t bg-muted/40 px-4 py-2.5">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {title}
            </p>
            <SiteLink
              href={`/work/${slug}`}
              className="shrink-0 text-sm font-medium underline-offset-4 hover:underline"
            >
              Read the case study →
            </SiteLink>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
