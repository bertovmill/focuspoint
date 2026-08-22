import type { NextConfig } from "next";
import { withEve } from "eve/next";

// Next 16 allows one dev server per build directory — a second `next dev` in
// this folder is refused because both would fight over `.next` and its lock.
// Overriding the build dir gives a second instance its own, so two dev servers
// can run side by side (see the `dev:3001` script).
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    // Nutrition photography lives in Vercel Blob. The generated files are
    // 1024px PNGs of ~1.5 MB and they render at 24–44px (thumbnails) or a card
    // width, so they go through the image optimizer rather than down the wire
    // whole.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default withEve(nextConfig);
