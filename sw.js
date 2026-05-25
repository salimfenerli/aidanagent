const CACHE = 'aidan-v4-1';
const ASSETS = [
  './',
  './asistan.html',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll({ type: 'window' }))
     .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', cache: CACHE })))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // ntfy.sh isteklerini ASLA cache'leme
  if (url.hostname === 'ntfy.sh') return;
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // dış kaynaklar cache'sız

  // HTML / manifest / SW için NETWORK-FIRST (her zaman taze)
  const path = url.pathname;
  const isFreshAlways = e.request.destination === 'document'
    || path.endsWith('.html')
    || path.endsWith('.webmanifest')
    || path === '/'
    || path === '/sw.js';

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

  // Statik asset'ler (icon, vs) için CACHE-FIRST
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
