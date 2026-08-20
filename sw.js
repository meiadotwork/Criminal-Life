/* CRIMINAL TERMINAL service worker — network-first with cache fallback,
   so updates flow normally but the game boots fully offline once visited. */
/* Bumped on every release so a new deploy purges the old one automatically — the activate
   handler below deletes any cache whose name isn't this, so nobody is left on a stale build. */
const CACHE = "ct-v35.7";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
