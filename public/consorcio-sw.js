// Service worker SÓ das páginas do consórcio (/consorcio/…) — 26/11/2026, José: "a ficha do vendedor tem que funcionar offline".
// O sw.js do portal continua sem cache (de propósito). Este aqui, com escopo /consorcio/, guarda o necessário
// para a ficha abrir sem internet no estande:
//   - páginas e dados do evento: INTERNET PRIMEIRO (sempre a versão nova); sem internet, a última cópia guardada
//   - arquivos do Next (/_next/static, com nome único por versão), fontes e fotos: cópia guardada primeiro
// Cadastros (POST) não passam por aqui: sem internet, a própria ficha guarda na fila do aparelho e envia depois.
const CACHE = 'consorcio-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('consorcio-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

async function internetPrimeiro(req) {
  const cache = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) await cache.put(req, r.clone());
    return r;
  } catch (e) {
    const guardada = await cache.match(req, { ignoreVary: true });
    if (guardada) return guardada;
    throw e;
  }
}

async function guardadaPrimeiro(req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const r = await fetch(req);
  if (r.ok) await cache.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' && url.pathname.startsWith('/consorcio/')) { event.respondWith(internetPrimeiro(req)); return; }
  if (url.pathname.startsWith('/api/consorcio/')) { event.respondWith(internetPrimeiro(req)); return; }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/black-friday/fonts/') || /^\/consorcio\/[^/]+\.(webp|png|jpe?g|svg)$/.test(url.pathname)
      || /\.(woff2?|png|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(guardadaPrimeiro(req));
  }
});
