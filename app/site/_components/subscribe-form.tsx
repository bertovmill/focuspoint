"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
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
 * The list lives in Kit. The form posts to /api/site/subscribe, which adds the
 * address to the Kit signup form; Kit then sends the confirmation email and
 * handles unsubscribes. Nothing is stored here.
 */

interface SubscribeFormProps {
  /** `inline` puts the field and button on one row; `stacked` is for narrow columns. */
  variant?: "inline" | "stacked";
  /** Which surface this is (popup, footer, post, newsletter-page), recorded in Kit. */
  source?: string;
  /** Shown in place of the form once the signup has gone through. */
  successMessage?: string;
  className?: string;
  onSuccess?: () => void;
  autoFocus?: boolean;
}

export function SubscribeForm({
  variant = "inline",
  source,
  successMessage = "Check your inbox and click the link to confirm.",
  className,
  onSuccess,
  autoFocus,
}: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/site/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Couldn't sign you up just now. Try again in a moment.");
        setState("idle");
        return;
      }
      setState("done");
      onSuccess?.();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)} role="status">
        <CheckIcon className="size-4 shrink-0 text-primary" />
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)}>
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
        {/* Hidden from people, and from screen readers; bots fill it in. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <Button type="submit" disabled={email.trim().length === 0 || state === "sending"}>
          {state === "sending" && <Loader2Icon className="size-4 animate-spin" />}
          Subscribe
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
