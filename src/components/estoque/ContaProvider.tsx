'use client';
// Contexto de conta (NOVA/CASTRO/Todas) compartilhado por todas as páginas do
// módulo Estoque. Reusa a chave localStorage 'omie_conta_selecionada' que o
// monolito já gravava, então a seleção do usuário carrega para o portal nativo.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchAuth } from '@/lib/auth/client';

function lerContaSalva(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export interface ContaOption {
  id: 'NOVA' | 'CASTRO';
  nome: string;
}

interface ContaContextValue {
  /** '' = Todas; 'NOVA'/'CASTRO' = conta específica. */
  conta: string;
  setConta: (c: string) => void;
  contas: ContaOption[];
  /** Sufixo pronto para anexar à query string ('' ou '&conta=NOVA'). */
  contaParam: string;
  /** Conta vem de fora (ex.: o NOVA/CASTRO do topo do Financeiro): o ContaSelector some e não grava nada. */
  fixa: boolean;
}

const STORAGE_KEY = 'omie_conta_selecionada';
const ContaContext = createContext<ContaContextValue | null>(null);

// `fixa` (10/11/2026): a conta vem de quem monta o provider — as telas de contas do Financeiro seguem o NOVA/CASTRO
// do topo (uma escolha de empresa só na tela); sem `fixa`, o de sempre (Todas/Nova/Castro, lembrado no navegador).
export function ContaProvider({ children, fixa }: { children: React.ReactNode; fixa?: 'NOVA' | 'CASTRO' }) {
  // Inicializador lazy lê a seleção salva no client (no SSR retorna ''). Como o
  // ContaSelector só renderiza depois que `contas` carrega (async), não há
  // mismatch de hidratação sobre o valor do <select>.
  const [conta, setContaState] = useState<string>(lerContaSalva);
  const [contas, setContas] = useState<ContaOption[]>([]);

  // Lista de contas configuradas no backend.
  useEffect(() => {
    fetchAuth('/api/estoque/contas')
      .then((r) => r.json())
      .then((d) => setContas(d.contas || []))
      .catch(() => setContas([]));
  }, []);

  const setConta = useCallback((c: string) => {
    setContaState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  const contaEfetiva = fixa ?? conta;
  const contaParam = contaEfetiva ? '&conta=' + encodeURIComponent(contaEfetiva) : '';

  return (
    <ContaContext.Provider value={{ conta: contaEfetiva, setConta: fixa ? () => {} : setConta, contas, contaParam, fixa: !!fixa }}>{children}</ContaContext.Provider>
  );
}

export function useConta(): ContaContextValue {
  const ctx = useContext(ContaContext);
  if (!ctx) throw new Error('useConta deve ser usado dentro de <ContaProvider>');
  return ctx;
}
