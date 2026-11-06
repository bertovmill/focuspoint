import { clock, effect, frameLoop, init, surface, type Gpu } from "vgpu";
import bubbleWgsl from "./bubble-glass.wgsl";

/**
 * Liquid glass under the hello bubble, after the liquid-layout example in
 * vgpu: the DOM bubble carries no fill of its own, and this pours a pane of
 * the page's background under it every frame.
 *
 * What the DOM does not have lives here: the glass is a jelly. Its strain
 * chases a stretch along the direction it moves through an under-damped
 * spring, so when the buddy (and the bubble over its head) stops, the body
 * overshoots into a squash and wobbles back. Its size follows the bubble's
 * through a spring too, so the typing pill blooms into the text box instead
 * of snapping. Under reduced motion both snap.
 *
 * Coordinates are CSS px on the canvas, which sits `MARGIN` px outside the
 * bubble's box on every side, so the squash has room and the shadow fits.
 */

export const MARGIN = 32;

export interface BubbleGlassOptions {
  /** Read each frame: 1 in dark mode, 0 in light. */
  readonly isDark: () => boolean;
  readonly reducedMotion: () => boolean;
  /** The bubble's box, measured each frame: width, height, corner radius, tail x from its left edge. */
  readonly box: () => { width: number; height: number; corner: number; tail: number };
  /** Called once if the GPU fails after `ready`; the component goes back to the CSS bubble. */
  readonly onFail?: (error: unknown) => void;
}

type Strain = [number, number, number];

