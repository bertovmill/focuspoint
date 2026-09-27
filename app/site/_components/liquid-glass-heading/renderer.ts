// Adapted from the vgpu "TypeGPU Liquid Glass" example (renderer.ts). The
// example baked an analytic SDF of the TypeGPU logo into a fixed 1024² field,
// extracted its gradient and blurred that 16 times into a soft normal map, then
// drew light streams refracted through the logo every frame. This keeps that
// pipeline and lifecycle, with two changes for the site:
//
//  - the shape comes from a 2D canvas the component paints the heading's text
//    onto, uploaded as a texture; the field is that coverage softened by a few
//    blur passes rather than a true distance field;
//  - the field textures are the size of the canvas and are rebuilt whenever the
//    surface resizes (the heading reflows), so a bake can happen more than once.
//
// The shaders are hand-written WGSL ports of the example's TypeGPU functions:
// TypeGPU's `'use gpu'` bodies need its build plugin, which has no Turbopack
// support, and this project already loads `.wgsl` through vgpu's loader.
import {
  clock,
  effect,
  frameLoop,
  init,
  sampler,
  surface,
  target,
  texture,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from "vgpu";
import fieldBlurWgsl from "./field-blur.wgsl";
import gradientWgsl from "./gradient.wgsl";
import liquidGlassWgsl from "./liquid-glass.wgsl";

/** Blur passes that soften the raw text coverage into the field the rim and glow read. */
const FIELD_BLUR_PASSES = 4;
/** The example's 16 passes over the gradient, which is what makes the lensing broad and smooth. */
const GRADIENT_BLUR_PASSES = 16;
const FIELD_FORMAT: GPUTextureFormat = "rgba16float";

/**
 * Paints the heading onto a 2D context sized in CSS pixels (the renderer has
 * already applied the device pixel ratio). White on black; the red channel is
 * read as coverage.
 */
export type PaintText = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

interface Scene {
  readonly shader: ReturnType<typeof effect>;
  setTime(seconds: number): void;
  dispose(): void;
}

/**
 * Builds the field textures for one canvas size and runs the bake passes once.
 * Everything created here is destroyed by `dispose`, in reverse order, and on
 * any failure part-way through — the example's contract, kept.
 */
function createScene(gpu: Gpu, output: Surface, coverage: Texture): Scene {
  const owned: Target[] = [];
  const own = (created: Target) => {
    owned.push(created);
    return created;
  };
  const disposeOwned = () => {
    for (const resource of owned.splice(0).reverse()) destroyTarget(resource);
  };

  try {
    const size = output.size;
    const texel: [number, number] = [1 / size[0], 1 / size[1]];
    // The example blurred a 1024-wide field with texel-sized steps. Scaling the
    // step with the device pixel ratio keeps the softness the same in CSS pixels
    // on a retina screen, where the field is twice as dense.
    const step = output.dpr;

    const fieldA = own(target(gpu, { size, format: FIELD_FORMAT, label: "liquid-glass-field-a" }));
    const fieldB = own(target(gpu, { size, format: FIELD_FORMAT, label: "liquid-glass-field-b" }));
    const rawGradient = own(target(gpu, { size, format: FIELD_FORMAT, label: "liquid-glass-gradient" }));
    const blurA = own(target(gpu, { size, format: FIELD_FORMAT, label: "liquid-glass-blur-a" }));
    const blurB = own(target(gpu, { size, format: FIELD_FORMAT, label: "liquid-glass-blur-b" }));

    const linearSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    const blur = (source: Texture | Target, direction: [number, number], label: string) =>
      effect(gpu, fieldBlurWgsl, {
        label,
        set: {
          params: { direction, texel: [texel[0] * step, texel[1] * step] },
          source_texture: source,
          field_sampler: linearSampler,
        },
      });

    // 1. Coverage -> soft field. Ping-pong between fieldA and fieldB; the first
    //    horizontal pass reads the uploaded text texture.
    for (let i = 0; i < FIELD_BLUR_PASSES; i += 1) {
      blur(i === 0 ? coverage : fieldB, [1, 0], `liquid-glass-field-h-${i}`).draw(fieldA);
      blur(fieldA, [0, 1], `liquid-glass-field-v-${i}`).draw(fieldB);
    }

    // 2. Field -> gradient (normals), as the example.
    effect(gpu, gradientWgsl, {
      label: "liquid-glass-gradient",
      set: { source_texture: fieldB, field_sampler: linearSampler },
    }).draw(rawGradient);

    // 3. Gradient -> 16× blurred gradient, as the example.
    for (let i = 0; i < GRADIENT_BLUR_PASSES; i += 1) {
      blur(i === 0 ? rawGradient : blurB, [1, 0], `liquid-glass-blur-h-${i}`).draw(blurA);
      blur(blurA, [0, 1], `liquid-glass-blur-v-${i}`).draw(blurB);
    }

    const shader = effect(gpu, liquidGlassWgsl, {
      label: "liquid-glass-heading",
      set: {
        params: { time: 0, aspect: size[0] / size[1], padding: [0, 0] },
        coverage_texture: coverage,
        field_texture: fieldB,
        gradient_texture: blurB,
        field_sampler: linearSampler,
      },
    });

    return {
      shader,
      setTime: (seconds) =>
        shader.set({ params: { time: seconds, aspect: output.size[0] / output.size[1], padding: [0, 0] } }),
      dispose: disposeOwned,
    };
  } catch (error) {
    disposeOwned();
    throw error;
  }
}

function destroyTarget(value: Target | undefined): void {
  (value as { destroy?: () => void } | undefined)?.destroy?.();
}

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly paint: PaintText;
  /** Called after the first successful bake, once there is something to show. */
  readonly onFirstFrame?: () => void;
}

