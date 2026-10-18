"use client";

import { useEffect, useState } from "react";

// Tailwind's `lg` breakpoint. Kept here as the one number JS and CSS have to agree
// on — if it moves in the theme, it moves here too.
const LG = "(min-width: 1024px)";

/**
 * True once the viewport is at or above Tailwind's `lg`.
 *
 * `lg:hidden` is the right tool for *showing* the wrong thing — it still mounts it.
 * That's fine for a few divs and wrong for the Tasks screen, where the desktop
 * branch boots two full Excalidraw scenes (four canvases) that a phone would
 * render, measure and then throw away behind `display: none`. This hook lets that
 * branch not exist at all on the wrong side of the breakpoint.
 *
 * Starts `false` so the server render and the first client render agree; the real
 * value lands in the effect right after mount. That means a desktop load paints the
 * mobile branch for one frame — acceptable, and the reason this is only worth using
 * where mounting is genuinely expensive.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(LG);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}
