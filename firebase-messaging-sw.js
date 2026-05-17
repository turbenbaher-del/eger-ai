importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDAGn8KaXwBMIkNEJ7NdjBS6lEV2JX_C-0",
  authDomain: "eger-ai.firebaseapp.com",
  projectId: "eger-ai",
  storageBucket: "eger-ai.firebasestorage.app",
  messagingSenderId: "785362609990",
  appId: "1:785362609990:web:203c5e3edf010e732ae747"
});

const messaging = firebase.messaging();
const CACHE = 'eger-v6';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.hostname === self.location.hostname && e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '🎣 Егерь ИИ';
  const body  = payload.notification?.body  || '';
  const url   = payload.data?.url || 'https://eger-ai.app/';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-48.png',
    tag: 'eger-news',
    renotify: true,
    data: { url }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://eger-ai.app/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url === url && 'focus' in c) return c.focus(); }
      return clients.openWindow(url);
    })
  );
});
