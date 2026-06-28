const CACHE_NAME = "spider-league-sdi-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./core.js",
  "./methodology.html",
  "./coverage.html",
  "./coverage.js",
  "./diagnostics.html",
  "./diagnostics.js",
  "./league.html",
  "./league.js",
  "./league-core.js",
  "./admin.html",
  "./admin.js",
  "./firebase-client.js",
  "./firebase-config.js",
  "./firebase-setup.html",
  "./manifest.webmanifest",
  "./data/manual-aliases.json",
  "./data/sdi-records.json",
  "./data/taxon-snapshots.json",
  "./data/research-queue.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isApi = ["api.inaturalist.org", "api.gbif.org"].includes(url.hostname);
  const isFirebaseConfig = url.origin === self.location.origin && url.pathname.endsWith("/firebase-config.js");

  if (isFirebaseConfig) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isApi) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
