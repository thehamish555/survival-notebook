// The Survival Notebook service worker: lets the site install as an app, open offline (pages and scripts come from the cache;
// notebook data comes from the read-only copy the page keeps), and show push notifications.
const CACHE = 'sn-v3'

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/account']).catch(() => {}))); self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) })

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return   // API calls always go to the network
  if (req.mode === 'navigate') {   // pages: fresh when online, the last copy when not (any notebook falls back to the app shell)
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return r })
      .catch(() => caches.match(req).then(r => r || caches.match('/'))))
    return
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/mc/') || url.pathname.startsWith('/brand/')) {   // versioned scripts and icons: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return r })))
  }
})

self.addEventListener('push', e => {
  let m = {}
  try { m = e.data ? e.data.json() : {} } catch { m = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(m.title || 'The Survival Notebook', { body: m.body || '', icon: '/brand/icon-128.png', badge: '/brand/badge-96.png', data: { url: m.url || '/' } }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.split('#')[0] === url.split('#')[0])
    if (open) return open.navigate(url).then(c => (c || open).focus())
    return self.clients.openWindow(url)
  }))
})
