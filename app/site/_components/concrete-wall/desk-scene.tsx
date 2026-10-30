"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { NEUTRAL_SKY, skyAt, useSiteWeather, wallNow, type Sky } from "./sky";
import { JAR_ART, PLANT_ART, sillAnchor, windowRect } from "./scene";
import { DeskBook } from "./desk-book";
import { WindowBlind } from "./window-blind";
import { windowStyleStore } from "./window-style-store";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep the drag on the element once it starts; some pointers can't be captured, and that's fine. */
function capture(e: ReactPointerEvent<HTMLElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic or already-released pointers: the drag still works while the pointer stays over it.
  }
}

/** How far the plant turns per pixel dragged, and how far it will go. */
const TURN_PER_PX = 0.14;
const MAX_TURN = 18;
/** The jar's height as a fraction of the wall's height, scaled with the window. */
const JAR_HEIGHT = 0.085;
/** How long the plant sways after a drink, and how long the soil stays dark. */
const DRINK_MS = 2600;
const DRY_MS = 9000;

type Stream = { x: number; y: number; height: number };

/**
 * The buddy's watering errand, told to this layer by hero-agents.tsx:
 * `held` — the jar rides in its raised arms (positions come as `buddy:hold`
 * events, hero pixels of the jar's base); `pour` — tip it over the pot;
 * `home` — back on the sill. `desk:water` goes the other way: a click on the
 * plant asks for a drink.
 */
export type JarErrandEvent = { state: "held" | "pour" | "home" };
export type JarHoldEvent = { x: number; y: number };

/** How long the jar takes to float up from the sill into the buddy's arms. */
const LIFT_MS = 650;
/** A click on the plant, not a drag: moved less than this, released sooner than that. */
const CLICK_PX = 5;
const CLICK_MS = 450;

/**
 * The things on the desk and the sill you can touch. Sits over the hero,
 * full-bleed like the wall, and only the plant and the jar take the pointer.
 *
 * - The money tree turns a little when you drag it sideways (a 3D turn
 *   about its trunk, pivoting at the soil) and springs back when you let
 *   go. The pot stays on the desk image; the tree above the soil lives on
 *   its own layer, cut out of the desk image by
 *   scripts/split-desk-plant.mjs, and laid back exactly where it stood using
 *   the same `--desk-*` custom properties the wall uses for the desk.
 * - A mason jar of water stands on the windowsill (where the shader draws
 *   the sill, via `sillAnchor`). Pick it up and hold it over the pot: it
 *   tips, water runs into the soil, the soil darkens and the plant perks up.
 *   Let go anywhere and it goes back to the sill.
 * - Click the plant (or wait for the top of the hour) and the buddy fetches
 *   the jar, carries it over, waters the plant and puts the jar back.
 *
 * The plant is lit like the desk: dimmer after dark and under cloud.
 */
