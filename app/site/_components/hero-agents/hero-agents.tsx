"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAskAi } from "../ask-ai-context";
import { NEUTRAL_SKY, skyAt, useSiteWeather, wallNow } from "../concrete-wall/sky";
import type { AgentStage, Pose, RoomLayout } from "./stage";
import type { JarErrandEvent, JarHoldEvent } from "../concrete-wall/desk-scene";

// The chat (and its network code) loads the first time someone opens it.
const AgentCard = dynamic(() => import("./agent-card").then((m) => m.AgentCard), { ssr: false });

/**
 * A little plush buddy that lives on the homepage desk and is the site's
 * assistant: click it (or Ask AI, ⌘I, #ask-cael) and it waves and opens a
 * chat bubble above its head, backed by the `guide` eve agent.
 *
 * The 3D (three.js, in `stage.ts` and `buddy.ts`) loads after the page is
 * idle and only runs while the hero is on screen. Over the buddy sits a plain
 * button that follows it around, so it's clickable, focusable and named for
 * screen readers; the rest of the layer lets the pointer through.
 *
 * It also looks after the money tree: when the plant is clicked, and at the
 * top of every hour (Toronto time), it walks to the jar on the sill, hops up
 * for it, carries it over its head to the pot, waters the plant and takes the
 * jar back. The jar and the plant live in DeskScene; the two talk through
 * window events (`desk:water`, `desk:jar`, `buddy:hold`) since they share the
 * same full-bleed box and so the same pixel coordinates.
 */
