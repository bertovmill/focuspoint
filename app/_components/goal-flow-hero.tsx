"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MegaphoneIcon, UsersIcon, BotIcon } from "lucide-react";

import { AnimatedBeam } from "@/components/ui/animated-beam";
import { BorderBeam } from "@/components/ui/border-beam";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";

// The goal chart's three pillars and what each one actually takes, day to day.
// Colors match CATEGORY_BADGE_CLASS in dashboard.tsx so a task's category chip
// reads as the same pillar.
const PILLARS = [
  {
    key: "content",
    label: "More content",
    icon: MegaphoneIcon,
    creates: "awareness",
    // Nothing flows into the first pillar, so it has no inbound label.
    inbound: undefined,
    traits: ["Consistency", "Attention to detail"],
    distributes: true,
    hex: "#f59e0b",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    dot: "bg-amber-500/60",
  },
  {
    key: "events",
    label: "More events",
    icon: UsersIcon,
    creates: "trust",
    traits: ["Energy", "Aura", "Appearance"],
    distributes: true,
    // Labels the beam arriving from the previous pillar.
    inbound: "More attendees",
    hex: "#8b5cf6",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    border: "border-violet-500/30",
    dot: "bg-violet-500/60",
  },
  {
    key: "agents",
    label: "More AI agents",
    icon: BotIcon,
    creates: "higher-value service",
    traits: ["Reading the docs", "Time coding", "Aggressive tinkering"],
    distributes: false,
    inbound: "More clients",
    hex: "#10b981",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-500/60",
  },
] as const;

// Chips fade up left to right, then the beams take over. Whole intro lands
// just under 2s; the beams keep drifting after that.
const BEAT = 0.42;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The goal hero on the Tasks tab: three pillars wired together by animated
 * beams, with a feedback loop from the agents back into the other two.
 *
 * The connectors are Magic UI's <AnimatedBeam>, which draws an SVG path between
 * two elements inside a shared container — hence the anchor spans pinned to
 * each chip's edges. Everything remounts (and so replays) whenever the Tasks
 * tab is opened.
 */
