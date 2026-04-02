// Praxisy Service Worker — Cache intelligente + offline support
const CACHE = 'praxisy-v4';
const STATIC = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Install — precache assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch — smart cache strategy
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache API calls (Claude, Supabase)
  if (url.pathname.startsWith('/api/') ||
      url.hostname.includes('anthropic') ||
      url.hostname.includes('supabase')) {
    return;
  }

  // Google Fonts — cache first
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // HTML + JS — network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Background sync for offline segnalazioni
self.addEventListener('sync', e => {
  if (e.tag === 'sync-segnalazioni') {
    e.waitUntil(syncOfflineSegnalazioni());
  }
});

async function syncOfflineSegnalazioni() {
  const db = await openDB();
  const pending = await db.getAll('offline-queue');
  for (const item of pending) {
    try {
      await fetch(item.url, { method: item.method, body: item.body, headers: item.headers });
      await db.delete('offline-queue', item.id);
    } catch (e) {
      console.log('Sync failed for item', item.id);
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('praxisy-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('offline-queue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}
