// Borsa — service worker
// Strateji Aidan'la ayni: HTML/manifest/SW network-first (her zaman taze),
// statik varliklar cache-first. Push burada YOK — borsa alarmlarini Aidan'in
// worker'i gonderiyor ve abonelik Aidan tarafinda tutuluyor.
const CACHE = 'borsa-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './shared.js',
  './stocks.js',
  './sync.js',
  './app.js',
  './supabase.js',
  './manifest.webmanifest',
  './icon.png',
  './icon-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;   // dis kaynaklar cache'siz

  const path = url.pathname;
  const isFreshAlways = e.request.destination === 'document'
    || path.endsWith('.html')
    || path.endsWith('.webmanifest')
    || path.endsWith('/')
    || path.endsWith('/sw.js');

  if (isFreshAlways) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
