"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// The four rule images change once in the app's life, so every instance shares
// one in-flight request and the answer is kept for the session.
let cache: Promise<Record<string, string>> | null = null;
function ruleArt() {
  cache ??= fetch("/api/nutrition/rule-art")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return cache;
}

/**
 * The photo for a protocol rule. Renders a plain muted square until (or unless)
 * the art exists — the rules have to stay usable with no pictures at all.
 */
export function RuleImage({ ruleKey, className }: { ruleKey: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    ruleArt().then((map) => {
      if (alive) setUrl(map[ruleKey] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [ruleKey]);

  if (!url || failed) return <span className={cn("shrink-0 rounded bg-muted", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded object-cover", className)}
    />
  );
}
