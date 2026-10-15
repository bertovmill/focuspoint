"use client";

// The DOM half, from the vgpu "Liquid Layout" example: one real button per
// photo, laid out by CSS grid and moved by Motion. Shuffles, filters and drag
// reorders are `layout` animations, filtering in and out runs through
// AnimatePresence (popLayout), and opening a photo is a `layoutId` hand-off to
// the panel. The cards carry no fill of their own: each one registers a handle
// with the store, and the renderer pours liquid glass under it every frame.
// Without WebGPU (`glass` false) the cards and panel get a plain CSS fill.
//
// Changes for the site: the cards hold a photo and caption, the panel holds
// the photo, the post behind it and a link out, and the open photo is mirrored
// into the URL hash (#moment-<slug>) so a story can be linked to directly.
// Dragging is for mouse and pen only, so a finger can still scroll the page.

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  useIsPresent,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from "react";
import Image from "next/image";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { CARD_BY_ID, formatMonth, type CardData } from "./cards";
import {
  cardInset,
  cornerRadius,
  gridFrame,
  isArrowKey,
  keyedIndex,
  photoHeight,
  slotAt,
  type CardHandle,
  type GridLayout,
  type LayoutStore,
} from "./layout-store";

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Spring {
  readonly stiffness: number;
  readonly damping: number;
}

const ENTER_DELAY = 0.22;
const ENTER_STAGGER = 0.04;
const FLIGHT_COPY_MS = 420;
const HELP_ID = "liquid-moments-help";
const HASH_PREFIX = "#moment-";
const LINKEDIN_ACTIVITY_URL = "https://www.linkedin.com/in/bertomill/recent-activity/images/";

/** The CSS stand-in for the glass when WebGPU is unavailable. */
const FALLBACK_FILL = "bg-card ring-1 ring-border shadow-sm";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Whether the primary pointer can hover precisely: a mouse or pen, not a finger. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia("(pointer: fine)");
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia("(pointer: fine)").matches,
    () => true,
  );
}

/** Registers a card with the store so the renderer can read it each frame. */
function useCardHandle(
  store: LayoutStore,
  id: string,
  layer: CardHandle["layer"],
  values: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    scale: MotionValue<number>;
    rotate: MotionValue<number>;
  },
) {
  const { x, y, scale, rotate } = values;
  const handle = useMemo<CardHandle>(
    () => ({ id, layer, element: null, x, y, scale, rotate, present: true, hovered: false }),
    [id, layer, x, y, scale, rotate],
  );
  useLayoutEffect(() => store.register(handle), [store, handle]);
  return handle;
}

interface CardProps {
  readonly card: CardData;
  readonly store: LayoutStore;
  readonly layout: GridLayout;
  readonly grid: RefObject<HTMLElement | null>;
  readonly enterDelay: number;
  readonly dimmed: boolean;
  /** Another card is being dragged: this one steps back. */
  readonly muted: boolean;
  /** Dragged or flying back from the panel: drawn above the other cards. */
  readonly raised: boolean;
  readonly spring: Spring;
  readonly glass: boolean;
  readonly draggable: boolean;
  readonly priority: boolean;
  readonly returnFocus: RefObject<string | null>;
  readonly onOpen: (id: string) => void;
  readonly onDragChange: (id: string, active: boolean) => void;
  readonly onMoved: (id: string) => void;
  readonly ref?: Ref<HTMLElement>;
}