export function GoalFlowHero() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  // Beams attach to edge anchors rather than the chips themselves, so a path
  // never has to cut back through the middle of a card to reach its target.
  const rightAnchors = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const leftAnchors = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const bottomAnchors = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];

  // A no-op props object leaves the element static.
  const rise = (delay: number, duration = 0.45) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration, ease: EASE },
        };
  // Reduced motion still gets the beam's static path, just no travelling light.
  const beamMotion = reduceMotion
    ? { duration: 0.01, repeat: 0, delay: 0 }
    : undefined;

  return (
    <div className="relative -mx-5 -mt-4 mb-5 overflow-hidden border-b bg-gradient-to-br from-amber-500/10 via-violet-500/10 to-emerald-500/10 px-5 py-5 sm:px-6 sm:py-6">
      {/* Ambient layers, back to front: dot grid, then the two colour blooms. */}
      <DotPattern
        cr={0.7}
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full fill-foreground/25",
          "[mask-image:radial-gradient(420px_circle_at_center,white,transparent)]",
        )}
      />
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative" ref={containerRef}>
        <div className="flex flex-col items-center sm:flex-row sm:items-stretch sm:justify-center">
          {PILLARS.map((pillar, i) => (
            <div key={pillar.key} className="contents">
              {/* The gap the beam crosses. On desktop it only carries the
                  label — the beam itself is drawn over the top. Stacked, it
                  needs its own visible connector since the beams are
                  horizontal. */}
              {i > 0 && (
                <>
                  <motion.span
                    aria-hidden
                    className="flex shrink-0 flex-col items-center self-center py-1 text-muted-foreground/60 sm:hidden"
                    {...rise((i - 1) * BEAT + 0.34, 0.35)}
                  >
                    <span className="h-5 w-px bg-current" />
                    <span className="text-[10px] leading-none">{pillar.inbound}</span>
                  </motion.span>
                  {/* h-4 + self-center puts this span's midline on the beam,
                      so bottom-full lifts the label clear of it. */}
                  <span className="relative hidden h-4 w-28 shrink-0 items-center justify-center self-center sm:flex">
                    <motion.span
                      className="absolute bottom-full mb-1 whitespace-nowrap text-[10px] leading-none text-muted-foreground"
                      {...rise((i - 1) * BEAT + 0.5, 0.35)}
                    >
                      {pillar.inbound}
                    </motion.span>
                  </span>
                </>
              )}

              <motion.div
                title={
                  pillar.distributes
                    ? `Creates ${pillar.creates}, and distributes the service`
                    : `Creates ${pillar.creates}`
                }
                className={cn(
                  "group relative w-full overflow-hidden rounded-xl border bg-background/60 px-3 py-2.5 shadow-sm backdrop-blur-md sm:w-auto sm:flex-1",
                  pillar.border,
                )}
                {...rise(i * BEAT)}
              >
                {/* Light traces the card's own edge, tinted to its pillar. */}
                {!reduceMotion && (
                  <BorderBeam
                    size={70}
                    duration={7}
                    delay={i * 1.2}
                    colorFrom={pillar.hex}
                    colorTo="transparent"
                    borderWidth={1.5}
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", pillar.chip)}>
                    <pillar.icon className="size-3.5" />
                  </span>
                  <span className="text-sm font-medium">{pillar.label}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 pl-8">
                  {pillar.traits.map((trait) => (
                    <li key={trait} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn("size-1 shrink-0 rounded-full", pillar.dot)} />
                      {trait}
                    </li>
                  ))}
                </ul>
                {/* Zero-size beam anchors pinned to the card's edges. */}
                <span ref={leftAnchors[i]} className="absolute left-0 top-1/2 size-0" aria-hidden />
                <span ref={rightAnchors[i]} className="absolute right-0 top-1/2 size-0" aria-hidden />
                <span ref={bottomAnchors[i]} className="absolute bottom-0 left-1/2 size-0" aria-hidden />
              </motion.div>
            </div>
          ))}
        </div>

        {/* Room for the feedback beams to bow through on their way back. The
            caption sits at the bottom so the deepest curve clears it. */}
        <div className="hidden h-20 items-end justify-center sm:flex">
          <span className="text-[10px] leading-none text-muted-foreground/70">
            Better agents improve the content and the events
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground sm:hidden">
          Better agents improve the content and the events.
        </p>

        {/* Forward flow, then the feedback loop bowing back underneath.
            Desktop only: stacked, the chips have their own connectors. */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={rightAnchors[0]}
            toRef={leftAnchors[1]}
            gradientStartColor={PILLARS[0].hex}
            gradientStopColor={PILLARS[1].hex}
            pathWidth={1.5}
            duration={4.5}
            delay={0.4}
            {...beamMotion}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={rightAnchors[1]}
            toRef={leftAnchors[2]}
            gradientStartColor={PILLARS[1].hex}
            gradientStopColor={PILLARS[2].hex}
            pathWidth={1.5}
            duration={4.5}
            delay={0.9}
            {...beamMotion}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={bottomAnchors[2]}
            toRef={bottomAnchors[1]}
            curvature={-42}
            reverse
            gradientStartColor={PILLARS[2].hex}
            gradientStopColor={PILLARS[1].hex}
            pathWidth={1.5}
            duration={5.5}
            delay={1.4}
            {...beamMotion}
          />
          <AnimatedBeam
            containerRef={containerRef}
            fromRef={bottomAnchors[2]}
            toRef={bottomAnchors[0]}
            curvature={-70}
            reverse
            gradientStartColor={PILLARS[2].hex}
            gradientStopColor={PILLARS[0].hex}
            pathWidth={1.5}
            duration={5.5}
            delay={1.7}
            {...beamMotion}
          />
        </div>

        <motion.p
          className="mt-3 text-xs leading-snug text-muted-foreground"
          {...rise(1.55, 0.45)}
        >
          Don&apos;t chase money — create the conditions where money becomes{" "}
          <span className="font-medium text-foreground">inevitable</span>.
        </motion.p>
      </div>
    </div>
  );
}
