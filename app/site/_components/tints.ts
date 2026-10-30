/**
 * The site's six warm card colours (`--tint-1..6` in globals.css, `.site-paper`),
 * as classes Tailwind can see. All at one lightness, so any run of them reads
 * as a set; hand them out in order so neighbouring cards never match.
 */
export const TINTS = [
  "bg-[var(--tint-1)]",
  "bg-[var(--tint-2)]",
  "bg-[var(--tint-3)]",
  "bg-[var(--tint-4)]",
  "bg-[var(--tint-5)]",
  "bg-[var(--tint-6)]",
] as const;
