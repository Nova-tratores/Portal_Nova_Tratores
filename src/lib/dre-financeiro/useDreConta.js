'use client'
// Hook de estado de CONTA compartilhado do modulo DRE Financeiro.
// Espelha o pegaConta do server.js: a conta vem do cookie 'conta' (default 'nova').
// As telas usam { conta } para montar as URLs das APIs (?conta=...), e o seletor
// de conta (no layout do modulo) chama setConta para gravar o cookie + atualizar
// o estado. Tambem e reexportado por '@/lib/dre-financeiro/format'.

import { useState, useEffect } from 'react';

// Contas disponiveis (slug + label exibido no seletor).
export const CONTAS = [
  { slug: 'nova', label: 'NOVA' },
  { slug: 'castro', label: 'CASTRO' },
  { slug: 'todas', label: 'TODAS' },
];

// Le o cookie 'conta' (no browser). Fallback para 'nova' (CONTA_PADRAO da fonte).
function lerCookieConta() {
  if (typeof document === 'undefined') return 'nova';
  const m = document.cookie.match(/(?:^|;\s*)conta=([^;]+)/);
  const c = m ? decodeURIComponent(m[1]).toLowerCase() : 'nova';
  return CONTAS.some((x) => x.slug === c) ? c : 'nova';
}

export function useDreConta() {
  // SSR-safe: inicia em 'nova' e sincroniza com o cookie no mount (evita mismatch).
  const [conta, setContaState] = useState('nova');

  useEffect(() => {
    setContaState(lerCookieConta());
  }, []);

  // Grava o cookie 'conta' (90 dias) e atualiza o estado.
  const setConta = (slug) => {
    const c = CONTAS.some((x) => x.slug === slug) ? slug : 'nova';
    if (typeof document !== 'undefined') {
      const maxAge = 90 * 24 * 60 * 60; // 90 dias em segundos
      document.cookie = `conta=${encodeURIComponent(c)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
    setContaState(c);
  };

  return { conta, setConta, contas: CONTAS };
}
