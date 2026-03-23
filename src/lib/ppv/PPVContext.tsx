"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { KanbanItem, DadosIniciais } from "./types";
import { api } from "./api";

// =============================================
// TIPOS DO CONTEXTO
// =============================================

interface ToastState {
  visible: boolean;
  type: "success" | "error";
  message: string;
}

interface PPVContextValue {
  // Dados globais
  tecnicos: string[];
  opcoesRevisao: Record<string, string[]>;
  kanbanItems: KanbanItem[];
  carregarKanban: () => Promise<void>;
  atualizarKanbanLocal: (id: string, changes: Partial<KanbanItem>) => void;
  productCache: Record<string, { descricao: string; preco: number; empresa?: string }>;
  cacheProduct: (codigo: string, descricao: string, preco: number, empresa?: string) => void;

  // Toast
  toast: ToastState;
  showToast: (type: "success" | "error", message: string) => void;
  hideToast: () => void;

  // Loading global
  globalLoading: boolean;
  setGlobalLoading: (v: boolean) => void;
}

const PPVContext = createContext<PPVContextValue | null>(null);

export function usePPV() {
  const ctx = useContext(PPVContext);
  if (!ctx) throw new Error("usePPV deve ser usado dentro de PPVProvider");
  return ctx;
}

// =============================================
// PROVIDER
// =============================================

export function PPVProvider({ children }: { children: ReactNode }) {
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [opcoesRevisao, setOpcoesRevisao] = useState<Record<string, string[]>>({});
  const [kanbanItems, setKanbanItems] = useState<KanbanItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>({ visible: false, type: "success", message: "" });
  const productCacheRef = useRef<Record<string, { descricao: string; preco: number; empresa?: string }>>({});

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ visible: true, type, message });
  }, []);

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const cacheProduct = useCallback((codigo: string, descricao: string, preco: number, empresa?: string) => {
    productCacheRef.current[codigo] = { descricao, preco, empresa };
  }, []);

  const carregarKanban = useCallback(async () => {
    try {
      const data = await api.listarPedidos();
      setKanbanItems(data);
    } catch (e) {
      console.error("Erro kanban:", e);
    }
  }, []);

  const atualizarKanbanLocal = useCallback((id: string, changes: Partial<KanbanItem>) => {
    setKanbanItems((prev) => prev.map((item) => item.id === id ? { ...item, ...changes } : item));
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [dados] = await Promise.all([
          api.getDadosIniciais(),
          carregarKanban(),
        ]);
        setTecnicos(dados.tecnicos);
        setOpcoesRevisao(dados.opcoesRevisao);
      } catch (e) {
        console.error("Erro init:", e);
      }
      setGlobalLoading(false);
    }
    init();
    const interval = setInterval(carregarKanban, 60000);
    return () => clearInterval(interval);
  }, [carregarKanban]);

  return (
    <PPVContext.Provider
      value={{
        tecnicos,
        opcoesRevisao,
        kanbanItems,
        carregarKanban,
        atualizarKanbanLocal,
        productCache: productCacheRef.current,
        cacheProduct,
        toast,
        showToast,
        hideToast,
        globalLoading,
        setGlobalLoading,
      }}
    >
      {children}
    </PPVContext.Provider>
  );
}
