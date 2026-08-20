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
  recarregarRevisoes: () => Promise<void>;
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

// Provider LEVE pra usar componentes do PPV (ex.: ModalBuscaProduto) FORA do
// módulo PPV — como dentro da OS do POS. Não carrega kanban nem dados globais;
// só oferece cache de produto e um toast próprio (centralizado no topo).
export function PPVMiniProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ visible: false, type: "success", message: "" });
  const productCacheRef = useRef<Record<string, { descricao: string; preco: number; empresa?: string }>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ visible: true, type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2600);
  }, []);
  const hideToast = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);
  const cacheProduct = useCallback((codigo: string, descricao: string, preco: number, empresa?: string) => {
    productCacheRef.current[codigo] = { descricao, preco, empresa };
  }, []);

  return (
    <PPVContext.Provider
      value={{
        tecnicos: [],
        opcoesRevisao: {},
        recarregarRevisoes: async () => {},
        kanbanItems: [],
        carregarKanban: async () => {},
        atualizarKanbanLocal: () => {},
        productCache: productCacheRef.current,
        cacheProduct,
        toast,
        showToast,
        hideToast,
        globalLoading: false,
        setGlobalLoading: () => {},
      }}
    >
      {children}
      {toast.visible && (
        <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9500, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 13.5, color: "#fff", background: toast.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          {toast.message}
        </div>
      )}
    </PPVContext.Provider>
  );
}

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

  // Recarrega as opções de revisão (Modelo/Horas) — usar após mexer nos kits no gerenciador
  const recarregarRevisoes = useCallback(async () => {
    try {
      const dados = await api.getDadosIniciais();
      setTecnicos(dados.tecnicos);
      setOpcoesRevisao(dados.opcoesRevisao);
    } catch (e) {
      console.error("Erro ao recarregar revisões:", e);
    }
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
        recarregarRevisoes,
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
