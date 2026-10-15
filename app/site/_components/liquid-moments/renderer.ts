// From the vgpu "Liquid Layout" example. Changes for the site: no lil-gui (the
// section has its own Shuffle and filter controls), the floor takes the page's
// background colour and follows theme changes, the frame loop pauses while the
// section is scrolled out of view, and the idle choreography only moves and
// filters photos: it never opens one, since that would cover the page.
//
// Motion owns the frame. Its frameloop runs the layout projection, springs and
// drag, writes styles in `render`, and then calls this renderer in
// `postRender`. There the renderer reads each card's final on-screen rect and
// motion values, advances the vgpu clock by Motion's delta, turns the cards
// into liquid and renders in the same browser frame. React never re-renders
// per frame: the layout store only carries discrete state.

import { cancelFrame, frame as motionFrame, frameData } from 'motion';
import { clock, frame, init, surface, type Gpu, type Surface } from 'vgpu';

import { CARD_BY_ID, GROUPS } from './cards';
import { clamp, createDynamics, type CardSample, type Dynamics } from './liquid-dynamics';
import { createPipeline, type LiquidPipeline, type Paper } from './liquid-pipeline';
import type { LayoutStore } from './layout-store';

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Receives pointer input and supplies the page colour; defaults to the canvas parent. */
  readonly container?: HTMLElement;
  readonly store: LayoutStore;
  /** Called when a frame throws and the renderer stops, so the page can fall back. */
  readonly onFail?: (error: unknown) => void;
}

interface Settings {
  autoplay: boolean;
  smoothness: number;
}

/** `focused` is the id of the card that holds focus, which the autoplay never replaces. */
type Step = (store: LayoutStore, focused: string | null) => number;

const MAX_DPR = 2;
const LIGHT_HEIGHT = 380;
const RESUME_AFTER = 6;
const FIRST_STEP = 4.2;

/** Carries the card in visible slot `from` across the grid to slot `to`; the focused card stays put. */
function moveStep(from: number, to: number): Step {
  return (store, focused) => {
    const shown = store.visible();
    const id = shown[Math.min(from, shown.length - 1)];
    if (id && id !== focused) store.move(id, to);
    return 3.2;
  };
}

// The idle choreography: each step acts on the store and returns the pause before the next.
const SCRIPT: readonly Step[] = [
  moveStep(0, 3),
  (store) => (store.shuffle(), 3.2),
  moveStep(7, 4),
  (store) => (store.setFilter(GROUPS[0] ?? 'all'), 3.4),
  (store) => (store.setFilter('all'), 3.4),
  moveStep(1, 6),
  (store) => (store.setFilter(GROUPS[1] ?? 'all'), 3.4),
  (store) => (store.setFilter('all'), 3.4),
];

/** sRGB channel (0..1) to linear. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

let colourProbe: CanvasRenderingContext2D | null | undefined;

/**
 * The page background behind `element`, linear RGB. Computed colours can be
 * oklch(), so a 1×1 2D canvas resolves whatever CSS gives into sRGB bytes.
 */
export function readPaper(element: Element): Paper | null {
  let node: Element | null = element;
  let css = '';
  while (node) {
    css = getComputedStyle(node).backgroundColor;
    if (css && css !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(css)) break;
    node = node.parentElement;
  }
  if (!node) return null;
  if (colourProbe === undefined) {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    colourProbe = probe.getContext('2d', { willReadFrequently: true });
  }
  if (!colourProbe) return null;
  colourProbe.clearRect(0, 0, 1, 1);
  colourProbe.fillStyle = '#000';
  colourProbe.fillStyle = css;
  colourProbe.fillRect(0, 0, 1, 1);
  const [r, g, b] = colourProbe.getImageData(0, 0, 1, 1).data;
  return [toLinear(r! / 255), toLinear(g! / 255), toLinear(b! / 255)];
}

function bestEffort(cleanup: () => void): void {
  try {
    cleanup();
  } catch {
    // Teardown must run to completion even when one step throws.
  }
}

