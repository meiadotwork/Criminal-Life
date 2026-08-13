/* BECO service worker — network-first with cache fallback, so updates flow
   normally but the game boots fully offline once visited. Same shape as the
   CRIMINAL TERMINAL worker one directory up, with its own cache name so the
   two never evict each other. */
const CACHE = "beco-v1";
const CORE = [
  "./", "./index.html", "./game.js", "./manifest.webmanifest",
  "./assets/player.png", "./assets/player.json",
  "./assets/police.png", "./assets/police.json",
  "./assets/fx.png", "./assets/fx.json",
  "./assets/buildings.webp", "./assets/buildings.json",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(m => m || caches.match("./index.html"))
    )
  );
});
