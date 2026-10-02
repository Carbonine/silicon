// Scramjet service worker (scramjet-controller): it forwards proxied requests to the controller
// running in the page, which fetches them through the transport.
importScripts("/scram/controller.sw.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Lets the page ask for control after a hard refresh (which loads it uncontrolled).
self.addEventListener("message", (e) => { if (e.data === "claim") self.clients.claim(); });

self.addEventListener("fetch", (event) => {
  if ($scramjetController.shouldRoute(event)) event.respondWith($scramjetController.route(event));
});
