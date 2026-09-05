"use client";

import { useEffect, useState } from "react";
import { App } from "konsta/react";

/**
 * Konsta UI root. Picks the theme from the device — iOS look on iPhone/iPad,
 * Material everywhere else (Android, desktop) — his call (2026-09-05): "match the
 * device". Server and first client render both say Material so hydration matches;
 * the swap to iOS happens right after mount, before anything is painted twice.
 */
export function KonstaApp({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"ios" | "material">("material");

  useEffect(() => {
    const ua = navigator.userAgent;
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    if (/iPhone|iPad|iPod/.test(ua) || iPadOS) setTheme("ios");
  }, []);

  // `dark` off: next-themes already toggles `.dark` on <html>; Konsta must not add
  // its own listener on top. The class variant still applies to Konsta's parts.
  return (
    <App theme={theme} dark={false} safeAreas={false} className="flex flex-col">
      {children}
    </App>
  );
}
