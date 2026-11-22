/*
 * BandLeaderHQ service worker (audit §12 #1).
 *
 * The previous worker served index.html cache-first under a cache name that never changed,
 * so after a deploy returning users kept the old build forever, and it never cached the CDN
 * libraries, so "offline" was a blank page anyway. Strategy now:
 *
 *   - Same-origin GETs (index.html, the three text/babel companions, manifest, assets):
 *     NETWORK-FIRST. A fresh copy wins whenever the network answers; the cached copy is
 *     the fallback offline or when the network stalls past NETWORK_TIMEOUT_MS (a gig wifi).
 *   - Pinned CDN files (exact versions + SRI, see index.html) and Google Fonts:
 *     CACHE-FIRST. They are immutable, so a cached copy is always correct. They are
 *     precached on install so the second visit works offline, not just the third.
 *   - Everything else (Gmail API, Google sign-in, Overpass, YouTube, ...): not touched.
 *
 * SHELL_VERSION is bumped per release; activate deletes every other bandleaderhq cache.
 * Network-first means a forgotten bump no longer strands users — it only leaves an old
 * fallback copy around until the next successful fetch replaces it.
 */
const SHELL_VERSION = '2026-11-22';
const SHELL_CACHE = `bandleaderhq-shell-${SHELL_VERSION}`;
const CDN_CACHE = 'bandleaderhq-cdn-v1';            // immutable, version-pinned URLs only
const NETWORK_TIMEOUT_MS = 6000;

const SHELL_ASSETS = [
  './',
  './index.html',
  './featureHelp.js',
  './InfoModal.jsx',
  './InfoTrigger.jsx',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-512.png',
  './assets/bandleaderhq-logo.jpg',
  './assets/bandleaderhq-hero.jpg',
  './assets/workshop-playlist-qr.png',
];

// Must list every <script src> in index.html's <head> (test/supply-chain.test.js checks it)
// plus the PDF.js worker.
const CDN_PRECACHE = [
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.7/babel.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/mobile-drag-drop@3.0.0-rc.0/index.min.js',
  'https://cdn.jsdelivr.net/npm/mobile-drag-drop@3.0.0-rc.0/scroll-behaviour.min.js',
];

// A CDN URL is cacheable only when it names an exact version (pkg@1.2.3), so a floating
// tag can never be frozen in the cache. Fonts are versioned by Google and safe to keep.
const PINNED_NPM_RE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/)?[^/@]+@\d+\.\d+\.\d+[^/]*\//;
const isCacheableCdn = (url) =>
  PINNED_NPM_RE.test(url) ||
  url.startsWith('https://fonts.googleapis.com/') ||
  url.startsWith('https://fonts.gstatic.com/');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // Best-effort per file: one missing asset must not abort the whole install.
    await Promise.all(SHELL_ASSETS.map((u) => shell.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_PRECACHE.map(async (u) => {
      if (await cdn.match(u)) return;
      try {
        const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
        if (res.ok) await cdn.put(u, res);
      } catch (e) { /* offline during install — cached on first real use instead */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CDN_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' })
      || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (cached) return cached;
    return network;   // nothing cached: wait for the slow network rather than fail
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok && (res.type === 'cors' || res.type === 'basic')) cache.put(request.url, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (isCacheableCdn(request.url)) {
    event.respondWith(cacheFirst(request));
  }
  // anything else falls through to the browser untouched
});