export function DeskScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  const plantRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState({ width: 1440, height: 810 });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setShape({ width, height });
    });
    observer.observe(root);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    onMotion();
    motion.addEventListener("change", onMotion);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  // The same sky the wall lights the desk with.
  const weather = useSiteWeather();
  const [sky, setSky] = useState<Sky>(NEUTRAL_SKY);
  useEffect(() => {
    const update = () => setSky(skyAt(wallNow(), weather));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [weather]);

  // The plant's turn, in degrees, and whether a finger is on it.
  const [turn, setTurn] = useState(0);
  const [holdingPlant, setHoldingPlant] = useState(false);
  const plantDrag = useRef<{ x: number; y: number; from: number; at: number } | null>(null);

  // The jar's offset from its spot on the sill, in pixels.
  const [jarOffset, setJarOffset] = useState({ x: 0, y: 0 });
  const [holdingJar, setHoldingJar] = useState(false);
  const jarDrag = useRef<{ x: number; y: number; fromX: number; fromY: number } | null>(null);
  // The buddy has the jar: no dragging, and it glides only while being lifted.
  const [errand, setErrand] = useState<JarErrandEvent["state"] | null>(null);
  const [lifting, setLifting] = useState(false);
  const liftTimer = useRef<number | undefined>(undefined);
  const pourTimer = useRef<number | undefined>(undefined);
  // The water going into the pot, in layer pixels, while it is.
  const [stream, setStream] = useState<Stream | null>(null);
  const [wet, setWet] = useState(false);
  const [drinking, setDrinking] = useState(false);
  const drinkTimer = useRef<number | undefined>(undefined);
  const dryTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(drinkTimer.current);
      window.clearTimeout(dryTimer.current);
      window.clearTimeout(liftTimer.current);
      window.clearTimeout(pourTimer.current);
    },
    [],
  );

  const rect = windowRect(shape.width / shape.height, shape.width);
  const windowStyle = useSyncExternalStore(windowStyleStore.subscribe, windowStyleStore.get, windowStyleStore.getServer);
  const sill = sillAnchor(rect, windowStyle);
  // The jar's box: tall enough for the upright jar, wide enough for the
  // tipped one, standing on the sill's front edge with the upright jar
  // centred on its spot.
  const jarH = JAR_HEIGHT * sill.joinery * shape.height;
  const jarW = JAR_ART.pouring.aspect * jarH;
  const jarLeft = sill.x * shape.width - (JAR_ART.upright.aspect * jarH) / 2;
  const jarTop = sill.y * shape.height - jarH;

  const onPlantDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    capture(e);
    plantDrag.current = { x: e.clientX, y: e.clientY, from: turn, at: performance.now() };
    setHoldingPlant(true);
  };
  const onPlantMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = plantDrag.current;
    if (!drag) return;
    setTurn(clamp(drag.from + (e.clientX - drag.x) * TURN_PER_PX, -MAX_TURN, MAX_TURN));
  };
  const onPlantUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = plantDrag.current;
    if (
      e.type === "pointerup" &&
      drag &&
      Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < CLICK_PX &&
      performance.now() - drag.at < CLICK_MS
    ) {
      window.dispatchEvent(new Event("desk:water"));
    }
    plantDrag.current = null;
    setHoldingPlant(false);
    setTurn(0);
  };

  /** Where the water would land for a jar at this offset: over the pot, or nowhere. */
  const streamFor = (offset: { x: number; y: number }): Stream | null => {
    const root = rootRef.current;
    const plant = plantRef.current;
    if (!root || !plant) return null;
    const r = root.getBoundingClientRect();
    const p = plant.getBoundingClientRect();
    const potX = p.left - r.left + p.width * PLANT_ART.pot.x;
    const potTop = p.top - r.top + p.height * PLANT_ART.pot.top;
    const potR = p.width * PLANT_ART.pot.r;
    const mouthX = jarLeft + offset.x + jarW * JAR_ART.pouring.mouth.x;
    const mouthY = jarTop + offset.y + jarH * JAR_ART.pouring.mouth.y;
    const over = Math.abs(mouthX - potX) < potR * 1.15 && mouthY < potTop - 6 && mouthY > potTop - 360;
    return over ? { x: mouthX, y: mouthY, height: potTop - mouthY } : null;
  };

  const onJarDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    capture(e);
    jarDrag.current = { x: e.clientX, y: e.clientY, fromX: jarOffset.x, fromY: jarOffset.y };
    setHoldingJar(true);
  };
  const onJarMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = jarDrag.current;
    if (!drag) return;
    const next = { x: drag.fromX + e.clientX - drag.x, y: drag.fromY + e.clientY - drag.y };
    setJarOffset(next);
    const pouring = streamFor(next);
    setStream(pouring);
    if (pouring) drink();
  };

  /** Water is reaching the soil: darken it and let the plant perk up. */
  const drink = () => {
    setWet(true);
    window.clearTimeout(dryTimer.current);
    if (!drinking) {
      setDrinking(true);
      window.clearTimeout(drinkTimer.current);
      drinkTimer.current = window.setTimeout(() => setDrinking(false), DRINK_MS);
    }
  };

  // The buddy's errand. Kept in refs so the window listeners bind once.
  const errandRef = useRef(errand);
  errandRef.current = errand;
  const geometry = useRef({ jarLeft, jarTop, jarW, jarH });
  geometry.current = { jarLeft, jarTop, jarW, jarH };
  const streamForRef = useRef(streamFor);
  streamForRef.current = streamFor;
  const drinkRef = useRef(drink);
  drinkRef.current = drink;
  useEffect(() => {
    const onHold = (e: Event) => {
      if (errandRef.current !== "held") return;
      const { x, y } = (e as CustomEvent<JarHoldEvent>).detail;
      const g = geometry.current;
      // The upright jar's base, centred in the buddy's hands.
      setJarOffset({ x: x - (g.jarLeft + (JAR_ART.upright.aspect * g.jarH) / 2), y: y - (g.jarTop + g.jarH) });
    };
    const onErrand = (e: Event) => {
      const { state } = (e as CustomEvent<JarErrandEvent>).detail;
      window.clearTimeout(pourTimer.current);
      setErrand(state === "home" ? null : state);
      if (state === "held") {
        setStream(null);
        // Float up off the sill (or back upright from pouring), then follow the hands exactly.
        setLifting(true);
        window.clearTimeout(liftTimer.current);
        liftTimer.current = window.setTimeout(() => setLifting(false), LIFT_MS);
      } else if (state === "pour") {
        const root = rootRef.current;
        const plant = plantRef.current;
        if (!root || !plant) return;
        const r = root.getBoundingClientRect();
        const p = plant.getBoundingClientRect();
        const g = geometry.current;
        const potX = p.left - r.left + p.width * PLANT_ART.pot.x;
        const potTop = p.top - r.top + p.height * PLANT_ART.pot.top;
        const potR = p.width * PLANT_ART.pot.r;
        // Mouth over the near side of the pot (close to the buddy's hands), a jar's height above the soil.
        const offset = {
          x: potX - potR * 0.45 - (g.jarLeft + g.jarW * JAR_ART.pouring.mouth.x),
          y: potTop - g.jarH * 0.95 - (g.jarTop + g.jarH * JAR_ART.pouring.mouth.y),
        };
        setLifting(true);
        setJarOffset(offset);
        pourTimer.current = window.setTimeout(() => {
          setLifting(false);
          const pouring = streamForRef.current(offset);
          setStream(pouring);
          if (pouring) drinkRef.current();
        }, LIFT_MS);
      } else {
        setLifting(false);
        setStream(null);
        setJarOffset({ x: 0, y: 0 });
        window.clearTimeout(dryTimer.current);
        dryTimer.current = window.setTimeout(() => setWet(false), DRY_MS);
      }
    };
    window.addEventListener("buddy:hold", onHold);
    window.addEventListener("desk:jar", onErrand);
    return () => {
      window.removeEventListener("buddy:hold", onHold);
      window.removeEventListener("desk:jar", onErrand);
    };
  }, []);
  const onJarUp = () => {
    jarDrag.current = null;
    setHoldingJar(false);
    setJarOffset({ x: 0, y: 0 });
    setStream(null);
    window.clearTimeout(dryTimer.current);
    dryTimer.current = window.setTimeout(() => setWet(false), DRY_MS);
  };

  const overcast = sky.cloudCover * (1 - sky.night);
  const light = {
    "--desk-light": (1 - sky.night * 0.45 - overcast * 0.12).toFixed(3),
    "--desk-tone": (1 - sky.night * 0.25).toFixed(3),
  } as CSSProperties;
  // The tree pivots where the trunk meets the soil, so the pot never moves.
  const soil = `${(PLANT_ART.pot.x * 100).toFixed(2)}% ${(PLANT_ART.pot.top * 100).toFixed(2)}%`;
  const spring = reducedMotion ? "transform 250ms ease-out" : "transform 900ms cubic-bezier(0.34, 1.56, 0.64, 1)";
  const glide = reducedMotion ? "transform 250ms ease-out" : "transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1)";

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-screen -translate-x-1/2 select-none overflow-hidden"
    >
      {/* The roller shade in the window, under everything that stands in front of it. */}
      <WindowBlind rect={rect} width={shape.width} height={shape.height} style={light} />

      {/* The money tree, back on the desk where it was cut from. */}
      <div
        ref={plantRef}
        className="pointer-events-auto absolute cursor-grab touch-none active:cursor-grabbing [--desk-dim:1] [--desk-shadow:rgba(35,28,20,0.38)] dark:[--desk-dim:0.72] dark:[--desk-shadow:rgba(0,0,0,0.6)]"
        style={{
          right: `calc(2vw + var(--desk-w) * ${(1 - PLANT_ART.right).toFixed(4)})`,
          bottom: `calc(var(--desk-w) * var(--desk-ratio) * (${(1 - PLANT_ART.bottom).toFixed(4)} - var(--desk-sink)))`,
          width: `calc(var(--desk-w) * ${(PLANT_ART.right - PLANT_ART.left).toFixed(4)})`,
          ...light,
        }}
        onPointerDown={onPlantDown}
        onPointerMove={onPlantMove}
        onPointerUp={onPlantUp}
        onPointerCancel={onPlantUp}
      >
        <div
          className={cn("relative", drinking && !reducedMotion && "animate-[plant-drink_2.6s_ease-in-out]")}
          style={{ transformOrigin: soil }}
        >
          <Image
            src={PLANT_ART.src}
            alt=""
            width={PLANT_ART.width}
            height={PLANT_ART.height}
            priority
            draggable={false}
            sizes="(min-width: 1024px) 24vw, (min-width: 640px) 32vw, 42vw"
            className="h-auto w-full"
            style={{
              transform: `perspective(1100px) rotateY(${turn.toFixed(2)}deg)`,
              transformOrigin: soil,
              transition: holdingPlant ? "none" : spring,
              filter:
                "drop-shadow(18px 22px 24px var(--desk-shadow)) brightness(calc(var(--desk-light) * var(--desk-dim))) saturate(var(--desk-tone))",
            }}
          />
          {/* Where the buddy stands to pour: the pot's opening. */}
          <div
            data-desk-pot
            className="absolute h-px"
            style={{
              left: `${((PLANT_ART.pot.x - PLANT_ART.pot.r) * 100).toFixed(2)}%`,
              width: `${(PLANT_ART.pot.r * 2 * 100).toFixed(2)}%`,
              top: `${(PLANT_ART.pot.top * 100).toFixed(2)}%`,
            }}
          />
          {/* Wet soil at the top of the pot. */}
          <div
            className="absolute rounded-[50%]"
            style={{
              left: `${((PLANT_ART.pot.x - PLANT_ART.pot.r) * 100).toFixed(2)}%`,
              width: `${(PLANT_ART.pot.r * 2 * 100).toFixed(2)}%`,
              top: `${((PLANT_ART.pot.top - 0.015) * 100).toFixed(2)}%`,
              height: "4.5%",
              background: "radial-gradient(ellipse at center, rgba(55, 38, 22, 0.6), rgba(55, 38, 22, 0) 72%)",
              opacity: wet ? 1 : 0,
              transition: `opacity ${wet ? 900 : 5000}ms ease`,
            }}
          />
        </div>
      </div>

      {/* The Makerslounge book, between the notebook and the pot. After the
          plant, whose box reaches over it and would take its clicks. */}
      <DeskBook light={light} />

      {/* The water, while the jar is tipped over the pot. */}
      {stream && (
        <>
          <div
            className={cn("absolute w-[3px] rounded-full", !reducedMotion && "animate-[water-flow_0.32s_linear_infinite]")}
            style={{
              left: stream.x - 1.5,
              top: stream.y,
              height: stream.height,
              backgroundImage:
                "repeating-linear-gradient(to bottom, rgba(255,255,255,0) 0 6px, rgba(255,255,255,0.55) 6px 9px), linear-gradient(to bottom, rgba(205,228,247,0), rgba(205,228,247,0.85) 12px, rgba(190,220,245,0.9))",
              backgroundSize: "100% 14px, 100% 100%",
              boxShadow: "0 0 4px rgba(200, 226, 246, 0.6)",
            }}
          />
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn("absolute h-[9px] w-[28px] rounded-[50%] border border-[rgba(205,228,247,0.85)]", !reducedMotion && "animate-[water-ripple_0.8s_ease-out_infinite]")}
              style={{ left: stream.x, top: stream.y + stream.height, animationDelay: `${i * 0.4}s`, transform: "translate(-50%, -50%)" }}
            />
          ))}
        </>
      )}

      {/* The jar on the sill. */}
      <div
        data-desk-jar
        className={cn(
          "absolute touch-none",
          errand ? "pointer-events-none" : "pointer-events-auto cursor-grab active:cursor-grabbing",
        )}
        style={{
          left: jarLeft,
          top: jarTop,
          width: jarW,
          height: jarH,
          transform: `translate(${jarOffset.x}px, ${jarOffset.y}px)`,
          transition: holdingJar || (errand && !lifting) ? "none" : glide,
          filter: "drop-shadow(6px 8px 8px rgba(35, 28, 20, 0.28))",
        }}
        onPointerDown={onJarDown}
        onPointerMove={onJarMove}
        onPointerUp={onJarUp}
        onPointerCancel={onJarUp}
      >
        <Image
          src={JAR_ART.upright.src}
          alt=""
          width={Math.round(480 * JAR_ART.upright.aspect)}
          height={480}
          draggable={false}
          sizes="10vw"
          className="absolute bottom-0 left-0 h-full w-auto transition-opacity duration-150"
          style={{ opacity: stream || errand === "pour" ? 0 : 1 }}
        />
        <Image
          src={JAR_ART.pouring.src}
          alt=""
          width={Math.round(480 * JAR_ART.pouring.aspect)}
          height={480}
          draggable={false}
          sizes="10vw"
          className="absolute bottom-0 left-0 h-full w-auto transition-opacity duration-150"
          style={{ opacity: stream || errand === "pour" ? 1 : 0 }}
        />
      </div>
    </div>
  );
}
