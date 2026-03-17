/**
 * BetterMagic - Service Worker
 * 
 * Caches static assets for offline use and faster subsequent loads
 */

const CACHE_NAME = 'bettermagic-v1.2';
const CACHE_URLS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './js/registry.js',
    './js/scoring.js',
    './js/ui.js',
    './js/crazy.js',
    './js/magic_worker.js',
    './js/performance.js',
    './js/wasm_module.js',
    './js/progressive_renderer.js',
    './js/ciphers/base32.js',
    './js/ciphers/base45.js',
    './js/ciphers/base58.js',
    './js/ciphers/base62.js',
    './js/ciphers/base64.js',
    './js/ciphers/base85.js',
    './js/ciphers/base91.js',
    './js/ciphers/base92.js',
    './js/ciphers/binary.js',
    './js/ciphers/decimal.js',
    './js/ciphers/hex.js',
    './js/ciphers/octal.js',
    './js/ciphers/reverse.js',
    './js/ciphers/rot13.js',
    './js/ciphers/rot47.js',
    './js/ciphers/rot8000.js',
    './js/ciphers/xor.js',
    './js/ciphers/compression_utils.js',
    './js/ciphers/gunzip.js',
    './js/ciphers/zlib_inflate.js',
    './js/ciphers/raw_inflate.js',
    './js/vendor/zlibjs/zlib_and_gzip.min.js',
    './js/vendor/zlibjs/gunzip.min.js',
    './js/vendor/zlibjs/rawinflate.min.js'
];

// Install event - cache all static assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('[Service Worker] Installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activated successfully');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip external requests (fonts, etc.)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response (can only be consumed once)
                        const responseToCache = response.clone();
                        
                        // Add to cache for future use
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch((error) => {
                        console.error('[Service Worker] Fetch failed:', error);
                        // Could return a custom offline page here
                        throw error;
                    });
            })
    );
});

// Message event - handle cache updates
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME)
                .then(() => {
                    console.log('[Service Worker] Cache cleared');
                    return caches.open(CACHE_NAME);
                })
                .then((cache) => {
                    return cache.addAll(CACHE_URLS);
                })
        );
    }
});
