import type { CSSProperties } from "react";
import { BOOK_SPOT } from "./scene";

const MAKERSLOUNGE_URL = "https://makerslounge.ca";

/** The book's size inside its box, in container widths: spine length, depth front to back, thickness. */
const W = 80;
const D = 54;
const T = 11;

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

/** Page edges, inset between the two boards. */
const pages: CSSProperties = {
  background:
    "linear-gradient(to bottom, #1a5fb8 0 14%, transparent 14% 86%, #1a5fb8 86%), repeating-linear-gradient(to bottom, #f4ecdc 0 0.6cqw, #e3d7c0 0.6cqw 0.8cqw)",
};

/**
 * A Makerslounge hardcover lying on the desk, spine to the room, that opens
 * makerslounge.ca. Drawn in CSS 3D inside a size container, so it scales
 * with the desk; lit like the desk; lifts a little and names itself on hover.
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
      className="group pointer-events-auto absolute block [--desk-dim:1] [--desk-shadow:rgba(35,28,20,0.4)] dark:[--desk-dim:0.72] dark:[--desk-shadow:rgba(0,0,0,0.6)]"
      style={{
        right: `calc(2vw + var(--desk-w) * ${(1 - BOOK_SPOT.x - BOOK_SPOT.width / 2).toFixed(4)})`,
        bottom: `calc(var(--desk-w) * var(--desk-ratio) * (${(1 - BOOK_SPOT.y).toFixed(4)} - var(--desk-sink)))`,
        width: `calc(var(--desk-w) * ${BOOK_SPOT.width})`,
        ...light,
      }}
    >
      <div className="relative aspect-[100/48]" style={{ containerType: "inline-size" }}>
        {/* Its shadow on the oak, which stays put when the book lifts. */}
        <div
          className="absolute left-[8%] right-[6%] bottom-[2%] h-[26%] rounded-[50%] bg-[var(--desk-shadow)] blur-[3px] transition-opacity duration-300 group-hover:opacity-60"
          style={{ transform: "translateX(4%)" }}
        />
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out group-hover:-translate-y-[7%]"
          style={{
            perspective: "500cqw",
            filter: "brightness(calc(var(--desk-light) * var(--desk-dim))) saturate(var(--desk-tone))",
          }}
        >
          <div
            className="absolute left-1/2 top-[56%] size-0"
            style={{ transformStyle: "preserve-3d", transform: "rotateX(-21deg) rotateY(-9deg) rotateZ(0.5deg)" }}
          >
            {/* The cover, facing up: the mark and the name, foreshortened like the notebook's. */}
            <div
              className="flex flex-col items-center justify-center gap-[3cqw] rounded-[1cqw]"
              style={{
                ...face(W, D, `rotateX(90deg) translateZ(${T / 2}cqw)`),
                background:
                  "radial-gradient(120% 90% at 25% 15%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%), linear-gradient(135deg, #6ac4f7 0%, #3a9ff3 45%, #1a7de8 100%)",
                boxShadow: "inset 0 0 0 0.6cqw rgba(255,255,255,0.12)",
              }}
            >
              <div className="h-[22cqw] w-[22cqw] bg-white" style={mark} />
              <div className="text-[5.4cqw] font-semibold uppercase leading-none tracking-[0.18em] text-white">
                Makerslounge
              </div>
            </div>
            {/* The spine, toward the room. */}
            <div
              className="flex items-center gap-[3cqw] rounded-[0.8cqw] px-[5cqw]"
              style={{
                ...face(W, T, `translateZ(${D / 2}cqw)`),
                background: "linear-gradient(to bottom, #2b8ff0, #1a6fd0 55%, #155cb0)",
                boxShadow: "inset 0 0.5cqw 0 rgba(255,255,255,0.18)",
              }}
            >
              <div className="h-[6cqw] w-[6cqw] shrink-0 bg-white" style={mark} />
              <div className="flex-1 text-center text-[5.6cqw] font-semibold uppercase leading-none tracking-[0.22em] text-white">
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
