import { clock, effect, frameLoop, init, sampler, surface, texture, type Gpu, type Texture } from "vgpu";
import wallWgsl from "./wall.wgsl";

export interface WallRendererOptions {
  /** Read each frame: 1 in dark mode, 0 in light. */
  readonly isDark: () => boolean;
  /** Read each frame: the pointer in wall uv space, or null when it's elsewhere. */
  readonly pointer: () => readonly [number, number] | null;
  /** Read each frame: freeze the drift for people who asked for less motion. */
  readonly reducedMotion: () => boolean;
  /** Called (on a macrotask, outside the frame) after the drawing buffer resizes. */
  readonly onResize?: () => void;
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
  let wallEffect: ReturnType<typeof effect> | undefined;
  let mask: Texture | undefined;
  let maskTexel: [number, number] = [1, 1];
  // Seconds since the current mask arrived; drives the glass fade-in.
  let maskAge = -1;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mask?.destroy();
    mask = undefined;
    gpu?.dispose();
  };

  /** Uploads a 2D canvas as the glass mask (r: letters, g: blurred letters). */
  const uploadMask = (source: HTMLCanvasElement, fadeIn: boolean): boolean => {
    if (disposed || !gpu || !wallEffect) return false;
    const size: [number, number] = [Math.max(1, source.width), Math.max(1, source.height)];
    const next = texture(gpu, {
      kind: "2d",
      size,
      format: "rgba8unorm",
      // copyExternalImageToTexture needs RENDER_ATTACHMENT on the destination too.
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "headline-glass-mask",
    });
    try {
      gpu.device.gpu.queue.copyExternalImageToTexture({ source }, { texture: next.gpu }, size);
      wallEffect.set({ glass_mask: next });
    } catch (error) {
      next.destroy();
      throw error;
    }
    mask?.destroy();
    mask = next;
    maskTexel = [1 / size[0], 1 / size[1]];
    if (fadeIn && maskAge < 0) maskAge = 0;
    return true;
  };

  const ready = (async () => {
    const context = await init();
    if (disposed) {
      context.dispose();
      return;
    }
    gpu = context;
    const output = surface(context, canvas, { dpr: [1, 1.5] });
    // The mask is painted at the drawing buffer's size, so repaint when it changes.
    // Deferred: this callback runs inside vgpu's frame hook.
    output.onResize(() => {
      if (options.onResize) setTimeout(options.onResize, 0);
    });
    // Until the page sends the headline, the mask is one empty texel: no glass.
    const blank = document.createElement("canvas");
    blank.width = 1;
    blank.height = 1;
    // copyExternalImageToTexture refuses a canvas that has no rendering context.
    const blankCtx = blank.getContext("2d");
    if (blankCtx) {
      blankCtx.fillStyle = "#000";
      blankCtx.fillRect(0, 0, 1, 1);
    }
    const wall = effect(context, wallWgsl, {
      label: "concrete-wall",
      set: {
        glass_sampler: sampler(context, {
          minFilter: "linear",
          magFilter: "linear",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
        }),
      },
    });
    wallEffect = wall;
    uploadMask(blank, false);
    const time = clock(context);

    // The light's resting path is a slow figure of eight across the upper left,
    // where the window light falls. The pointer pulls it a little off that path
    // and it eases back when the pointer leaves.
    let light: [number, number] = [0.3, 0.3];
    let drift = 0;

    frameLoop(context, (frame) => {
      try {
        if (!options.reducedMotion()) drift += time.deltaTime;
        if (maskAge >= 0) maskAge += time.deltaTime;
        // Ease the glass in over about a second once the headline arrives.
        const reveal = maskAge < 0 ? 0 : options.reducedMotion() ? 1 : 1 - Math.pow(1 - Math.min(maskAge / 1.2, 1), 3);
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
            glass: [reveal, 0, maskTexel[0], maskTexel[1]],
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

  return {
    ready,
    dispose,
    /** Hands the renderer a new headline mask; the first one fades the glass in. */
    setGlassMask: (source: HTMLCanvasElement) => uploadMask(source, true),
    /** The drawing buffer's size, so the mask can be painted to match. */
    size: () => [canvas.width, canvas.height] as const,
  };
}
