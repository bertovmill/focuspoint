import type { CSSProperties } from "react";
import { BOOK_SPOT } from "./scene";

const MAKERSLOUNGE_URL = "https://makerslounge.ca";

/** The book's size inside its box, in container widths: spine length, depth front to back, thickness. */
const W = 80;
const D = 52;
const T = 10;

/** The Makerslounge mark, painted in whatever colour the element's background is. */
const mark = {
  maskImage: "url(/site-art/logo-makerslounge-mark-blue.svg)",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
} as CSSProperties;

const face = (width: number, height: number, transform: string): CSSProperties => ({
  position: "absolute",
  left: `${-width / 2}cqw`,
  top: `${-height / 2}cqw`,
  width: `${width}cqw`,
  height: `${height}cqw`,
  transform,
  backfaceVisibility: "hidden",
});

/** A fine linen weave over the book cloth, so it reads as cloth rather than a flat fill. */
const weave =
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 0.35cqw, rgba(255,255,255,0) 0.35cqw 0.7cqw), repeating-linear-gradient(90deg, rgba(20,30,45,0.06) 0 0.35cqw, rgba(20,30,45,0) 0.35cqw 0.7cqw)";

/** Page edges, inset between the two boards, in the shade of the cover. */
const pages: CSSProperties = {
  background: `linear-gradient(to bottom, #44688f 0 16%, transparent 16% 84%, #3a5c81 84%), repeating-linear-gradient(to bottom, #ece3d0 0 0.5cqw, #d9ccb2 0.5cqw 0.7cqw)`,
  filter: "brightness(0.82)",
};

/**
 * A Makerslounge hardcover lying on the desk, spine to the room, that opens
 * makerslounge.ca. Drawn in CSS 3D inside a size container, so it scales
 * with the desk. Dusty blue book cloth rather than the bright brand
 * gradient, lit from the upper left like the photo, and dimmed with the
 * desk's light, so it sits among the photographed things. Lifts a little
 * and names itself on hover.
 * Laid out with the same `--desk-*` properties as the plant.
 */
export function DeskBook({ light }: { light: CSSProperties }) {
  return (
    <a
      href={MAKERSLOUNGE_URL}
      target="_blank"
      rel="noopener"
      // The whole desk layer is aria-hidden decoration; Makerslounge is linked properly in the Work section.
      tabIndex={-1}
      draggable={false}
      // Phones crop the desk's left end off screen (it is 110vw wide there), so the book shows from sm up.
      className="group pointer-events-auto absolute hidden sm:block [--desk-dim:1] [--desk-shadow:rgba(35,28,20,0.4)] dark:[--desk-dim:0.72] dark:[--desk-shadow:rgba(0,0,0,0.6)]"
      style={{
        right: `calc(2vw + var(--desk-w) * ${(1 - BOOK_SPOT.x - BOOK_SPOT.width / 2).toFixed(4)})`,
        bottom: `calc(var(--desk-w) * var(--desk-ratio) * (${(1 - BOOK_SPOT.y).toFixed(4)} - var(--desk-sink)))`,
        width: `calc(var(--desk-w) * ${BOOK_SPOT.width})`,
        ...light,
      }}
    >
      <div className="relative aspect-[100/48]" style={{ containerType: "inline-size" }}>
        {/* Its shadow on the oak, which stays put when the book lifts: tight under it, soft to the right, away from the window. */}
        <div className="absolute bottom-[4%] left-[11%] right-[7%] h-[16%] rounded-[40%] bg-[var(--desk-shadow)] blur-[2px] transition-opacity duration-300 group-hover:opacity-50" />
        <div className="absolute bottom-[1%] left-[16%] right-[0%] h-[22%] rounded-[50%] bg-[var(--desk-shadow)] opacity-50 blur-[6px]" />
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out group-hover:-translate-y-[5%]"
          style={{
            perspective: "500cqw",
            filter: "brightness(calc(var(--desk-light) * var(--desk-dim))) saturate(var(--desk-tone))",
          }}
        >
          <div
            className="absolute left-1/2 top-[56%] size-0"
            style={{ transformStyle: "preserve-3d", transform: "rotateX(-20deg) rotateY(-13deg)" }}
          >
            {/* The cover, facing up, with the mark stamped small in off-white. */}
            <div
              className="flex items-center justify-center rounded-[0.8cqw]"
              style={{
                ...face(W, D, `rotateX(90deg) translateZ(${T / 2}cqw)`),
                background: `radial-gradient(110% 120% at 15% 10%, rgba(255,250,240,0.16), rgba(255,250,240,0) 60%), ${weave}, linear-gradient(160deg, #6a8fb5 0%, #557ca5 50%, #48709a 100%)`,
                boxShadow: "inset 0 0 0 0.5cqw rgba(30,45,65,0.12)",
              }}
            >
              <div className="h-[17cqw] w-[17cqw] bg-[#efe8da] opacity-85" style={mark} />
            </div>
            {/* The spine, toward the room. */}
            <div
              className="flex items-center gap-[3cqw] rounded-[0.8cqw] px-[5cqw]"
              style={{
                ...face(W, T, `translateZ(${D / 2}cqw)`),
                background: `${weave}, linear-gradient(to bottom, #5079a1, #42678e 55%, #385a7e)`,
                boxShadow: "inset 0 0.4cqw 0 rgba(255,250,240,0.14), inset 0 -0.6cqw 0 rgba(20,30,45,0.18)",
              }}
            >
              <div className="h-[5cqw] w-[5cqw] shrink-0 bg-[#efe8da] opacity-90" style={mark} />
              <div className="flex-1 text-center text-[4.8cqw] font-medium uppercase leading-none tracking-[0.3em] text-[#efe8da]/90">
                Makerslounge
              </div>
            </div>
            {/* The page edges at each end. */}
            <div style={{ ...face(D, T, `rotateY(-90deg) translateZ(${W / 2}cqw)`), ...pages }} />
            <div style={{ ...face(D, T, `rotateY(90deg) translateZ(${W / 2}cqw)`), ...pages }} />
          </div>
        </div>
        {/* Where it goes, on hover. */}
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-[2cqw] -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-white/90 px-[max(8px,5cqw)] py-[max(3px,2cqw)] text-[max(11px,7cqw)] font-medium text-neutral-800 opacity-0 shadow-sm transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          makerslounge.ca ↗
        </div>
      </div>
    </a>
  );
}