// The jelly: how far it stretches at speed, how fast it rings, and how little
// damping, so a stop rings for two or three wobbles.
const STRETCH_MAX = 0.14;
const JELLY_OMEGA = 2 * Math.PI * 3;
const JELLY_DAMPING = 0.26;
const STRAIN_LIMIT = 0.22;
// A change of size (the pill becoming the box) kicks the jelly.
const SIZE_KICK = 0.3;
// The body trails the bubble a touch, so a stretch reads as drag, not scale.
const LAG_SECONDS = 0.012;
const LAG_LIMIT = 8;
// The size spring: reaches the new box in ~0.3 s with a small swell past it.
const GROW_OMEGA = 2 * Math.PI * 2.2;
const GROW_DAMPING = 0.72;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createBubbleGlass(canvas: HTMLCanvasElement, options: BubbleGlassOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;

  // Where the bubble is on the page (its wrapper's translate), set from
  // outside each pose frame; the velocity comes from how it changes.
  let posX = 0;
  let posY = 0;
  let placed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    gpu?.dispose();
  };

  const ready = (async () => {
    const context = await init();
    if (disposed) {
      context.dispose();
      return;
    }
    gpu = context;
    context.onError((error) => {
      if (disposed) return;
      dispose();
      options.onFail?.(error);
    });
    const output = surface(context, canvas, {
      dpr: [1, 2],
      alphaMode: "premultiplied",
      clearColor: [0, 0, 0, 0],
    });
    const glass = effect(context, bubbleWgsl, { label: "bubble-glass" });
    const time = clock(context);

    let prevX = 0;
    let prevY = 0;
    let vx = 0;
    let vy = 0;
    let hw = 0;
    let hh = 0;
    let vw = 0;
    let vh = 0;
    let energy = 0;
    let elapsed = 0;
    let first = true;
    const strain: Strain = [0, 0, 0];
    const strainVelocity: Strain = [0, 0, 0];
    let fillKey = "";
    let fill: [number, number, number] = [0.98, 0.98, 0.98];

    frameLoop(context, (frame) => {
      try {
        const dt = clamp(time.deltaTime || 1 / 60, 1 / 240, 1 / 20);
        const calm = options.reducedMotion();
        const box = options.box();
        const targetHw = box.width / 2;
        const targetHh = box.height / 2;
        const teleport = first || !placed;
        first = false;

        // Velocity across the page, filtered so a frame's jitter doesn't ring the jelly.
        const rawVx = teleport ? 0 : (posX - prevX) / dt;
        const rawVy = teleport ? 0 : (posY - prevY) / dt;
        prevX = posX;
        prevY = posY;
        const follow = 1 - Math.exp(-dt / 0.035);
        vx += (rawVx - vx) * follow;
        vy += (rawVy - vy) * follow;

        // The size spring, with the kick a change of size gives the jelly.
        const previousVw = vw;
        const previousVh = vh;
        if (teleport || calm) {
          hw = targetHw;
          hh = targetHh;
          vw = vh = 0;
        } else {
          const omega2 = GROW_OMEGA * GROW_OMEGA;
          const damping = 2 * GROW_DAMPING * GROW_OMEGA;
          vw += (omega2 * (targetHw - hw) - damping * vw) * dt;
          vh += (omega2 * (targetHh - hh) - damping * vh) * dt;
          hw += vw * dt;
          hh += vh * dt;
        }

        const speed = Math.hypot(vx, vy) + 0.6 * (Math.abs(vw) + Math.abs(vh));
        const energyTarget = 1 - Math.exp(-speed / 700);
        const tau = energyTarget > energy ? 0.05 : 0.45;
        energy += (energyTarget - energy) * (1 - Math.exp(-dt / tau));
        if (!calm) elapsed += dt;

        if (calm) {
          strain[0] = strain[1] = strain[2] = 0;
          strainVelocity[0] = strainVelocity[1] = strainVelocity[2] = 0;
        } else {
          // Jelly: the strain chases a velocity-aligned stretch through an
          // under-damped spring, so a bubble that stops overshoots into a squash.
          const moveSpeed = Math.hypot(vx, vy);
          let t00 = 0;
          let t01 = 0;
          let t11 = 0;
          if (moveSpeed > 1) {
            const amount = STRETCH_MAX * (1 - Math.exp(-moveSpeed / 1600));
            const dx = vx / moveSpeed;
            const dy = vy / moveSpeed;
            const squeeze = 0.35 * amount;
            t00 = amount * dx * dx - squeeze * dy * dy;
            t01 = (amount + squeeze) * dx * dy;
            t11 = amount * dy * dy - squeeze * dx * dx;
          }
          const kickX = teleport ? 0 : (-(vw - previousVw) / dt / Math.max(40, hw)) * SIZE_KICK;
          const kickY = teleport ? 0 : (-(vh - previousVh) / dt / Math.max(40, hh)) * SIZE_KICK;
          const targets: Strain = [t00, t01, t11];
          const kicks: Strain = [kickX, 0, kickY];
          const omega2 = JELLY_OMEGA * JELLY_OMEGA;
          const damping = 2 * JELLY_DAMPING * JELLY_OMEGA;
          for (let c = 0; c < 3; c++) {
            const accel = omega2 * (targets[c] - strain[c]) - damping * strainVelocity[c] + kicks[c];
            strainVelocity[c] += accel * dt;
            strain[c] = clamp(strain[c] + strainVelocity[c] * dt, -STRAIN_LIMIT, STRAIN_LIMIT);
          }
        }

        // World → local: the inverse of (I + strain), and the smallest singular
        // value of (I + strain) keeps the distance a lower bound.
        const a = 1 + strain[0];
        const b = strain[1];
        const d = 1 + strain[2];
        const det = a * d - b * b;
        const m00 = d / det;
        const m01 = -b / det;
        const m11 = a / det;
        const mean = (a + d) / 2;
        const spread = Math.hypot((a - d) / 2, b);
        const distScale = Math.max(0.2, mean - spread);

        const lagX = calm ? 0 : clamp(-vx * LAG_SECONDS, -LAG_LIMIT, LAG_LIMIT);
        const lagY = calm ? 0 : clamp(-vy * LAG_SECONDS, -LAG_LIMIT, LAG_LIMIT);

        const dark = options.isDark();
        const key = dark ? "dark" : "light";
        if (key !== fillKey) {
          fillKey = key;
          fill = pageBackground();
        }

        const [width, height] = output.size;
        const dpr = output.dpr;
        const cssW = width / dpr;
        const cssH = height / dpr;
        const cx = MARGIN + targetHw + lagX;
        const cy = MARGIN + targetHh + lagY;
        glass.set({
          params: {
            size: [cssW, cssH, elapsed, dpr],
            rect: [cx, cy, hw, hh],
            shape: [Math.min(box.corner, hw, hh), MARGIN + box.tail + lagX, 8.5, energy],
            m: [m00, m01, m01, m11],
            fill: [fill[0], fill[1], fill[2], dark ? 0.94 : 0.95],
            look: [distScale, dark ? 1 : 0, 0, 0],
          },
        });
        frame.pass(output, glass);
      } catch (error) {
        dispose();
        throw error;
      }
    });
  })().catch((error: unknown) => {
    dispose();
    throw error;
  });

  return {
    ready,
    dispose,
    /** Where the bubble's wrapper is translated to on the page, each pose frame. */
    move(x: number, y: number) {
      posX = x;
      posY = y;
      placed = true;
    },
  };
}

/** The page's `--background`, whatever colour space it is written in, as linear-ish sRGB 0..1. */
function pageBackground(): [number, number, number] {
  const fallback: [number, number, number] = [0.98, 0.98, 0.98];
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (!value) return fallback;
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const g = c.getContext("2d");
    if (!g) return fallback;
    g.fillStyle = value;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    return [r / 255, gg / 255, b / 255];
  } catch {
    return fallback;
  }
}
