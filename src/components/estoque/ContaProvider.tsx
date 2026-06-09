'use client';
// Contexto de conta (NOVA/CASTRO/Todas) compartilhado por todas as páginas do
// módulo Estoque. Reusa a chave localStorage 'omie_conta_selecionada' que o
// monolito já gravava, então a seleção do usuário carrega para o portal nativo.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

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
}

const STORAGE_KEY = 'omie_conta_selecionada';
const ContaContext = createContext<ContaContextValue | null>(null);

export function ContaProvider({ children }: { children: React.ReactNode }) {
  // Inicializador lazy lê a seleção salva no client (no SSR retorna ''). Como o
  // ContaSelector só renderiza depois que `contas` carrega (async), não há
  // mismatch de hidratação sobre o valor do <select>.
  const [conta, setContaState] = useState<string>(lerContaSalva);
  const [contas, setContas] = useState<ContaOption[]>([]);

  // Lista de contas configuradas no backend.
  useEffect(() => {
    fetch('/api/estoque/contas')
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

  const contaParam = conta ? '&conta=' + encodeURIComponent(conta) : '';

  return (
    <ContaContext.Provider value={{ conta, setConta, contas, contaParam }}>{children}</ContaContext.Provider>
  );
}

export function useConta(): ContaContextValue {
  const ctx = useContext(ContaContext);
  if (!ctx) throw new Error('useConta deve ser usado dentro de <ContaProvider>');
  return ctx;
}