export function createRenderer({ canvas, paint, onFirstFrame }: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let scene: Scene | undefined;
  let coverage: Texture | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let bakeTimer: ReturnType<typeof setTimeout> | undefined;
  let shownFirstFrame = false;

  // Text is painted on a plain 2D canvas and copied into a GPU texture. Reused
  // across bakes; only its size changes.
  const scratch = document.createElement("canvas");

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (bakeTimer !== undefined) clearTimeout(bakeTimer);
    unsubscribeResize?.();
    scene?.dispose();
    scene = undefined;
    coverage?.destroy();
    coverage = undefined;
    // Last, as in the example: the gpu takes the surface, loops and caches with it.
    gpu?.dispose();
  };

  /** Repaints the text at the surface's current size and rebuilds the field. */
  const bake = () => {
    if (disposed || !gpu || !output) return;
    const [width, height] = output.size;
    if (width < 1 || height < 1) return;
    const dpr = output.dpr;

    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable for text raster");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, width / dpr, height / dpr);

    const previousScene = scene;
    const previousCoverage = coverage;
    scene = undefined;
    coverage = undefined;
    previousScene?.dispose();
    previousCoverage?.destroy();

    const nextCoverage = texture(gpu, {
      kind: "2d",
      size: [width, height],
      format: "rgba8unorm",
      // copyExternalImageToTexture requires RENDER_ATTACHMENT on the destination as well.
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "liquid-glass-text",
    });
    try {
      gpu.device.gpu.queue.copyExternalImageToTexture(
        { source: scratch },
        { texture: nextCoverage.gpu },
        [width, height],
      );
      scene = createScene(gpu, output, nextCoverage);
      coverage = nextCoverage;
    } catch (error) {
      nextCoverage.destroy();
      throw error;
    }
  };

  /**
   * Bakes on the next macrotask rather than right away: the surface's resize
   * callback runs inside vgpu's frame hook, and the bake draws its own passes,
   * which belong between frames. Several requests in one tick collapse to one.
   */
  const requestBake = () => {
    if (disposed || bakeTimer !== undefined) return;
    bakeTimer = setTimeout(() => {
      bakeTimer = undefined;
      try {
        bake();
      } catch (error) {
        dispose();
        console.warn("Liquid glass heading could not bake", error);
      }
    }, 0);
  };

  const ready = (async () => {
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    try {
      output = surface(gpu, canvas, { dpr: [1, 2], alphaMode: "premultiplied" });
      const timeline = clock(gpu);
      bake();
      unsubscribeResize = output.onResize(requestBake);

      frameLoop(gpu, (currentFrame) => {
        if (!scene) return;
        scene.setTime(timeline.time);
        currentFrame.pass(output!, scene.shader);
        if (!shownFirstFrame) {
          shownFirstFrame = true;
          onFirstFrame?.();
        }
      });
    } catch (error) {
      dispose();
      throw error;
    }
  })();

  return { ready, dispose, requestBake };
}
