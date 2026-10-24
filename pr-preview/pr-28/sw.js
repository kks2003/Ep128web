// Ep128web service worker: offline use and installability.
// Network first (so an update shows up at once), the cache is the fallback.
// Entries are stored without the ?v= query.
const SCOPE = new URL(self.registration.scope);
const CACHE = 'ep128web:' + SCOPE.pathname;
const CORE = [
  './', 'index.html', 'style.css', 'ep128.js', 'ep128emu.js', 'ep128emu.wasm',
  'epfileio.rom', 'tvcfileio.rom', 'catalog.json', 'catalog/programs.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg',
  'diskmgr/types.js', 'diskmgr/cas_parser.js', 'diskmgr/fat_disk.js', 'diskmgr/upm_disk.js', 'diskmgr/zip_writer.js'
];

function cacheKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (u.pathname.endsWith('/index.html')) u.pathname = u.pathname.slice(0, -10);
  return u.href;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(async (f) => {
      try {
        const r = await fetch(new URL(f, SCOPE), { cache: 'reload' });
        if (r.ok) await c.put(cacheKey(r.url), r);
      } catch (err) { }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // own files only; PR previews below this scope have their own worker
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname) ||
      url.pathname.startsWith(SCOPE.pathname + 'pr-preview/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch(req);
      if (r.ok && r.status === 200) c.put(cacheKey(req.url), r.clone()).catch(() => { });
      return r;
    } catch (err) {
      const hit = await c.match(cacheKey(req.url)) || (req.mode === 'navigate' && await c.match(cacheKey(SCOPE.href)));
      if (hit) return hit;
      throw err;
    }
  })());
});
