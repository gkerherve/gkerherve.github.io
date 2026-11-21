// sw.js — the service worker that makes PlanetCraft an app.
//
// Two jobs, and deliberately no third:
//
// 1. OFFLINE AFTER THE FIRST VISIT. Everything the game fetches over GET on
//    its own origin is copied into one cache as it goes by, so the second
//    launch works on a train. There is no precache list to maintain because
//    this repo has no build step — the set of files IS whatever the game
//    actually asked for.
// 2. FRESH CODE WHEN THE SERVER HAS IT. Code and pages go NETWORK-FIRST:
//    online you always get what is on disk right now, which is what keeps
//    "restart the server and reload" true; the cache only answers when the
//    network cannot. Everything else (textures, icons, sounds) is served
//    cache-first and refreshed in the background, because a texture is the
//    same texture a thousand loads in a row.
//
// What it deliberately leaves alone: POSTs (saves, shelves), websockets (the
// multiplayer relay never passes through a service worker), and every
// LIVE-STATE GET the server answers from memory or disk that changes between
// calls — the worlds shelf, the session, the chief. A stale answer to any of
// those is a lie about somebody's game.
const CACHE = 'planetcraft-v1';

// paths whose answers must never come from a cache — live state, not assets
const LIVE = [/^\/worlds\//, /^\/session/, /^\/chief/, /^\/dump/,
  // the game's own AI: whether its engine is up and what is downloading
  /^\/api\//,
  /index\.json$/,
  // A creature is sent from KherveCAD again and again under one name while
  // it is being made, and cache-first showed the LAST one sent until the page
  // had been loaded twice. They are small and read once at start-up.
  /^\/creatures\//,
  // ...and a painted block the same way: saved over and over under one name
  // while it is being painted, and read back the moment it is saved
  /^\/blocks\//];
// network-first: the game itself, so a reload after a server update is real
const CODE = [/\.js$/, /\.html$/, /\/$/, /\.webmanifest$/];

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // THREE.JS RIDES ALONG. The one thing the game needs from another origin
  // is the pinned three@0.160.0 build — version-locked, so it is immutable
  // and cache-first is simply correct. Everything else cross-origin passes
  // through untouched.
  if (url.origin !== self.location.origin) {
    if (url.origin !== 'https://unpkg.com') return;
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const net = await fetch(req);
      if (net.ok) cache.put(req, net.clone());
      return net;
    })());
    return;
  }
  if (LIVE.some((p) => p.test(url.pathname))) return;

  const isCode = CODE.some((p) => p.test(url.pathname));
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isCode) {
      try {
        const net = await fetch(req);
        if (net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline, and never seen online');
      }
    }
    const hit = await cache.match(req);
    if (hit) {
      // refresh behind the answer, so assets track the repo eventually
      fetch(req).then((net) => {
        if (net.ok) cache.put(req, net.clone());
      }).catch(() => {});
      return hit;
    }
    const net = await fetch(req);
    if (net.ok) cache.put(req, net.clone());
    return net;
  })());
});
