import { clock, effect, frameLoop, init, sampler, surface, texture, type Gpu, type Texture } from "vgpu";
import wallWgsl from "./wall.wgsl";
import type { Sky } from "./sky";
import { CITY_SIZE, CITY_VIEWS, windowRect } from "./scene";

export interface WallRendererOptions {
  /** Read each frame: 1 in dark mode, 0 in light. */
  readonly isDark: () => boolean;
  /** Read each frame: the pointer in wall uv space, or null when it's elsewhere. */
  readonly pointer: () => readonly [number, number] | null;
  /** Read each frame: freeze the drift for people who asked for less motion. */
  readonly reducedMotion: () => boolean;
  /** Read each frame: the sun and weather over the desk. */
  readonly sky: () => Sky;
  /** Read each frame: how far down the glass the roller shade's hem hangs, 0 to 1. */
  readonly blind: () => number;
  /** Cut the window into the wall and load the view through it. */
  readonly scene: boolean;
  /**
   * Called once if the GPU reports an error after `ready` (a pipeline that
   * fails to compile, a lost device). The renderer has already torn itself
   * down; the component should go back to the CSS wall.
   */
  readonly onFail?: (error: unknown) => void;
}

/**
 * The wall's render loop, in the same shape as the glass sculpture's: `init`,
 * a surface on the canvas, one effect, `frameLoop`. Failures reject `ready`
 * and tear down; the component keeps the CSS wall in that case.
 *
 * With `scene`, the four city views are fetched straight away, in parallel
 * with the GPU coming up, and uploaded into one array texture. `ready` waits
 * for them (up to `CITY_WAIT_MS`) so the wall is revealed with the view
 * already in the window rather than a plain sky that the photo then replaces;
 * if they are slower than that the window opens on the plain sky and the
 * view eases in when it lands.
 */
export function createWallRenderer(
  canvas: HTMLCanvasElement,
  options: WallRendererOptions,
) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let city: Texture | undefined;

  // Decoding the photos needs no GPU, so it starts before `init` rather than
  // after the first frame. The preload links in the page mean this is usually
  // a cache hit.
  const cityBitmaps = options.scene ? fetchCityBitmaps() : null;
  // A fetch that fails before the GPU chain below has attached its handler
  // would otherwise surface as an unhandled rejection.
  cityBitmaps?.catch(() => {});

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    city?.destroy();
    gpu?.dispose();
  };

  const ready = (async () => {
    const context = await init();
    if (disposed) {
      context.dispose();
      return;
    }
    gpu = context;
    // Pipeline and device errors arrive asynchronously, not as throws from
    // the frame loop, so without this a broken shader would leave a blank
    // canvas over the CSS wall for ever.
    context.onError((error) => {
      if (disposed) return;
      dispose();
      options.onFail?.(error);
    });
    const output = surface(context, canvas, { dpr: [1, 1.5] });

    // Inner pages never show the window, so they get a token texture rather
    // than megabytes of city they would never sample.
    city = texture(context, {
      kind: "2d-array",
      size: options.scene ? [CITY_SIZE[0], CITY_SIZE[1]] : [1, 1],
      layers: CITY_VIEWS.length,
      format: "rgba8unorm",
      // copyExternalImageToTexture needs the destination to be a render
      // attachment as well as a copy target.
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "city-views",
    });
    const wall = effect(context, wallWgsl, {
      label: "concrete-wall",
      set: {
        city,
        city_sampler: sampler(context, { magFilter: "linear", minFilter: "linear" }),
      },
    });
    const time = clock(context);

    // 0 until the views are on the GPU, then eased up to 1 over `CITY_FADE_S`
    // so the window never snaps from sky to photo.
    let cityLoaded = false;
    let cityBlend = 0;
    const cityLanded = cityBitmaps
      ? cityBitmaps
          .then((bitmaps) => {
            if (disposed || !city) {
              bitmaps.forEach((b) => b.close());
              return;
            }
            uploadCity(context, city, bitmaps);
            cityLoaded = true;
            performance.mark("concrete-wall:city-landed");
          })
          .catch((error: unknown) => {
            console.warn("City views could not load; the window keeps its plain sky", error);
          })
      : Promise.resolve();

    // The light's resting path is a slow figure of eight across the upper left,
    // where the window light falls. The pointer pulls it a little off that path
    // and it eases back when the pointer leaves.
    let light: [number, number] = [0.3, 0.3];
    let drift = 0;

    frameLoop(context, (frame) => {
      try {
        if (!options.reducedMotion()) drift += time.deltaTime;
        if (cityLoaded && cityBlend < 1) cityBlend = Math.min(1, cityBlend + time.deltaTime / CITY_FADE_S);
        const sky = options.sky();
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

        const [width, height] = output.size;
        const window = options.scene ? windowRect(width / Math.max(1, height), width / output.dpr) : null;

        wall.set({
          params: {
            resolution_time_dark: [width, height, drift, options.isDark() ? 1 : 0],
            light: [light[0], light[1], Math.cos(drift * 0.07), 0],
            sky: [sky.sunHeight, sky.sunProgress, sky.warmth, sky.night],
            weather: [sky.cloudCover, sky.rain, cityBlend, 0],
            window: window ? [window.x, window.y, window.hw, window.hh] : [0, 0, 0, 0],
            blind: [options.blind(), window ? 1 : 0, 0, 0],
          },
        });
        frame.pass(output, wall);
      } catch (error) {
        dispose();
        throw error;
      }
    });

    // The loop is running behind an invisible canvas; hold the reveal until
    // the view is in the window, or until waiting would be worse than the
    // plain sky.
    await Promise.race([cityLanded, new Promise((resolve) => setTimeout(resolve, CITY_WAIT_MS))]);
    // Views that arrived while hidden can show at once; only a late arrival
    // needs the fade.
    if (cityLoaded) cityBlend = 1;
    performance.mark("concrete-wall:reveal");
  })().catch((error: unknown) => {
    dispose();
    throw error;
  });

  return { ready, dispose };
}

/** How long `ready` waits for the views before revealing the wall without them. */
const CITY_WAIT_MS = 2500;
/** Seconds the view takes to ease into the window when it lands after the reveal. */
const CITY_FADE_S = 0.7;

/** Fetches and decodes the four views, in texture-layer order. */
function fetchCityBitmaps() {
  return Promise.all(
    CITY_VIEWS.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return createImageBitmap(await res.blob(), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
    }),
  );
}

/** Copies each decoded view into its layer of the array texture. */
function uploadCity(context: Gpu, target: Texture, bitmaps: ImageBitmap[]) {
  bitmaps.forEach((bitmap, layer) => {
    try {
      if (context.disposed) return;
      context.gpu.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: target.gpu, origin: [0, 0, layer] },
        [Math.min(bitmap.width, CITY_SIZE[0]), Math.min(bitmap.height, CITY_SIZE[1])],
      );
    } finally {
      bitmap.close();
    }
  });
}
