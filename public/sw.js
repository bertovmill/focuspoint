// Cael's service worker. Two jobs:
//
// 1. Web push: show "answer ready" when a chat turn finishes while the app is in
//    the background, and open Chat on tap.
// 2. Keep the app's script and style files on the phone. iOS drops a home-screen
//    app's HTTP cache freely, so most launches downloaded ~1.8 MB of JavaScript
//    again before anything showed (Berto, 2026-10-16: "5 or 10 seconds every
//    time"). Only files that can never change are kept: /_next/static/ names are
//    content-hashed, so a deploy adds new names instead of changing old ones.
//    Pages and /api data always come from the network, so nothing shown is stale.

const STATIC_CACHE = "cael-static-v1";
// Clerk's loader script. Not hashed, so it's served from the cache and refreshed
// in the background for next time.
const CLERK_SCRIPT = /^https:\/\/clerk\.bertomill\.com\/npm\//;
// Enough for a few deploys' worth of chunks; older ones are dropped oldest first.
const MAX_STATIC_ENTRIES = 400;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("cael-") && n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await trimStatic();
      await self.clients.claim();
    })(),
  ),
);

async function trimStatic() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Dev servers reuse chunk names between edits; caching them would pin old code.
  if (self.location.hostname === "localhost") return;

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (CLERK_SCRIPT.test(request.url)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      // Looking at Cael already? Then the answer is on screen. iOS still requires
      // every push to show something, so this only skips on browsers that allow it.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const looking = windows.some((c) => c.visibilityState === "visible" && c.focused);
      if (looking && !/iPhone|iPad/.test(self.navigator.userAgent)) return;
      await self.registration.showNotification(payload.title || "Cael", {
        body: payload.body || "Your answer is ready.",
        icon: "/apple-icon.png",
        badge: "/apple-icon.png",
        tag: payload.tag || "cael-answer",
        data: { url: payload.url || "/chat" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
