"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  NEUTRAL_SKY,
  skyAt,
  useSiteWeather,
  wallNow,
} from "../concrete-wall/sky";
import { sillAnchor, windowRect } from "../concrete-wall/scene";
import { CAST, type AgentId } from "./cast";
import type { AgentStage, Pose, RoomLayout } from "./stage";

// The chat (and its network code) loads the first time someone clicks a character.
const AgentCard = dynamic(
  () => import("./agent-card").then((m) => m.AgentCard),
  { ssr: false },
);

/**
 * Three little characters living in the homepage room, each one a real eve
 * agent you can click and talk to: the robot on the desk knows Berto's work,
 * the pigeon on the windowsill his writing and podcast, the yeti his training.
 *
 * The 3D (three.js, in `stage.ts`) loads after the page is idle and only runs
 * while the hero is on screen. Over each character sits a plain button that
 * follows it around, so they're clickable, focusable and named for screen
 * readers; everything else on the layer lets the pointer through to the plant
 * and the jar underneath.
 */
export function HeroAgents() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<AgentStage | null>(null);
  const buttonRefs = useRef(new Map<AgentId, HTMLButtonElement>());
  const posesRef = useRef<Pose[]>([]);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<AgentId | null>(null);
  const [anchor, setAnchor] = useState<Pose | null>(null);

  // Where the desk and the sill are, remeasured when the hero changes size.
  const layoutRef = useRef<RoomLayout>({
    width: 0,
    height: 0,
    desk: null,
    sill: null,
  });
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const deskEl =
      root.parentElement?.querySelector<HTMLElement>("[data-hero-desk]");
    const d = deskEl?.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const rect = windowRect(w / h, w);
    const sill = sillAnchor(rect);
    layoutRef.current = {
      width: w,
      height: h,
      desk:
        d && d.width > 0
          ? {
              left: d.left - r.left,
              top: d.top - r.top,
              width: d.width,
              height: d.height,
            }
          : null,
      sill: {
        left: (rect.x - rect.hw) * w,
        right: (rect.x + rect.hw) * w,
        // Stand a touch back from the sill's front edge.
        y: (sill.y - 0.012 * sill.joinery) * h,
        // What the jar on the sill is sized by.
        unit: sill.joinery * h,
      },
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    // The desk image can settle after first paint.
    const deskEl =
      root.parentElement?.querySelector<HTMLElement>("[data-hero-desk]");
    if (deskEl) observer.observe(deskEl);
    return () => observer.disconnect();
  }, [measure]);

  // Move the buttons with the characters without re-rendering React every frame.
  const onPoses = useCallback((poses: Pose[]) => {
    posesRef.current = poses;
    for (const pose of poses) {
      const el = buttonRefs.current.get(pose.id);
      if (!el) continue;
      el.style.display = pose.visible ? "" : "none";
      const w = pose.height * 0.8;
      el.style.width = `${w}px`;
      el.style.height = `${pose.height * 1.05}px`;
      el.style.transform = `translate(${pose.x - w / 2}px, ${pose.y - pose.height * 1.05}px)`;
    }
  }, []);

  // Start the stage once the page has settled.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let cancelled = false;
    let stage: AgentStage | null = null;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true;
    const sync = () =>
      stage?.setRunning(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    io.observe(root);
    document.addEventListener("visibilitychange", sync);

    const start = async () => {
      const { createAgentStage } = await import("./stage");
      if (cancelled) return;
      try {
        stage = createAgentStage(canvas, {
          cast: CAST,
          layout: () => layoutRef.current,
          reducedMotion: () => motion.matches,
          onPoses,
        });
      } catch (error) {
        // No WebGL: the room is just the room.
        console.warn("Hero agents could not start", error);
        return;
      }
      stageRef.current = stage;
      sync();
      stage.ready
        .then(() => !cancelled && setReady(true))
        .catch((error: unknown) =>
          console.warn("Hero agents failed to load", error),
        );
    };
    // Safari has no requestIdleCallback.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? {
            cancel: (id: number) => window.cancelIdleCallback(id),
            id: window.requestIdleCallback(() => void start(), {
              timeout: 2500,
            }),
          }
        : {
            cancel: (id: number) => window.clearTimeout(id),
            id: window.setTimeout(() => void start(), 1200),
          };

    return () => {
      cancelled = true;
      idle.cancel(idle.id);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stage?.dispose();
      stageRef.current = null;
    };
  }, [onPoses]);

  // Light them like the desk: dimmer after dark, under cloud, and in dark mode.
  const weather = useSiteWeather();
  useEffect(() => {
    const update = () => {
      const sky = ready ? skyAt(wallNow(), weather) : NEUTRAL_SKY;
      const overcast = sky.cloudCover * (1 - sky.night);
      const dim = document.documentElement.classList.contains("dark")
        ? 0.72
        : 1;
      stageRef.current?.setLight(
        (1 - sky.night * 0.45 - overcast * 0.12) * dim,
      );
    };
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [weather, ready]);

  const open = (id: AgentId) => {
    setActive(id);
    setAnchor(posesRef.current.find((p) => p.id === id) ?? null);
    stageRef.current?.setTalking(id);
  };
  const close = useCallback(() => {
    setActive(null);
    stageRef.current?.setTalking(null);
  }, []);

  const member = CAST.find((m) => m.id === active);

  return (
    <>
      {/* Under the desk scene's layer (z-10), so the money tree and the jar stay
        in front of anyone who wanders behind them. */}
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-y-0 left-1/2 z-[9] w-screen -translate-x-1/2 select-none overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-700",
            ready ? "opacity-100" : "opacity-0",
          )}
        />
        {ready &&
          CAST.map((m) => (
            <button
              key={m.id}
              ref={(el) => {
                if (el) buttonRefs.current.set(m.id, el);
                else buttonRefs.current.delete(m.id);
              }}
              type="button"
              onClick={() => (active === m.id ? close() : open(m.id))}
              aria-label={`Talk to the ${m.name.toLowerCase()} about ${m.topic}`}
              aria-expanded={active === m.id}
              className="group pointer-events-auto absolute left-0 top-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                className={cn(
                  "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-opacity",
                  active === m.id
                    ? "opacity-0"
                    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                )}
              >
                Ask about {m.topic}
              </span>
            </button>
          ))}
      </div>
      {/* The chat sits over everything, on the same full-bleed box. */}
      {member && anchor && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-screen -translate-x-1/2">
          <AgentCard
            key={member.id}
            member={member}
            anchor={anchor}
            bounds={layoutRef.current}
            onClose={close}
            stage={stageRef.current}
          />
        </div>
      )}
    </>
  );
}