function Card({
  card,
  store,
  layout,
  grid,
  enterDelay,
  dimmed,
  muted,
  raised,
  spring,
  glass,
  draggable,
  priority,
  returnFocus,
  onOpen,
  onDragChange,
  onMoved,
  ref,
}: CardProps) {
  const isPresent = useIsPresent();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  // Flicks tilt the card a little, like a tray of liquid swinging on release.
  const tilt = useTransform(useVelocity(x), [-1800, 1800], [-8, 8], { clamp: true });
  const rotate = useSpring(tilt, { stiffness: 320, damping: 24 });
  const handle = useCardHandle(store, card.id, "grid", { x, y, scale, rotate });
  const dragged = useRef(false);
  const holding = useRef(false);
  // Pointer position relative to the card centre when the drag began.
  const grab = useRef({ x: 0, y: 0, index: -1 });
  const entered = useRef(enterDelay < 0);
  // The photo sinks into the liquid while the card flies, so crossing cards
  // show the glass bridging between them. It resurfaces once most of the
  // distance is covered.
  const [flying, setFlying] = useState(false);
  const landing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const button = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    handle.present = isPresent;
  }, [handle, isPresent]);

  useEffect(() => () => clearTimeout(landing.current), []);
  useEffect(() => () => onDragChange(card.id, false), [card.id, onDragChange]);

  const takeOff = () => {
    // The held card follows the pointer; only the cards it displaces fly.
    if (holding.current) return;
    setFlying(true);
    clearTimeout(landing.current);
    landing.current = setTimeout(() => setFlying(false), FLIGHT_COPY_MS);
  };

  useEffect(() => {
    if (returnFocus.current !== card.id) return;
    returnFocus.current = null;
    button.current?.focus({ preventScroll: true });
  }, [card.id, returnFocus]);

  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      handle.element = node;
      button.current = node;
      assignRef(ref, node);
    },
    [handle, ref],
  );

  // Motion keeps a dragged element under the pointer while its layout slot
  // moves, so reordering is only a matter of picking the slot under the card's
  // centre. Reorder.Group is a one-axis list; the grid does its own hit test.
  const onDrag = (_event: unknown, info: PanInfo) => {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return;
    const centreX = info.point.x - window.scrollX - grab.current.x - box.left;
    const centreY = info.point.y - window.scrollY - grab.current.y - box.top;
    const visible = store.visible();
    const slot = slotAt(layout, centreX, centreY, visible.length);
    if (slot >= 0 && visible[slot] !== card.id) store.move(card.id, slot);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || !isArrowKey(event.key)) return;
    // Alt+Arrow is the browser's Back/Forward on Windows and Linux: swallow it on
    // a card even at the grid's edge, where the card stays put.
    event.preventDefault();
    const visible = store.visible();
    const next = keyedIndex(event.key, visible.indexOf(card.id), visible.length, layout.columns);
    if (next !== null && store.move(card.id, next)) onMoved(card.id);
  };

  const { cardWidth: width, cardHeight: height } = layout;
  const layoutSpring = { type: "spring", stiffness: spring.stiffness, damping: spring.damping } as const;
  const corner = cornerRadius(width, height);
  const inset = cardInset(width);
  const photo = photoHeight(width);
  const compact = width < 220;

  return (
    <motion.button
      ref={setRef}
      type="button"
      data-card={card.id}
      aria-label={`${card.title}, ${card.place}, ${formatMonth(card.date)}. Open the post`}
      aria-describedby={HELP_ID}
      layout
      layoutId={card.id}
      drag={draggable}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: spring.stiffness * 1.5, bounceDamping: spring.damping }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      whileDrag={{ scale: 1.04 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ layout: layoutSpring }}
      onHoverStart={() => {
        handle.hovered = true;
      }}
      onHoverEnd={() => {
        handle.hovered = false;
      }}
      onPointerDown={() => {
        dragged.current = false;
      }}
      onDragStart={(event) => {
        const box = button.current?.getBoundingClientRect();
        const point = "clientX" in event ? event : event.touches[0];
        if (box && point) {
          grab.current = {
            x: point.clientX - (box.left + box.width / 2),
            y: point.clientY - (box.top + box.height / 2),
            index: store.visible().indexOf(card.id),
          };
        }
        dragged.current = true;
        holding.current = true;
        onDragChange(card.id, true);
      }}
      onDrag={onDrag}
      onDragEnd={() => {
        holding.current = false;
        if (store.visible().indexOf(card.id) !== grab.current.index) onMoved(card.id);
      }}
      // The card stays on top until it lands in its slot, not just until release.
      onDragTransitionEnd={() => onDragChange(card.id, false)}
      onKeyDown={onKeyDown}
      onClick={() => {
        // The click that ends a drag does not open the card; the next one does,
        // including a keyboard press, which sends no pointerdown.
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onOpen(card.id);
      }}
      onLayoutAnimationStart={takeOff}
      onLayoutAnimationComplete={() => {
        clearTimeout(landing.current);
        setFlying(false);
        store.settle(card.id);
      }}
      style={{
        x,
        y,
        scale,
        rotate,
        width,
        height,
        borderRadius: corner,
        zIndex: raised ? 15 : 1,
        // A finger scrolls the page; only a mouse or pen drags.
        touchAction: draggable ? "none" : "manipulation",
      }}
      // The focus ring waits for the card to land: mid-flight, the layout
      // transform would stretch it with the card.
      className={cn(
        "relative select-none text-left text-foreground outline-none",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        !glass && FALLBACK_FILL,
        !(flying || raised) &&
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-ring",
      )}
    >
      <motion.span
        layout="position"
        className="absolute inset-0 block"
        initial={entered.current ? false : { opacity: 0, filter: "blur(8px)" }}
        // Behind an open panel the card goes out of focus: the glass above
        // refracts the liquid but cannot bend DOM content. In flight it sinks
        // into the glass, and while another card is dragged it steps back.
        animate={{
          opacity: dimmed ? 0.2 : flying ? 0.3 : muted ? 0.55 : 1,
          filter: dimmed ? "blur(3px)" : flying ? "blur(2px)" : "blur(0px)",
        }}
        // The content's own layout correction must ride the card's spring, or
        // it lands early and leaves the liquid behind.
        transition={{
          ...(entered.current ? { duration: 0.22 } : { duration: 0.45, delay: enterDelay }),
          layout: layoutSpring,
        }}
        onAnimationComplete={() => {
          entered.current = true;
        }}
      >
        <span
          className="absolute overflow-hidden bg-muted"
          style={{ left: inset, right: inset, top: inset, height: photo, borderRadius: Math.max(4, corner - inset) }}
        >
          <Image
            src={card.src}
            alt=""
            fill
            draggable={false}
            sizes="(min-width: 1152px) 280px, (min-width: 900px) 24vw, (min-width: 560px) 32vw, 48vw"
            priority={priority}
            className="pointer-events-none object-cover"
          />
        </span>
        <span
          className="absolute flex flex-col gap-0.5"
          style={{ left: inset + 4, right: inset + 4, top: inset + photo + (compact ? 8 : 10) }}
        >
          <span
            className={cn("line-clamp-2 font-medium leading-snug", compact ? "text-[13px]" : "text-sm")}
          >
            {card.title}
          </span>
          <span className={cn("truncate text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            {card.place} · {formatMonth(card.date)}
          </span>
        </span>
      </motion.span>
    </motion.button>
  );
}