export function HeroAgents() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<AgentStage | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const poseRef = useRef<Pose | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Pose | null>(null);
  // Asked to open before the buddy has loaded: open as soon as it has.
  const pendingOpen = useRef(false);
  // Mid-errand with the jar in its arms: report where its hands are every frame.
  const carryingRef = useRef(false);
  const wateringRef = useRef(false);

  // Where the desk is, remeasured when the hero changes size.
  const layoutRef = useRef<RoomLayout>({ width: 0, height: 0, desk: null });
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const d = root.parentElement?.querySelector<HTMLElement>("[data-hero-desk]")?.getBoundingClientRect();
    layoutRef.current = {
      width: r.width,
      height: r.height,
      desk: d && d.width > 0 ? { left: d.left - r.left, top: d.top - r.top, width: d.width, height: d.height } : null,
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    // The desk image can settle after first paint.
    const deskEl = root.parentElement?.querySelector<HTMLElement>("[data-hero-desk]");
    if (deskEl) observer.observe(deskEl);
    const onPointer = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [measure]);

  // Move the button with the buddy without re-rendering React every frame.
  const onPose = useCallback((pose: Pose) => {
    poseRef.current = pose;
    if (carryingRef.current && pose.visible) {
      // The jar's base sits in its raised hands, just over the top of its head.
      const detail: JarHoldEvent = { x: pose.x, y: pose.y - pose.height * 0.9 };
      window.dispatchEvent(new CustomEvent("buddy:hold", { detail }));
    }
    const el = buttonRef.current;
    if (!el) return;
    el.style.display = pose.visible ? "" : "none";
    const w = pose.height * 0.95;
    el.style.width = `${w}px`;
    el.style.height = `${pose.height * 1.1}px`;
    el.style.transform = `translate(${pose.x - w / 2}px, ${pose.y - pose.height * 1.1}px)`;
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
    const sync = () => stage?.setRunning(onScreen && document.visibilityState === "visible");
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
          layout: () => layoutRef.current,
          pointer: () => pointerRef.current,
          reducedMotion: () => motion.matches,
          onPose,
        });
      } catch (error) {
        // No WebGL: the room is just the room, and Ask AI falls back to the panel.
        console.warn("Hero buddy could not start", error);
        return;
      }
      stageRef.current = stage;
      sync();
      setReady(true);
    };
    // Safari has no requestIdleCallback.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? { cancel: (id: number) => window.cancelIdleCallback(id), id: window.requestIdleCallback(() => void start(), { timeout: 2500 }) }
        : { cancel: (id: number) => window.clearTimeout(id), id: window.setTimeout(() => void start(), 1200) };

    return () => {
      cancelled = true;
      idle.cancel(idle.id);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      stage?.dispose();
      stageRef.current = null;
    };
  }, [onPose]);

  // Light it like the desk: dimmer after dark, under cloud, and in dark mode.
  const weather = useSiteWeather();
  useEffect(() => {
    const update = () => {
      const sky = ready ? skyAt(wallNow(), weather) : NEUTRAL_SKY;
      const overcast = sky.cloudCover * (1 - sky.night);
      const dim = document.documentElement.classList.contains("dark") ? 0.72 : 1;
      stageRef.current?.setLight((1 - sky.night * 0.45 - overcast * 0.12) * dim);
    };
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [weather, ready]);

  const show = useCallback(() => {
    const pose = poseRef.current;
    if (!pose?.visible) {
      pendingOpen.current = true;
      return;
    }
    setAnchor(pose);
    setOpen(true);
    stageRef.current?.setTalking(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    stageRef.current?.setTalking(false);
    stageRef.current?.setThinking(false);
  }, []);

  // Once it's on the desk, honour an open that came in early.
  useEffect(() => {
    if (!ready || !pendingOpen.current) return;
    const id = window.setInterval(() => {
      if (poseRef.current?.visible) {
        window.clearInterval(id);
        pendingOpen.current = false;
        show();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [ready, show]);

  // Water the plant: fetch the jar, carry it over, pour, put it back.
  const water = useCallback(async () => {
    if (wateringRef.current || openRef.current) return;
    const jarEvent = (state: JarErrandEvent["state"]) =>
      window.dispatchEvent(new CustomEvent<JarErrandEvent>("desk:jar", { detail: { state } }));
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const root = rootRef.current;
    const jarEl = document.querySelector<HTMLElement>("[data-desk-jar]");
    const potEl = document.querySelector<HTMLElement>("[data-desk-pot]");
    if (!root || !jarEl || !potEl) return;
    wateringRef.current = true;
    const stage = stageRef.current;
    const pose = poseRef.current;
    try {
      if (!stage || !pose?.visible) {
        // No buddy (no WebGL, or not on the desk yet): the jar waters the plant by itself.
        jarEvent("pour");
        await sleep(3200);
        jarEvent("home");
        return;
      }
      const r = root.getBoundingClientRect();
      const j = jarEl.getBoundingClientRect();
      const p = potEl.getBoundingClientRect();
      // Under the upright jar (it stands at the left of its box, a bit narrower than it).
      const jarX = j.left - r.left + j.height * 0.44;
      // Beside the pot, with the jar held out over it.
      const potX = p.left - r.left - pose.height * 0.22;
      stage.beginErrand();
      await stage.goTo(jarX);
      stage.react("hop");
      await sleep(250);
      carryingRef.current = true;
      stage.setCarrying(true);
      jarEvent("held");
      await sleep(800);
      await stage.goTo(potX);
      jarEvent("pour");
      await sleep(3400);
      jarEvent("held");
      await sleep(700);
      await stage.goTo(jarX);
      stage.react("hop");
      await sleep(200);
      carryingRef.current = false;
      stage.setCarrying(false);
      jarEvent("home");
      await sleep(900);
      stage.react("nod");
    } finally {
      carryingRef.current = false;
      stage?.endErrand();
      wateringRef.current = false;
    }
  }, []);

  // A click on the plant asks for water.
  useEffect(() => {
    const onWater = () => void water();
    window.addEventListener("desk:water", onWater);
    return () => window.removeEventListener("desk:water", onWater);
  }, [water]);

  // And it waters it at the top of every hour, Toronto time, while someone's looking.
  useEffect(() => {
    if (!ready) return;
    const clock = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", minute: "numeric", second: "numeric" });
    let timer: number | undefined;
    const schedule = () => {
      const now = new Date();
      const part = (type: string) => Number(clock.formatToParts(now).find((x) => x.type === type)?.value ?? 0);
      const msLeft = (3600 - part("minute") * 60 - part("second")) * 1000 - now.getMilliseconds();
      timer = window.setTimeout(() => {
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (document.visibilityState === "visible" && !calm) void water();
        schedule();
      }, Math.max(1000, msLeft));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [ready, water]);

  // Ask AI, ⌘I and #ask-cael open (or close) the buddy's chat on this page.
  const { setOpener } = useAskAi();
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    setOpener(() => {
      if (openRef.current) return close();
      // From further down the page, come back up to the desk first.
      if (window.scrollY > 120) window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(show, window.scrollY > 120 ? 450 : 0);
    });
    return () => setOpener(null);
  }, [setOpener, show, close]);

  return (
    <>
      {/* Under the desk scene's layer (z-10), so the money tree and the jar stay
          in front of the buddy if it wanders behind them. */}
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-y-0 left-1/2 z-[9] w-screen -translate-x-1/2 select-none overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}
        />
        {ready && (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (open ? close() : show())}
            aria-label="Chat with Berto's helper"
            aria-expanded={open}
            data-chat-toggle
            className="group pointer-events-auto absolute left-0 top-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className={cn(
                "pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur transition-opacity",
                open ? "opacity-0" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              Say hi
            </span>
          </button>
        )}
      </div>
      {/* The chat sits over everything, on the same full-bleed box. */}
      {open && anchor && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-screen -translate-x-1/2">
          <AgentCard anchor={anchor} bounds={layoutRef.current} onClose={close} stage={stageRef.current} />
        </div>
      )}
    </>
  );
}
