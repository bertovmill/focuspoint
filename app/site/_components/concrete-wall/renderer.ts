import { clock, effect, frameLoop, init, surface, type Gpu } from "vgpu";
import wallWgsl from "./wall.wgsl";

export interface WallRendererOptions {
  /** Read each frame: 1 in dark mode, 0 in light. */
  readonly isDark: () => boolean;
  /** Read each frame: the pointer in wall uv space, or null when it's elsewhere. */
  readonly pointer: () => readonly [number, number] | null;
  /** Read each frame: freeze the drift for people who asked for less motion. */
  readonly reducedMotion: () => boolean;
}

/**
 * The wall's render loop, in the same shape as the glass sculpture's: `init`,
 * a surface on the canvas, one effect, `frameLoop`. Failures reject `ready`
 * and tear down; the component keeps the CSS wall in that case.
 */
export function createWallRenderer(
  canvas: HTMLCanvasElement,
  options: WallRendererOptions,
) {
  let disposed = false;
  let gpu: Gpu | undefined;

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
    const output = surface(context, canvas, { dpr: [1, 1.5] });
    const wall = effect(context, wallWgsl, { label: "concrete-wall" });
    const time = clock(context);

    // The light's resting path is a slow figure of eight across the upper left,
    // where the window light falls. The pointer pulls it a little off that path
    // and it eases back when the pointer leaves.
    let light: [number, number] = [0.3, 0.3];
    let drift = 0;

    frameLoop(context, (frame) => {
      try {
        if (!options.reducedMotion()) drift += time.deltaTime;
        const restX = 0.3 + Math.sin(drift * 0.11) * 0.16;
        const restY = 0.3 + Math.sin(drift * 0.17 + 1.3) * 0.12;
        const pointer = options.pointer();
        const targetX = pointer ? restX * 0.55 + pointer[0] * 0.45 : restX;
        const targetY = pointer ? restY * 0.55 + pointer[1] * 0.45 : restY;
        const ease = 1 - Math.exp(-time.deltaTime * 1.6);
        light = [
          light[0] + (targetX - light[0]) * ease,
          light[1] + (targetY - light[1]) * ease,
        ];

        wall.set({
          params: {
            resolution_time_dark: [
              output.size[0],
              output.size[1],
              drift,
              options.isDark() ? 1 : 0,
            ],
            light: [light[0], light[1], Math.cos(drift * 0.07), 0],
          },
        });
        frame.pass(output, wall);
      } catch (error) {
        dispose();
        throw error;
      }
    });
  })().catch((error: unknown) => {
    dispose();
    throw error;
  });

  return { ready, dispose };
}
