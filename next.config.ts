import type { NextConfig } from "next";
import { withEve } from "eve/next";

// Next 16 allows one dev server per build directory — a second `next dev` in
// this folder is refused because both would fight over `.next` and its lock.
// Overriding the build dir gives a second instance its own, so two dev servers
// can run side by side (see the `dev:3001` script).
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default withEve(nextConfig);