interface SlotProps extends Omit<CardProps, "ref"> {
  readonly placeholder: boolean;
  readonly ref?: Ref<HTMLElement>;
}

/** AnimatePresence child: the card, or an empty slot while its panel is open. */
function GridSlot({ placeholder, ref, ...props }: SlotProps) {
  if (placeholder) {
    return (
      <div
        ref={(node) => assignRef(ref, node)}
        aria-hidden="true"
        style={{ width: props.layout.cardWidth, height: props.layout.cardHeight }}
      />
    );
  }
  return <Card {...props} ref={ref} />;
}

interface PanelProps {
  readonly card: CardData;
  readonly store: LayoutStore;
  readonly bounds: Size;
  readonly boundsElement: RefObject<HTMLElement | null>;
  readonly spring: Spring;
  readonly glass: boolean;
  readonly autoFocus: boolean;
  readonly onClose: () => void;
  readonly onStep: (direction: 1 | -1) => void;
}

function Panel({ card, store, bounds, boundsElement, spring, glass, autoFocus, onClose, onStep }: PanelProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const handle = useCardHandle(store, card.id, "panel", { x, y, scale, rotate });
  const close = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      handle.element = node;
    },
    [handle],
  );

  useEffect(() => {
    if (autoFocus) close.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const compact = bounds.width < 640;
  const width = Math.round(Math.min(880, bounds.width - (compact ? 8 : 48)));
  // The section is taller than the window, so the panel opens in the part of
  // it on screen rather than its middle. Measured once per photo.
  const [place] = useState(() => {
    const viewport = typeof window === "undefined" ? 800 : window.innerHeight;
    const height = Math.round(Math.min(compact ? 640 : 520, viewport - 96, bounds.height - 32));
    const box = boundsElement.current?.getBoundingClientRect();
    const centre = box ? viewport / 2 - box.top : bounds.height / 2;
    const top = Math.min(Math.max(centre - height / 2, 16), bounds.height - height - 16);
    return { height, top: Math.round(top) };
  });
  const { height } = place;
  const titleId = `liquid-moments-panel-${card.id}`;
  const layoutSpring = { type: "spring", stiffness: spring.stiffness, damping: spring.damping } as const;
  const corner = cornerRadius(width, height);
  const inset = cardInset(width);
  const reveal = { delay: 0.16, duration: 0.35, layout: layoutSpring };

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ top: place.top }}>
      <motion.div
        ref={setRef}
        // Non-modal: the cards behind it are inert, but the page stays reachable.
        role="dialog"
        aria-labelledby={titleId}
        data-panel={card.id}
        layoutId={card.id}
        layout
        transition={{ layout: layoutSpring }}
        style={{ x, y, scale, rotate, width, height, borderRadius: corner }}
        className={cn(
          "pointer-events-auto relative text-foreground",
          !glass && "bg-card/95 shadow-xl ring-1 ring-border backdrop-blur",
        )}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "ArrowRight") onStep(1);
          if (event.key === "ArrowLeft") onStep(-1);
        }}
      >
        <motion.div
          layout="position"
          className={cn("flex h-full w-full", compact ? "flex-col" : "flex-row")}
          style={{ padding: inset, gap: compact ? 14 : 24 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reveal}
        >
          <div
            className={cn("relative shrink-0 overflow-hidden bg-muted", compact ? "h-[42%] w-full" : "h-full w-[54%]")}
            style={{ borderRadius: Math.max(4, corner - inset) }}
          >
            <Image
              src={card.src}
              alt={`${card.title}, ${card.place}`}
              fill
              sizes="(min-width: 900px) 480px, 100vw"
              className="object-cover"
            />
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "px-1 pb-1" : "py-4 pr-4")}>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {card.place} · {formatMonth(card.date)}
            </p>
            <h3
              id={titleId}
              className={cn(
                "mt-2 pr-10 font-semibold leading-tight tracking-[-0.02em]",
                compact ? "text-lg" : "text-2xl",
              )}
            >
              {card.title}
            </h3>
            <p className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-line pr-1 text-sm leading-relaxed text-foreground/80">
              {card.post}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <a
                href={LINKEDIN_ACTIVITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-foreground"
              >
                More on LinkedIn
                <ArrowUpRightIcon className="size-4" />
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onStep(-1)}
                  aria-label="Previous photo"
                  className="rounded-full border border-border p-2 transition-colors hover:bg-muted"
                >
                  <ArrowLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onStep(1)}
                  aria-label="Next photo"
                  className="rounded-full border border-border p-2 transition-colors hover:bg-muted"
                >
                  <ArrowRightIcon className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
        <motion.button
          ref={close}
          type="button"
          aria-label="Close"
          data-close
          onClick={onClose}
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reveal}
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground/75 outline-none ring-1 ring-border transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <XIcon className="size-4" />
        </motion.button>
      </motion.div>
    </div>
  );
}

