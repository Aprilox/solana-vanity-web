/**
 * Service Worker - Solana Vanity Generator PWA
 * Permet l'installation et le fonctionnement offline
 */

const CACHE_NAME = 'vanity-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/worker.js',
    '/worker-gpu.js',
    '/terms.html',
    '/assets/vanity_wasm.js',
    '/assets/vanity_wasm_bg.wasm',
    '/assets/favicon.svg',
    '/assets/favicon-96x96.png',
    '/assets/web-app-manifest-192x192.png',
    '/assets/web-app-manifest-512x512.png',
    '/gpu-shaders/main.wgsl'
];

// Installation - mise en cache des assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Mise en cache des assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activation - nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Suppression ancien cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - stratégie Cache First, puis Network
self.addEventListener('fetch', (event) => {
    // Ignorer les requêtes non-GET
    if (event.request.method !== 'GET') return;
    
    // Ignorer les requêtes externes
    if (!event.request.url.startsWith(self.location.origin)) return;
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Mettre à jour le cache en arrière-plan
                    fetch(event.request)
                        .then((networkResponse) => {
                            if (networkResponse.ok) {
                                caches.open(CACHE_NAME)
                                    .then((cache) => cache.put(event.request, networkResponse));
                            }
                        })
                        .catch(() => {}); // Ignorer les erreurs réseau
                    
                    return cachedResponse;
                }
                
                // Pas en cache, récupérer du réseau
                return fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseClone));
                        }
                        return networkResponse;
                    });
            })
    );
});

