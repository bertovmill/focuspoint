"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PROTOCOL_RULE_KEYS } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

// The four rule images change once in the app's life, so every instance shares
// one in-flight request and the answer is kept for the session.
// When the rules change (Robbins rules, 2026-10-23) the first view with art
// missing asks for it, then reads again.
let cache: Promise<Record<string, string>> | null = null;
function ruleArt() {
  const read = (): Promise<Record<string, string>> =>
    fetch("/api/nutrition/rule-art")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  cache ??= read().then(async (map) => {
    if (PROTOCOL_RULE_KEYS.every((k) => map[k])) return map;
    await fetch("/api/nutrition/rule-art", { method: "POST", body: "{}" }).catch(() => {});
    return read();
  });
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
    // 88px source for a 24–44px box: enough for a retina screen, a fraction of
    // the 1024px original.
    <Image
      src={url}
      alt=""
      width={88}
      height={88}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded object-cover", className)}
    />
  );
}
