const CACHE = 'aidan-v7-6';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.png',
  '/icon-maskable.png',
  '/icon.svg',
  '/icon-maskable.svg'
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

// Bildirime tıklayınca uygulamayı aç (varsa odakla, yoksa yeni pencere)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Background push (ileride VAPID + Worker ile devreye girecek)
self.addEventListener('push', e => {
  let payload = { title: '🔔 Aidan', body: 'Yeni hatırlatma' };
  try { if (e.data) payload = e.data.json(); } catch (err) { try { payload.body = e.data.text(); } catch (e2) {} }
  e.waitUntil(
    self.registration.showNotification(payload.title || '🔔 Aidan', {
      body: payload.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: payload.tag || 'aidan-push',
      data: payload.data || { url: '/' }
    })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
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
