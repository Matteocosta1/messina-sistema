// Service worker dell'App Messina: tiene in memoria SOLO la cornice dell'app (HTML, JS, CSS, icone),
// così si apre anche senza rete e dice «Offline». Le risposte del database e le foto non si salvano mai qui.
const VERSIONE = 'messina-app-1';
const GUSCIO = ['./', './index.html', './main.js', './main.css', './manifest.webmanifest', './icone/icona-192.png', './icone/icona-180.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSIONE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;   // API Supabase, CDN: sempre dalla rete
  if (u.pathname.endsWith('/config.js')) return;                                   // la configurazione non si congela
  // prima la rete (versione nuova), se non c'è la copia del guscio
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && GUSCIO.some((g) => u.pathname.endsWith(g.replace('./', '/')) || (g === './' && u.pathname.endsWith('/')))) { const c = r.clone(); caches.open(VERSIONE).then((x) => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
