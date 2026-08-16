"use client";

import { useId, useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The one signup form on the site.
 *
 * Every surface — popup, footer, end of a post, /newsletter — renders this, so
 * there is a single submit path, a single set of error messages, and a single
 * success state to keep right. `variant` only changes the layout.
 */

export type SubscribeStatus = "idle" | "submitting" | "done" | "error";

interface SubscribeFormProps {
  /** `inline` puts the field and button on one row; `stacked` is for narrow columns. */
  variant?: "inline" | "stacked";
  /** Shown in place of the form once the signup lands. */
  successMessage?: string;
  className?: string;
  onSuccess?: () => void;
  autoFocus?: boolean;
}

export function SubscribeForm({
  variant = "inline",
  successMessage = "You're in — I'll send the next one straight to your inbox.",
  className,
  onSuccess,
  autoFocus,
}: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/site/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't sign you up just now.");
      setStatus("done");
      onSuccess?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "done") {
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
          required
          autoComplete="email"
          autoFocus={autoFocus}
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={status === "error" || undefined}
          aria-describedby={error ? errorId : undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className={variant === "inline" ? "flex-1" : undefined}
        />
        <Button type="submit" disabled={status === "submitting" || email.trim().length === 0}>
          {status === "submitting" ? "Signing you up…" : "Subscribe"}
        </Button>
      </div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
