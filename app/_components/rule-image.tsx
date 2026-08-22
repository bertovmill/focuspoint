"use client";

import { useState } from "react";
import { ruleImage } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/**
 * The committed art for a protocol rule. It removes itself if the file is
 * missing — the rules have to stay usable whether or not the art was generated.
 */
export function RuleImage({ ruleKey, className }: { ruleKey: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={cn("shrink-0 rounded bg-muted", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ruleImage(ruleKey)}
      alt=""
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded object-cover", className)}
    />
  );
}
