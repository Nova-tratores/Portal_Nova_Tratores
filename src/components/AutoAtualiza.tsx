'use client';
// Recarrega o portal sozinho quando sai um deploy novo (a versão do build
// muda em /api/versao). Pra não derrubar ninguém no meio da digitação:
//  - se a aba está em segundo plano → recarrega na hora;
//  - se a pessoa está usando a aba → recarrega assim que ela sair e voltar
//    (troca de aba/janela) ou na próxima checagem com a aba escondida.
// Checa a cada 3 min e também quando a janela recebe foco.
import { useEffect } from 'react';

const INTERVALO_MS = 3 * 60 * 1000;

export default function AutoAtualiza() {
  useEffect(() => {
    let versaoAtual: string | null = null;
    let pendente = false;
    let vivo = true;

    const recarregar = () => { try { window.location.reload(); } catch { /* nada */ } };

    const checar = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' });
        const j = await r.json();
        if (!vivo || !j?.v) return;
        if (versaoAtual === null) { versaoAtual = j.v; return; }
        if (j.v !== versaoAtual) {
          if (document.hidden) recarregar();
          else pendente = true; // espera a pessoa sair da aba
        }
      } catch { /* rede oscilou — tenta na próxima */ }
    };

    const aoMudarVisibilidade = () => {
      if (pendente && document.hidden) recarregar();
    };
    const aoFocar = () => {
      if (pendente) recarregar(); // voltou pra aba → já pega a versão nova
      else checar();
    };

    checar();
    const timer = setInterval(checar, INTERVALO_MS);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('focus', aoFocar);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('focus', aoFocar);
    };
  }, []);

  return null;
}
