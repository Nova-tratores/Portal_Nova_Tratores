'use client';
// Recarrega o portal sozinho quando sai um deploy novo (a versão do build
// muda em /api/versao). Checa a cada 3 min e quando a janela recebe foco.
//
// NUNCA recarrega por cima de trabalho não salvo (07/10/2026 — reclamação real
// do módulo Peças: a pessoa saía da aba, voltava e o formulário estava vazio):
//  - se há formulário com alteração pendente, ou a pessoa digitou algo nos
//    últimos 20 min, NÃO recarrega: mostra uma faixa "Atualizar agora" e quem
//    decide é ela;
//  - sem nada pendente: recarrega quando a aba estiver em segundo plano.
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { temPendencias, digitouHaPouco } from '@/lib/rascunho/pendencias';

const INTERVALO_MS = 3 * 60 * 1000;
const DIGITACAO_RECENTE_MS = 20 * 60 * 1000;

const DIGITACAO_APP_MS = 2 * 60 * 1000;

const podeRecarregarSozinho = () => !temPendencias() && !digitouHaPouco(DIGITACAO_RECENTE_MS);

// App instalado (Tela de Início): atualização FORÇADA (28/10/2026, pedido do José). Recarrega até com a
// tela na frente — só segura se houver formulário não salvo ou digitação nos últimos 2 min.
const instalado = () => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
};
const podeForcarNoApp = () => instalado() && !temPendencias() && !digitouHaPouco(DIGITACAO_APP_MS);

export default function AutoAtualiza() {
  const [faixa, setFaixa] = useState(false);
  const [escondida, setEscondida] = useState(false);

  useEffect(() => {
    let versaoAtual: string | null = null;
    let pendente = false;
    let vivo = true;

    const recarregar = () => { try { window.location.reload(); } catch { /* nada */ } };
    // só recarrega sozinho com a aba ESCONDIDA e sem nada digitado/pendente
    const tentar = () => {
      if (!pendente) return;
      if (podeForcarNoApp()) recarregar();
      else if (document.hidden && podeRecarregarSozinho()) recarregar();
      else setFaixa(true);
    };

    const checar = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' });
        const j = await r.json();
        if (!vivo || !j?.v) return;
        if (versaoAtual === null) { versaoAtual = j.v; return; }
        if (j.v !== versaoAtual) { pendente = true; tentar(); }
      } catch { /* rede oscilou — tenta na próxima */ }
    };

    // App instalado no celular: ele fica "dormindo" em segundo plano e o timer congela, então podia passar
    // dias na versão velha. Ao REABRIR, confere a versão (e o service worker) e recarrega na hora.
    const aoReabrir = async () => {
      try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* sem sw */ }
      await checar();
      tentar();
    };
    // Service worker novo assumiu (sw.js manda 'portal-atualizar'): trata como deploy novo.
    const aoMensagemSw = (e: MessageEvent) => {
      if (e.data?.tipo !== 'portal-atualizar') return;
      pendente = true;
      tentar();
    };

    const aoMudarVisibilidade = () => { if (document.hidden) tentar(); else aoReabrir(); };
    const aoFocar = () => { if (pendente) setFaixa(true); else checar(); };

    checar();
    const timer = setInterval(checar, INTERVALO_MS);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('focus', aoFocar);
    navigator.serviceWorker?.addEventListener('message', aoMensagemSw);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('focus', aoFocar);
      navigator.serviceWorker?.removeEventListener('message', aoMensagemSw);
    };
  }, []);

  if (!faixa || escondida) return null;
  return (
    <div role="status" style={{
      position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 16px', borderRadius: 12,
      background: '#111111', color: '#fefefe', boxShadow: '0 10px 30px rgba(0,0,0,.3)', fontSize: 13.5, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
    }}>
      <RefreshCw size={16} />
      <span style={{ minWidth: 0 }}>Saiu uma versão nova do portal. Salve o que estiver fazendo e atualize quando puder.</span>
      <button onClick={() => window.location.reload()} style={{ border: 'none', borderRadius: 8, padding: '6px 12px', background: '#dc2626', color: '#fefefe', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Atualizar agora</button>
      <button onClick={() => setEscondida(true)} aria-label="Fechar" style={{ border: 'none', background: 'transparent', color: '#fefefe', cursor: 'pointer', display: 'flex', padding: 6, flexShrink: 0 }}><X size={15} /></button>
    </div>
  );
}
