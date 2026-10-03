// Cael's service worker. Its only job is web push: show "answer ready" when a
// chat turn finishes while the app is in the background, and open Chat on tap.
// No fetch handler on purpose — caching is not what this is for.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
