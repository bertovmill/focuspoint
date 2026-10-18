"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function Watcher({ name, onChange }: { name: string; onChange: (value: string | null) => void }) {
  const value = useSearchParams().get(name);
  useEffect(() => {
    onChange(value);
    // Only the value is a trigger: a new onChange identity on every render must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return null;
}

/**
 * Calls `onChange` with `?name=` on mount and whenever it changes — through a
 * `router.push`, a native pushState, or back/forward. Renders nothing.
 *
 * The section panels deliberately don't call useSearchParams themselves: it has
 * to sit under a Suspense boundary at build time, and that would put one around
 * the whole shell. Wrapping only this empty component keeps the boundary tiny.
 */
export function UrlParamWatcher(props: { name: string; onChange: (value: string | null) => void }) {
  return (
    <Suspense fallback={null}>
      <Watcher {...props} />
    </Suspense>
  );
}
