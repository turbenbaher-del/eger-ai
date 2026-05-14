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

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '🎣 Егерь ИИ';
  const body  = payload.notification?.body  || '';
  const url   = payload.data?.url || 'https://turbenbaher-del.github.io/eger-ai/';
  self.registration.showNotification(title, {
    body,
    icon: 'https://turbenbaher-del.github.io/eger-ai/favicon.ico',
    tag: 'eger-news',
    renotify: true,
    data: { url }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://turbenbaher-del.github.io/eger-ai/';
  event.waitUntil(clients.openWindow(url));
});
