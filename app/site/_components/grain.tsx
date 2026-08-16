"use client";

import { PaperTexture, StaticRadialGradient } from "@paper-design/shaders-react";

/**
 * The texture layer that keeps bertomill.com from reading as a flat template.
 *
 * Every shader here runs at `speed: 0` — it renders one frame and holds, like
 * grain on a printed photograph. No animation loop, no ongoing GPU cost. They
 * are decoration only, so each is `aria-hidden` and untouchable by the pointer.
 */

const FILL: React.CSSProperties = { width: "100%", height: "100%" };

/**
 * Fine film grain across the whole viewport.
 *
 * Blended rather than laid on top: `overlay` in light and `soft-light` in dark
 * modulates the colour underneath instead of dusting grey over it, which is the
 * difference between grain and dirt. Fixed, so it stays still while the page
 * scrolls under it — grain that scrolls reads as a texture *image*, not as film.
 */
export function PageGrain() {
  return (
    <div
      aria-hidden
      // Numeric opacity scale on purpose: Tailwind doesn't emit `opacity-[0.05]`,
      // so that form leaves the layer at full strength.
      className="pointer-events-none fixed inset-0 z-50 opacity-5 mix-blend-overlay dark:opacity-10 dark:mix-blend-soft-light"
    >
      <PaperTexture
        style={FILL}
        colorFront="#8a8a8a"
        colorBack="#ffffff"
        scale={0.35}
        contrast={0.5}
        roughness={0.85}
        // Flat grain, not stationery: the paper cues (fibres, creases, folds,
        // waterdrops) are exactly what would make a full-page layer look fake.
        fiber={0}
        fiberSize={0}
        crumples={0}
        crumpleSize={0}
        folds={0}
        foldCount={0}
        drops={0}
        fade={0}
        seed={11}
      />
    </div>
  );
}

/**
 * Organic paper grain for a single surface, replacing the dot grid that used to
 * sit on the hero card. Here the fibres and faint creases are the point — up
 * close on one card they read as pressed paper, the tell that a person chose
 * the material rather than a generator.
 */
export function SurfaceTexture({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <PaperTexture
        style={FILL}
        colorFront="#7d7d7d"
        colorBack="#ffffff"
        scale={0.5}
        contrast={0.35}
        roughness={0.55}
        fiber={0.4}
        fiberSize={0.18}
        crumples={0.22}
        crumpleSize={0.4}
        folds={0.1}
        foldCount={2}
        drops={0}
        fade={0}
        seed={3}
      />
    </div>
  );
}

/**
 * A soft warm bloom sitting behind the hero card, so the card reads as lit from
 * somewhere rather than filled with a colour.
 *
 * This is a shader rather than a CSS radial-gradient for one reason: a gradient
 * this large and this faint bands badly on 8-bit displays, and `grainMixer` /
 * `grainOverlay` dither it away. That dithering is the whole job.
 */
export function AmbientBloom({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <StaticRadialGradient
        style={FILL}
        colorBack="#00000000"
        colors={["#ff8a4c", "#ffb98a", "#ffe3d0"]}
        // Broad and slow-falling, spread over the whole surface rather than
        // concentrated. A tight radius reads as a lens flare on a dark card; the
        // job here is a lift you notice only if you look for it, so the gradient
        // is wider than its container and the container masks it to one corner.
        radius={1.6}
        focalDistance={0.2}
        falloff={0.15}
        mixing={0.5}
        grainMixer={0.4}
        grainOverlay={0.25}
      />
    </div>
  );
}