export function LiquidCards({ store, glass }: { store: LayoutStore; glass: boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const bounds = useRef<HTMLDivElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(bounds);
  const draggable = useFinePointer();
  const returnFocus = useRef<string | null>(null);
  const focused = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const visible = store.visible(state);
  const spring = { stiffness: state.stiffness, damping: state.damping };
  const frame = gridFrame(size.width, Math.max(1, CARD_BY_ID.size));

  // Cards joining the grid fade in as their circle opens out, in reading
  // order. The previous list lives in state, so every render agrees on who is new.
  const visibleKey = visible.join(",");
  const [entry, setEntry] = useState({ key: visibleKey, entering: visible });
  if (entry.key !== visibleKey) {
    const before = new Set(entry.key.split(","));
    setEntry({ key: visibleKey, entering: visible.filter((id) => !before.has(id)) });
  }
  const { entering } = entry;

  const expanded = state.expanded ? CARD_BY_ID.get(state.expanded) : undefined;
  const userOpen = expanded !== undefined && state.openedBy === "user";

  const [dragging, setDragging] = useState<string | null>(null);
  const onOpen = useCallback((id: string) => store.expand(id, "user"), [store]);
  const onDragChange = useCallback((id: string, active: boolean) => {
    setDragging((current) => (active ? id : current === id ? null : current));
  }, []);
  const onMoved = useCallback(
    (id: string) => {
      const shown = store.visible();
      const title = CARD_BY_ID.get(id)?.title ?? id;
      setAnnouncement(`${title} moved to position ${shown.indexOf(id) + 1} of ${shown.length}`);
    },
    [store],
  );
  const onClose = useCallback(() => {
    const { expanded: id, openedBy } = store.getState();
    // Focus goes back to the card when the panel had it, whoever opened it.
    const focusInPanel = document.activeElement?.closest("[data-panel]") != null;
    if (id && (openedBy === "user" || focusInPanel)) returnFocus.current = id;
    store.collapse();
  }, [store]);
  const onStep = useCallback(
    (direction: 1 | -1) => {
      const { expanded: id } = store.getState();
      const shown = store.visible();
      if (!id || shown.length < 2) return;
      const next = shown[(shown.indexOf(id) + direction + shown.length) % shown.length]!;
      store.expand(next, "user");
    },
    [store],
  );

  const ready = size.width > 0 && size.height > 0;
  // Set once an incoming #moment-<slug> has been read, so the hash is not cleared first.
  const linked = useRef(false);

  // The open photo lives in the URL hash, so a story can be linked to.
  useEffect(() => {
    if (!linked.current || state.openedBy === "auto") return;
    const url = state.expanded
      ? `${HASH_PREFIX}${state.expanded}`
      : window.location.pathname + window.location.search;
    if (state.expanded ? window.location.hash !== url : window.location.hash.startsWith(HASH_PREFIX)) {
      window.history.replaceState(null, "", url);
    }
  }, [state.expanded, state.openedBy]);

  // Arriving on #moment-<slug>: bring the section into view and open that photo.
  useEffect(() => {
    if (!ready || linked.current) return;
    linked.current = true;
    const hash = window.location.hash;
    if (!hash.startsWith(HASH_PREFIX)) return;
    const id = hash.slice(HASH_PREFIX.length);
    if (!CARD_BY_ID.has(id)) return;
    bounds.current?.scrollIntoView({ block: "start" });
    store.setFilter("all");
    store.expand(id, "user");
  }, [ready, store]);

  // A reorder moves DOM nodes, and moving the focused card drops focus to the
  // body. Put it back on the same card, whoever reordered the grid.
  useLayoutEffect(() => {
    const id = focused.current;
    if (!id || (document.activeElement !== document.body && document.activeElement !== null)) return;
    grid.current?.querySelector<HTMLElement>(`[data-card="${id}"]`)?.focus({ preventScroll: true });
  }, [visibleKey]);

  useEffect(() => {
    if (!state.expanded) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape in a field belongs to that field.
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.expanded, onClose]);

  // A returning card normally settles when its layout animation completes; this is the fallback.
  useEffect(() => {
    const id = state.returning;
    if (!id) return;
    const timer = window.setTimeout(() => store.settle(id), 1400);
    return () => window.clearTimeout(timer);
  }, [state.returning, store]);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={bounds} className="absolute inset-0 isolate z-[1] overflow-hidden">
        <p id={HELP_ID} className="sr-only">
          Press Enter to open a photo and the post behind it. Alt and an arrow key move the focused photo; dragging a
          photo onto another slot reorders the grid.
        </p>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {ready ? (
          <LayoutGroup>
            <div
              ref={grid}
              inert={userOpen}
              className="absolute"
              onFocus={(event) => {
                focused.current = event.target.closest("[data-card]")?.getAttribute("data-card") ?? null;
              }}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && grid.current?.contains(next)) return;
                if (next) {
                  focused.current = null;
                  return;
                }
                // No new target: either the user blurred the card (focus sits on
                // the body afterwards) or a reorder moved it (restored above).
                const id = focused.current;
                queueMicrotask(() => {
                  if (focused.current === id && document.activeElement === document.body) focused.current = null;
                });
              }}
              style={{
                left: frame.left,
                top: frame.top,
                width: frame.width,
                height: frame.height,
                display: "grid",
                gridTemplateColumns: `repeat(${frame.columns}, ${frame.cardWidth}px)`,
                gridAutoRows: `${frame.cardHeight}px`,
                alignContent: "start",
                gap: frame.gap,
              }}
            >
              <AnimatePresence mode="popLayout">
                {visible.map((id, index) => {
                  const card = CARD_BY_ID.get(id)!;
                  const rank = entering.indexOf(id);
                  return (
                    <GridSlot
                      key={id}
                      placeholder={state.expanded === id}
                      card={card}
                      store={store}
                      layout={frame}
                      grid={grid}
                      enterDelay={rank < 0 ? -1 : ENTER_DELAY + rank * ENTER_STAGGER}
                      dimmed={expanded !== undefined}
                      muted={dragging !== null && dragging !== id}
                      raised={state.returning === id || dragging === id}
                      spring={spring}
                      glass={glass}
                      draggable={draggable}
                      priority={index < frame.columns}
                      returnFocus={returnFocus}
                      onOpen={onOpen}
                      onDragChange={onDragChange}
                      onMoved={onMoved}
                    />
                  );
                })}
              </AnimatePresence>
            </div>

            {expanded ? (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  data-backdrop
                  className="absolute inset-0 z-20 cursor-default"
                  onClick={onClose}
                />
                <Panel
                  key={expanded.id}
                  card={expanded}
                  store={store}
                  bounds={size}
                  boundsElement={bounds}
                  spring={spring}
                  glass={glass}
                  autoFocus={userOpen}
                  onClose={onClose}
                  onStep={onStep}
                />
              </>
            ) : null}
          </LayoutGroup>
        ) : null}
      </div>
    </MotionConfig>
  );
}