/** Reads every mounted card as the liquid sees it: centre, unrotated size and motion values. */
export function sampleCards(store: LayoutStore, origin: { left: number; top: number }): CardSample[] {
  const samples: CardSample[] = [];
  const { returning } = store.getState();
  for (const handle of store.handles()) {
    const rect = handle.element?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) continue;
    const rotation = (handle.rotate.get() * Math.PI) / 180;
    // The rect is the rotated card's bounding box; undo the rotation to recover its size.
    const c = Math.abs(Math.cos(rotation));
    const s = Math.abs(Math.sin(rotation));
    const det = c * c - s * s;
    let width = rect.width;
    let height = rect.height;
    if (det > 0.3) {
      width = Math.max(1, (rect.width * c - rect.height * s) / det);
      height = Math.max(1, (rect.height * c - rect.width * s) / det);
    }
    samples.push({
      id: handle.id,
      layer: handle.layer,
      cx: rect.left - origin.left + rect.width / 2,
      cy: rect.top - origin.top + rect.height / 2,
      hw: width / 2,
      hh: height / 2,
      rotation,
      offsetX: handle.x.get(),
      offsetY: handle.y.get(),
      scale: handle.scale.get(),
      hue: CARD_BY_ID.get(handle.id)?.hue ?? 0,
      present: handle.present,
      hovered: handle.hovered,
      lifted: handle.layer === 'panel' || handle.id === returning,
    });
  }
  return samples;
}

