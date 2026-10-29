// Service worker : permet d'ouvrir l'application hors connexion.
// Fichiers de l'app : réseau d'abord (pour toujours voir la dernière version), cache en secours.
// Lecteur de codes et OCR (scripts + WebAssembly sur jsDelivr) : cache d'abord, les versions sont figées.
// Open Food Facts : toujours le réseau (les données sont enregistrées dans chaque référence).
// Les caches portent le préfixe « resser-v2- » : la version stable partage la même origine
// (caceres96.github.io) et ses caches ne doivent jamais être effacés par la bêta.
const PREFIXE = 'resser-v2-';
const CACHE = `${PREFIXE}4`;
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'reglas.js', 'ticket.js', 'manifest.webmanifest', 'icon.svg'];
const CDN = /^https:\/\/(cdn|fastly)\.jsdelivr\.net\/npm\/(barcode-detector|zxing-wasm|tesseract\.js|tesseract\.js-core|@tesseract\.js-data\/fra|pdfjs-dist)@/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIXE) && k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // no-cache : revalide auprès du serveur au lieu de servir le cache HTTP (10 min sur GitHub Pages).
    e.respondWith(
      fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then((res) => {
          if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
  } else if (CDN.test(url.href)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return res;
      })),
    );
  }
});
