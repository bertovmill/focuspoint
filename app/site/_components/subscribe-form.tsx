"use client";

import { useState } from "react";
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The one signup form on the site.
 *
 * Every surface — popup, footer, end of a post, /newsletter — renders this, so
 * there is a single path and a single success state to keep right. `variant`
 * only changes the layout.
 *
 * The list lives on Substack. The form is a plain GET to Substack's own
 * subscribe page with the email carried along, so it works without JavaScript,
 * nothing is stored here, and Substack handles confirmation and unsubscribes.
 */

// Mirrors SUBSTACK_URL in lib/substack.ts, which is server-only and can't be
// imported from a client component.
const SUBSTACK_SUBSCRIBE_URL = "https://robertmillwriting.substack.com/subscribe";

interface SubscribeFormProps {
  /** `inline` puts the field and button on one row; `stacked` is for narrow columns. */
  variant?: "inline" | "stacked";
  /** Shown in place of the form once the visitor has been handed to Substack. */
  successMessage?: string;
  className?: string;
  onSuccess?: () => void;
  autoFocus?: boolean;
}

export function SubscribeForm({
  variant = "inline",
  successMessage = "Finish signing up in the Substack tab that just opened.",
  className,
  onSuccess,
  autoFocus,
}: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  // Let the browser submit the form to Substack in a new tab; we only note
  // that it happened so the surface can swap to its success state.
  function onSubmit() {
    setDone(true);
    onSuccess?.();
  }

  if (done) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)} role="status">
        <CheckIcon className="size-4 shrink-0 text-primary" />
        {successMessage}
      </p>
    );
  }

  return (
    <form
      action={SUBSTACK_SUBSCRIBE_URL}
      method="get"
      target="_blank"
      rel="noopener"
      onSubmit={onSubmit}
      className={cn("w-full", className)}
    >
      <div className={cn("flex gap-2", variant === "stacked" && "flex-col")}>
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus={autoFocus}
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={variant === "inline" ? "flex-1" : undefined}
        />
        <Button type="submit" disabled={email.trim().length === 0}>
          Subscribe on Substack
          <ArrowUpRightIcon className="size-4" />
        </Button>
      </div>
    </form>
  );
}
