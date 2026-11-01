import { DumbbellIcon, FlameIcon, FlowerIcon, FootprintsIcon, MoonIcon, PersonStandingIcon, ZapIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// One icon per session type, tinted in the type's colour; replaced the coloured dots (Berto, 2026-11-01).
const ICONS: Record<string, { Icon: LucideIcon; tint: string }> = {
  long_run: { Icon: FootprintsIcon, tint: "text-sky-500" },
  intervals: { Icon: ZapIcon, tint: "text-orange-500" },
  easy: { Icon: PersonStandingIcon, tint: "text-teal-500" },
  hyrox: { Icon: FlameIcon, tint: "text-rose-500" },
  strength: { Icon: DumbbellIcon, tint: "text-violet-500" },
  yoga: { Icon: FlowerIcon, tint: "text-lime-600" },
  rest: { Icon: MoonIcon, tint: "text-muted-foreground" },
};

export function SessionTypeIcon({ type, className }: { type: string; className?: string }) {
  const { Icon, tint } = ICONS[type] ?? ICONS.hyrox;
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", tint, className)} />;
}
