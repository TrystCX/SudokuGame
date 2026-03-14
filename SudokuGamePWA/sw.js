/* eslint-disable no-restricted-globals */
const CACHE_NAME = "sudokugame-pwa-v1"
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./sw.js",
  "../SudokuGame/styles.css",
  "../SudokuGame/levels.js",
  "../SudokuGame/app.js",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(PRECACHE_URLS)
      await self.skipWaiting()
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(req)
      if (cached) return cached
      try {
        const res = await fetch(req)
        if (res && res.ok) cache.put(req, res.clone())
        return res
      } catch {
        const fallback = await cache.match("./")
        return fallback || new Response("Offline", { status: 503 })
      }
    })()
  )
})
