/*
 * Special Care 360 service worker.
 *
 * Deliberately minimal: it makes the app installable and shows an offline
 * page when there is no connection. It never caches care data — Firestore,
 * the FastAPI backend, signed file links and authenticated pages always go to
 * the network — so a shared or lost device does not hold a copy of a child's
 * records, and nobody is shown a stale journal or alert as if it were current.
 *
 * Only content-hashed build assets (/_next/static/*), icons and the offline
 * page are cached.
 */
const VERSION = "care360-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks a waiting worker to take over when the user accepts an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Page navigations: always the network; the offline page only when it fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL, { ignoreSearch: true })),
    );
    return;
  }

  // Immutable build assets: cache-first. Everything else (Firestore, the API,
  // Firebase Storage links, auth) is left to the browser untouched.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
