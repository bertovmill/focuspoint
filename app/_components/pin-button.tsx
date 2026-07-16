"use client";

import { useEffect, useState } from "react";
import { PinIcon } from "lucide-react";
import { isDesktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/** Fired on window when the user clicks a pin button; Workspace listens and enters pin mode. */
export const PIN_EVENT = "cael:pin";

/** Pin-mode toggle. Renders only inside the Cael desktop shell — a browser can't pin a window. */
export function PinButton({ className, iconClassName = "size-4" }: { className?: string; iconClassName?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(isDesktopApp()), []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent(PIN_EVENT))}
      className={cn(
        "p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground",
        className,
      )}
      aria-label="Pin to corner"
      title="Pin mode — compact, always on top"
    >
      <PinIcon className={iconClassName} />
    </button>
  );
}
