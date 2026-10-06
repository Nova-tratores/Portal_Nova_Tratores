// Service worker da página pública da garantia (/garantia).
// Guarda a página, as fotos e as fontes no celular no primeiro acesso, para o
// cliente abrir de novo sem internet (na roça, sem sinal).
//
// Escopo "/garantia" casa por prefixo também com "/garantias" (tela interna do
// portal): por isso o fetch só responde às URLs desta página e deixa todo o
// resto seguir direto para a rede, sem tocar.
const VERSAO = 'garantia-v1';
const PAGINA = '/garantia';
const ARQUIVOS = [
  PAGINA,
  '/garantia/capa-trator.jpg',
  '/garantia/capa-soja.jpg',
  '/garantia/capa-campo.jpg',
  '/garantia/manifest.webmanifest',
  '/Logo_Nova.png',
  '/icon-192.png',
  '/favicon.ico',
];

function ehDaPagina(url) {
  if (url.origin === self.location.origin) {
    return url.pathname === PAGINA || url.pathname.startsWith('/garantia/') || ARQUIVOS.includes(url.pathname);
  }
  // fontes do Google usadas pela página
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('garantia-') && k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!ehDaPagina(url)) return; // /garantias, /api e o resto do portal: rede, sem cache

  // A página: rede primeiro (para receber atualizações), cópia salva sem internet.
  if (url.origin === self.location.origin && url.pathname === PAGINA) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(PAGINA, copia)); }
          return r;
        })
        .catch(() => caches.match(PAGINA))
    );
    return;
  }

  // Fotos, logo e fontes: o que está salvo primeiro; se não tiver, busca e guarda.
  e.respondWith(
    caches.match(req).then((salvo) => salvo || fetch(req).then((r) => {
      if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return r;
    }))
  );
});
