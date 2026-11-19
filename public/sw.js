const CACHE_VERSION = 'thalos-shell-v2'
// offline: true - service worker offline fallback handling
const OFFLINE_URL = '/offline.html'
const SHELL_ASSETS = [OFFLINE_URL, '/thalos-icon-192.png', '/thalos-icon-512.png', '/thalos-icon-180.png', '/thalos-app-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('thalos-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_VERSION)
      const shell = await cache.match(OFFLINE_URL)
      return shell || Response.error()
    }))
    return
  }

  const isStaticAsset = url.pathname.startsWith('/_next/static/') || ['/thalos-icon-192.png', '/thalos-icon-512.png', '/thalos-icon-180.png', '/thalos-app-icon.svg'].includes(url.pathname)
  if (!isStaticAsset) return

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request)
      try {
        const response = await fetch(request, { cache: 'no-cache' })
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
        return response
      } catch {
        return cached || Response.error()
      }
    }),
  )
})
