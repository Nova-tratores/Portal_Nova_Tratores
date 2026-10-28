// Service worker do Portal (28/10/2026): SÓ avisos (push) — chegam com o portal fechado.
// NÃO guarda páginas nem arquivos em cache (sem 'fetch'), para nunca segurar versão velha depois de um deploy.
// Quem manda o push: src/lib/push/portal-server.ts (cada aviso novo do sino → gatilho no banco → /api/push/notificacao).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const IOS = /iPhone|iPad|iPod/i.test(self.navigator.userAgent || '');

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: event.data ? event.data.text() : '' }; }
  const titulo = d.titulo || d.title || 'Portal Nova Tratores';
  const opcoes = {
    body: d.corpo || d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { link: d.link || d.url || '/dashboard' },
  };
  event.waitUntil((async () => {
    // Portal aberto e na frente: o sino da própria tela já avisa (no iPhone mostra sempre — o iOS cancela a inscrição
    // de quem recebe push sem mostrar aviso).
    if (!IOS) {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (janelas.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    }
    await self.registration.showNotification(titulo, opcoes);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.link) || '/dashboard', self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const doPortal = janelas.find((c) => c.url.startsWith(self.location.origin));
    if (doPortal) {
      try { await doPortal.focus(); } catch { /* sem foco */ }
      try { await doPortal.navigate(destino); return; } catch { /* abre nova */ }
    }
    await self.clients.openWindow(destino);
  })());
});

// Navegador trocou a inscrição sozinho: manda a nova para o portal (a rota acha o dono pela inscrição antiga).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const antiga = event.oldSubscription;
      const opts = antiga && antiga.options ? antiga.options : null;
      const nova = event.newSubscription || (opts ? await self.registration.pushManager.subscribe(opts) : null);
      if (!nova || !antiga) return;
      await fetch('/api/push/inscrever/trocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antigo: antiga.endpoint, inscricao: nova.toJSON() }),
      });
    } catch { /* na próxima abertura do portal a inscrição é refeita */ }
  })());
});
