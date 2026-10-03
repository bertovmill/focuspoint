import type { MetadataRoute } from "next";

/**
 * Makes the home-screen icon a real web app: opens standalone (no Safari bar),
 * and — the reason it exists (2026-10-03) — lets iOS 16.4+ deliver web push.
 * iOS reads this when the site is added to the home screen, so an icon added
 * before it existed must be removed and re-added once.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cael",
    short_name: "Cael",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
