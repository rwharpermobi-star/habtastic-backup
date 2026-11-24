/* HabTastic Service Worker — Web Push handler */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'HabTastic', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'HabTastic ⚡';
  const options = {
    body: data.body || '',
    icon: data.icon || '/app-icon-512.png',
    badge: data.badge || '/app-icon-512.png',
    tag: data.tag || 'habtastic',
    renotify: !!data.renotify,
    data: { url: data.url || '/', habitId: data.habitId || null },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
