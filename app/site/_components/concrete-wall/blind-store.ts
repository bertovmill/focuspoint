/**
 * The roller shade's state, shared by the three things that care about it: the
 * shader (which draws the shade when the GPU wall is up), the CSS stand-in
 * (when it isn't) and the drag handles in `desk-scene.tsx`. A tiny external
 * store, so the shader can read it every frame without React in the way.
 */

/** Where the shade's hem rests to begin with: a fraction of the glass's height, 0 rolled up, 1 closed. */
export const BLIND_REST = 0.3;

let lower = BLIND_REST;
let shaderDraws = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const blindStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** How far down the glass the hem hangs, 0 to 1. */
  getLower: () => lower,
  setLower(next: number) {
    const clamped = Math.min(1, Math.max(0, next));
    if (clamped === lower) return;
    lower = clamped;
    emit();
  },
  /** True while the WebGPU wall is on screen and drawing the shade itself. */
  getShaderDraws: () => shaderDraws,
  setShaderDraws(next: boolean) {
    if (next === shaderDraws) return;
    shaderDraws = next;
    emit();
  },
};
