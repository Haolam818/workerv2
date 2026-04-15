const CACHE_NAME = "worker-pwa-v2";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/sw.js",
  "/www/app.html",
  "/www/00-gallery-preview.html",
  "/www/01-login.html",
  "/www/02-worker-registration.html",
  "/www/03-record-detail.html",
  "/www/04-record-list.html",
  "/www/ipad-tech-app.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  if (!isSameOrigin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        const isCacheable =
          networkResponse &&
          networkResponse.status === 200 &&
          (requestUrl.pathname === "/" ||
            requestUrl.pathname.startsWith("/www/") ||
            requestUrl.pathname.startsWith("/assets/"));

        if (isCacheable) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }

        return networkResponse;
      });
    })
  );
});
