const CACHE = 'aidan-v7-164';
const ASSETS = [
  '/',
  '/supabase.js',
  '/core.js',
  '/tasks.js',
  '/ui.js',
  '/program.js',
  '/nutrition.js',
  '/styles.css',
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

// Bildirime tıklayınca uygulamayı aç (varsa odakla, yoksa yeni pencere).
// Gün planı blok bildirimlerinde aksiyon da taşınır:
//   - Aksiyon butonuna basıldıysa e.action dolu gelir (Android / masaüstü Chrome)
//   - iOS PWA aksiyon butonu GÖSTERMEZ → bildirimin gövdesine tıklanır, e.action boş olur;
//     bu durumda uygulama açılıp o bloğun aksiyon sayfası gösterilir (act='open')
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const act = e.action || (d.blockId ? 'open' : '');
  let url = d.url || '/';
  if (d.blockId) url = '/?blk=' + encodeURIComponent(d.blockId) + '&act=' + encodeURIComponent(act);

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ('focus' in c) {
          // Uygulama zaten açıksa navigate yerine mesaj gönder (state kaybolmasın)
          if (d.blockId) { try { c.postMessage({ type: 'BLOCK_ACTION', blockId: d.blockId, action: act }); } catch (err) {} }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Background push (VAPID + Worker'dan gelir). iOS PWA: HER ZAMAN bir notification göstermeli, yoksa izin iptal olur.
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let title = '🔔 Aidan';
    let body = 'Yeni hatırlatma';
    let tag = 'aidan-push';
    let url = '/';
    let actions = undefined;
    let blockId = null;
    let parseErr = null;
    if (e.data) {
      try {
        const p = e.data.json();
        title = p.title || title;
        body = p.body || body;
        tag = p.tag || tag;
        url = (p.data && p.data.url) || url;
        blockId = (p.data && p.data.blockId) || null;
        // actions: max 2-3 buton gösterilir, desteklemeyen platformda sessizce yok sayılır
        if (Array.isArray(p.actions) && p.actions.length) actions = p.actions.slice(0, 3);
      } catch (err) {
        parseErr = err && err.message;
        try { const t = e.data.text(); if (t) body = t; } catch (e2) { parseErr = (parseErr || '') + ' / text: ' + (e2 && e2.message); }
      }
    }
    try {
      await self.registration.showNotification(title, {
        body,
        icon: '/icon.png',
        badge: '/icon.png',
        tag,
        renotify: true,
        actions,
        data: { url, blockId }
      });
    } catch (err) {
      // Minimum güvenli fallback — iOS izin iptalini önler
      try {
        await self.registration.showNotification('🔔 Aidan', {
          body: 'Push geldi (hata: ' + (err && err.message || 'bilinmiyor') + (parseErr ? ' | parse: ' + parseErr : '') + ')'
        });
      } catch (e3) {}
    }
  })());
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
