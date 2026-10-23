"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUDDY } from "./cast";
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
 *
 * It says hello first, too: a moment after it is on the desk and on screen
 * it waves, "types" for a beat, and a small bubble over its head offers a
 * quick tour (see `BUDDY.nudge`). Once per visit; a tap on a reply opens the
 * chat and asks it.
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
  // The hello bubble: typing dots, then the line. Follows the buddy like the button.
  const [nudge, setNudge] = useState<"typing" | "said" | null>(null);
  const nudgeRef = useRef<HTMLDivElement>(null);
  const [firstQuestion, setFirstQuestion] = useState<string | null>(null);

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
    const bubble = nudgeRef.current;
    if (bubble) {
      bubble.style.display = pose.visible ? "" : "none";
      const bw = bubble.offsetWidth;
      const maxX = layoutRef.current.width - bw - 12;
      const x = Math.min(Math.max(12, pose.x - bw / 2), maxX);
      bubble.style.transform = `translate(${x}px, ${pose.y - pose.height * 1.2 - bubble.offsetHeight}px)`;
      // The tail points at its head even when the bubble is pushed in from an edge.
      bubble.style.setProperty("--tail", `${Math.min(Math.max(18, pose.x - x), bw - 18)}px`);
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
    setNudge(null);
    setOpen(true);
    stageRef.current?.setTalking(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setFirstQuestion(null);
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

  // Say hello once per visit: wait until it's on the desk, on screen and idle,
  // then wave, type for a beat, and say the line.
  useEffect(() => {
    if (!ready) return;
    try {
      if (sessionStorage.getItem(NUDGE_KEY)) return;
    } catch {
      // No storage: greet anyway.
    }
    let stage = 0;
    let timer: number | undefined;
    const id = window.setInterval(() => {
      const pose = poseRef.current;
      const root = rootRef.current;
      if (!pose?.visible || !root || openRef.current || wateringRef.current) return;
      const top = root.getBoundingClientRect().top + pose.y - pose.height;
      if (top < 64 || top > window.innerHeight - 40 || document.visibilityState !== "visible") {
        stage = 0;
        return;
      }
      // On screen for a couple of seconds before it speaks up.
      if (++stage < 8) return;
      window.clearInterval(id);
      try {
        sessionStorage.setItem(NUDGE_KEY, "1");
      } catch {
        // Fine: it may say hello again next page load.
      }
      stageRef.current?.react("wave");
      setNudge("typing");
      timer = window.setTimeout(() => setNudge((n) => (n === "typing" ? "said" : n)), 1300);
    }, 250);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timer);
    };
  }, [ready]);

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
      {/* The hello bubble over its head. Placed by onPose each frame. */}
      {nudge && !open && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-screen -translate-x-1/2 overflow-hidden">
          <div
            ref={nudgeRef}
            role="status"
            aria-live="polite"
            className="pointer-events-auto absolute left-0 top-0 w-[min(17rem,calc(100vw-1.5rem))] [--tail:50%]"
          >
            <div
              className={cn(
                "relative rounded-2xl bg-background/95 text-sm/5 text-foreground shadow-[0_10px_30px_rgba(20,16,10,0.18)] ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10",
                "animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-300",
                nudge === "typing" ? "w-fit px-3.5 py-3" : "px-4 pb-3 pt-3",
              )}
            >
              {nudge === "typing" ? (
                <span className="flex gap-1" aria-label="Berto's helper is typing">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-foreground/40"
                      style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }}
                    />
                  ))}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setNudge(null)}
                    aria-label="Dismiss"
                    className="absolute right-1.5 top-1.5 rounded-full p-1 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                  <button type="button" onClick={show} data-chat-toggle className="block pr-4 text-left">
                    {BUDDY.nudge.text.replace("{greeting}", greeting())}
                  </button>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {BUDDY.nudge.replies.map((r, i) => (
                      <button
                        key={r.label}
                        type="button"
                        data-chat-toggle
                        onClick={() => {
                          setFirstQuestion(r.ask);
                          show();
                        }}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                          i === 0
                            ? "bg-foreground text-background hover:bg-foreground/85"
                            : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {/* The tail, toward its head. */}
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-[var(--tail)] size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-background/95"
              />
            </div>
          </div>
        </div>
      )}
      {/* The chat sits over everything, on the same full-bleed box. */}
      {open && anchor && (
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-screen -translate-x-1/2">
          <AgentCard
            anchor={anchor}
            bounds={layoutRef.current}
            onClose={close}
            stage={stageRef.current}
            firstQuestion={firstQuestion}
          />
        </div>
      )}
    </>
  );
}

/** Set once the buddy has said hello this visit. */
const NUDGE_KEY = "buddy-nudged";

/** Good morning, afternoon or evening, by the visitor's own clock. */
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