export function createRenderer({
  canvas,
  container = canvas.parentElement ?? undefined,
  store,
  onFail,
}: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let pipeline: LiquidPipeline | undefined;
  let dynamics: Dynamics | undefined;
  let motion: MediaQueryList | undefined;
  let themeObserver: MutationObserver | undefined;
  let viewObserver: IntersectionObserver | undefined;
  let ticking = false;
  // Until the observer reports, assume the section is on screen.
  let inView = true;

  const settings: Settings = {
    autoplay: true,
    smoothness: 1,
  };

  let time = 0;
  let reducedMotion = false;
  let origin = { left: 0, top: 0, width: 0, height: 0 };
  let pointer: { x: number; y: number } | null = null;
  let pointerIdle = Number.POSITIVE_INFINITY;
  const light = { x: 0, y: 0, placed: false };
  let dim = 0;

  // Autoplay: runs while nobody interacts, pauses for RESUME_AFTER seconds after
  // input, and holds while a press, a mouse resting anywhere over the demo, a
  // user-opened panel or keyboard focus is inside it: it must not reorder the
  // cards under someone reading them.
  let step = 0;
  let nextStepIn = FIRST_STEP;
  let quietFor = RESUME_AFTER;
  let pressed = false;
  // A mouse or pen over the demo; a finger leaves nothing hovering once lifted.
  let mouseOver = false;

  const interact = () => {
    quietFor = 0;
  };
  const onPointerDown = () => {
    pressed = true;
    interact();
  };
  const onPointerUp = () => {
    pressed = false;
    interact();
  };
  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX - origin.left, y: event.clientY - origin.top };
    pointerIdle = 0;
    mouseOver = event.pointerType !== 'touch';
    interact();
  };
  const onPointerLeave = () => {
    pointer = null;
    mouseOver = false;
  };
  const onMotionPreference = () => {
    reducedMotion = motion?.matches ?? false;
    dynamics?.setOptions({ reducedMotion });
    // Follow the system setting: no idle choreography under reduced motion.
    settings.autoplay = !reducedMotion;
  };
  const onTheme = () => {
    const paper = container ? readPaper(container) : null;
    if (paper) pipeline?.setPaper(paper);
  };
  // Motion calls tick every frame while the section is on screen; off screen
  // nothing renders and the idle choreography waits.
  const startTicking = () => {
    if (ticking || disposed || !pipeline) return;
    // keepAlive: Motion calls tick every frame, after its own style writes.
    motionFrame.postRender(tick, true);
    ticking = true;
  };
  const stopTicking = () => {
    if (!ticking) return;
    cancelFrame(tick);
    ticking = false;
  };

  const focusedElement = (): Element | null => {
    if (typeof document === 'undefined') return null;
    const active = document.activeElement;
    return active && active !== document.body && container?.contains(active) ? active : null;
  };

  const autoplay = (dt: number) => {
    const state = store.getState();
    const userOpen = state.expanded !== null && state.openedBy !== 'auto';
    const focused = focusedElement();
    const keyboardFocus = focused?.matches(':focus-visible') ?? false;
    const hovering = Array.from(store.handles()).some((handle) => handle.hovered);
    const held = pressed || mouseOver || hovering || userOpen || keyboardFocus;
    if (!held) quietFor += dt;
    if (!settings.autoplay || held || quietFor < RESUME_AFTER) return;
    nextStepIn -= dt;
    if (nextStepIn > 0) return;
    const action = SCRIPT[step % SCRIPT.length]!;
    step++;
    nextStepIn = action(store, focused?.getAttribute('data-card') ?? null);
  };

  const updateLight = (dt: number) => {
    pointerIdle += dt;
    const { width, height } = origin;
    // Without a pointer the key light drifts slowly across the top of the room.
    const orbit = time * (reducedMotion ? 0.08 : 0.22);
    let tx = width * (0.5 + 0.34 * Math.cos(orbit));
    let ty = height * (0.24 + 0.12 * Math.sin(orbit * 1.7));
    if (pointer && pointerIdle < 4) {
      tx = pointer.x;
      ty = pointer.y;
    }
    if (!light.placed) {
      light.x = tx;
      light.y = ty;
      light.placed = true;
    }
    const follow = 1 - Math.exp(-dt / (pointer ? 0.09 : 0.6));
    light.x += (tx - light.x) * follow;
    light.y += (ty - light.y) * follow;
  };

  const tick = () => {
    try {
      render();
    } catch (error) {
      // A frame that throws would throw again on every tick: stop once and
      // report it outside Motion's frameloop, which keeps animating the cards.
      dispose();
      onFail?.(error);
      queueMicrotask(() => {
        throw error;
      });
    }
  };

  const render = () => {
    if (disposed || !gpu || !output || !pipeline || !dynamics) return;
    const dt = clamp(frameData.delta, 0, 50) / 1000;
    clock(gpu).advance(dt);
    time += dt;

    const rect = canvas.getBoundingClientRect();
    // The canvas changed size: every card moved for layout reasons, not motion.
    const resized = rect.width !== origin.width || rect.height !== origin.height;
    origin = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    if (origin.width < 1 || origin.height < 1) return;

    autoplay(dt);
    updateLight(dt);
    const expanded = store.getState().expanded !== null;
    dim += ((expanded ? 1 : 0) - dim) * (1 - Math.exp(-dt / 0.2));

    const liquid = dynamics.update(sampleCards(store, origin), dt, [origin.width, origin.height], resized);
    pipeline.update({ liquid, light: [light.x, light.y, LIGHT_HEIGHT], dim });
    const target = output;
    const chain = pipeline;
    frame(gpu, (currentFrame) => chain.encode(currentFrame, target));
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of [
      () => stopTicking(),
      () => viewObserver?.disconnect(),
      () => themeObserver?.disconnect(),
      () => motion?.removeEventListener('change', onMotionPreference),
      () => {
        container?.removeEventListener('pointerdown', onPointerDown);
        container?.removeEventListener('pointermove', onPointerMove);
        container?.removeEventListener('pointerleave', onPointerLeave);
        container?.removeEventListener('keydown', interact);
        container?.removeEventListener('wheel', interact);
      },
      () => {
        if (typeof window !== 'undefined') window.removeEventListener('pointerup', onPointerUp);
        if (typeof window !== 'undefined') window.removeEventListener('pointercancel', onPointerUp);
      },
      () => gpu?.dispose(),
    ]) {
      bestEffort(cleanup);
    }
  };

  const initialize = async () => {
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    output = surface(gpu, canvas, { dpr: [1, MAX_DPR] });
    motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    reducedMotion = motion?.matches ?? false;
    settings.autoplay = !reducedMotion;
    dynamics = createDynamics({ smoothness: settings.smoothness, reducedMotion });
    pipeline = createPipeline(gpu, output.size, output.dpr);
    onTheme();
    await pipeline.prewarm(output);
    if (disposed) return;

    const chain = pipeline;
    output.onResize(({ width, height, dpr }) => chain.resize([width, height], dpr));
    motion?.addEventListener('change', onMotionPreference);
    container?.addEventListener('pointerdown', onPointerDown);
    container?.addEventListener('pointermove', onPointerMove);
    container?.addEventListener('pointerleave', onPointerLeave);
    container?.addEventListener('keydown', interact);
    container?.addEventListener('wheel', interact, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // The theme toggles a class (or style) on <html>; re-read the page colour then.
    themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    if (container && typeof IntersectionObserver !== 'undefined') {
      viewObserver = new IntersectionObserver(
        ([entry]) => {
          inView = entry?.isIntersecting ?? true;
          if (inView) startTicking();
          else stopTicking();
        },
        { rootMargin: '120px 0px' },
      );
      viewObserver.observe(container);
    }
    if (inView) startTicking();
  };

  function fail(error: unknown): never {
    dispose();
    throw error;
  }

  const ready = initialize().catch((error: unknown) => {
    if (disposed) return;
    fail(error);
  });

  return { ready, dispose };
}
