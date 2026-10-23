import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { withWorkflow } from "workflow/next";

// Next 16 allows one dev server per build directory — a second `next dev` in
// this folder is refused because both would fight over `.next` and its lock.
// Overriding the build dir gives a second instance its own, so two dev servers
// can run side by side (see the `dev:3001` script).
// vgpu's loader lets the glass sculpture keep its shaders in `.wgsl` files
// (app/site/_components/glass-sculpture). Turbopack reads the `turbopack` key,
// webpack the hook, so both dev and a non-Turbopack build resolve the imports.
const WGSL_LOADER = "@vgpu/wgsl/loader-webpack";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: {
    rules: {
      "*.wgsl": { loaders: [WGSL_LOADER], as: "*.js" },
    },
  },
  webpack(config) {
    config.module ??= {};
    config.module.rules ??= [];
    config.module.rules.push({ test: /\.wgsl$/, loader: WGSL_LOADER, options: { minify: true } });
    return config;
  },
  images: {
    // Nutrition photography lives in Vercel Blob. The generated files are
    // 1024px PNGs of ~1.5 MB and they render at 24–44px (thumbnails) or a card
    // width, so they go through the image optimizer rather than down the wire
    // whole.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Medium post covers on the writing index.
      { protocol: "https", hostname: "cdn-images-1.medium.com" },
      { protocol: "https", hostname: "miro.medium.com" },
      // Images stored in the database since 2026-10-19 (app/media).
      { protocol: "https", hostname: "bertomill.com", pathname: "/media/**" },
    ],
  },
};

// withWorkflow compiles "use workflow"/"use step" (scheduled tweets, workflows/).
export default withEve(withWorkflow(nextConfig));
