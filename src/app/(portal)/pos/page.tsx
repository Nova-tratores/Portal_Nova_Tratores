"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import Header from "@/components/pos/Header";
import PhaseAccordion from "@/components/pos/PhaseAccordion";
import OSDrawer from "@/components/pos/OSDrawer";
import ClientDrawer from "@/components/pos/ClientDrawer";
import LembretesDrawer from "@/components/pos/LembretesDrawer";
import LoadingIndicator from "@/components/pos/LoadingIndicator";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import type { KanbanCard, ClienteOption } from "@/lib/pos/types";

function PosPageInner() {
  const { userProfile } = useAuth();
  const [orders, setOrders] = useState<KanbanCard[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [valorHora, setValorHora] = useState(193);
  const [valorKm, setValorKm] = useState(2.8);

  // Drawer states
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);
  const [clientDrawerVisible, setClientDrawerVisible] = useState(false);
  const [lembretesVisible, setLembretesVisible] = useState(false);

  const fetchOrders = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/ordens", { signal });
      if (!res.ok) throw new Error("Erro HTTP");
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Erro ao carregar ordens:", err);
    }
    setLoading(false);
  }, []);

  const fetchClientes = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/pos/clientes", { signal });
      if (!res.ok) return;
      const data = await res.json();
      setClientes(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Erro ao carregar clientes:", err);
    }
  }, []);

  const fetchTecnicos = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/pos/tecnicos", { signal });
      if (!res.ok) return;
      const data = await res.json();
      setTecnicos(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Erro ao carregar técnicos:", err);
    }
  }, []);

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/pos/configuracoes", { signal });
      if (!res.ok) return;
      const data = await res.json();
      setValorHora(data.valor_hora);
      setValorKm(data.valor_km);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }, []);

  // Fetch inicial — ordens primeiro (prioridade), resto em background
  useEffect(() => {
    const ac = new AbortController();
    fetchOrders(ac.signal);
    fetchClientes(ac.signal);
    fetchTecnicos(ac.signal);
    fetchConfig(ac.signal);
    return () => ac.abort();
  }, [fetchOrders, fetchClientes, fetchTecnicos, fetchConfig]);

  // Auto-sync every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Refresh ao voltar para a aba
  useRefreshOnFocus(fetchOrders);

  const handleNewOS = () => {
    setDrawerMode("create");
    setSelectedOsId(null);
    setDrawerVisible(true);
  };

  const handleCardClick = (order: KanbanCard) => {
    setDrawerMode("edit");
    setSelectedOsId(order.id);
    setDrawerVisible(true);
  };

  const handlePhaseChange = async (orderId: string, newPhase: string) => {
    // Atualiza localmente para feedback imediato
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: newPhase } : o));
    try {
      const res = await fetch(`/api/pos/ordens/${orderId}/fase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newPhase, userName: userProfile?.nome }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        alert(data.erro || "Erro ao mudar fase");
      }
      fetchOrders();
    } catch (err) {
      console.error("Erro ao mudar fase:", err);
      fetchOrders();
    }
  };

  const handleDrawerClose = () => {
    setDrawerVisible(false);
    setSelectedOsId(null);
  };

  const handleSaved = () => {
    fetchOrders();
  };

  const handleSync = async () => {
    try {
      const res = await fetch("/api/pos/sync", {
        method: "POST",
        headers: { "x-sync-manual": "true" },
      });
      const data = await res.json();
      if (data.sucesso) {
        const c = data.resultados?.clientes;
        const p = data.resultados?.projetos;
        alert(
          `Sync concluído!\n\nClientes: ${c?.total || 0} (${c?.novos || 0} novos, ${c?.atualizados || 0} atualizados)\nProjetos: ${p?.total || 0} (${p?.novos || 0} novos)`
        );
        fetchClientes();
      } else {
        alert(`Erro no sync:\n${(data.erros || []).join("\n")}`);
      }
    } catch (err) {
      console.error("Erro ao sincronizar:", err);
      alert("Erro ao sincronizar com Omie.");
    }
  };

  const handleGenerateReport = async (filtros: { tecnico: string; tipo: string }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.tecnico !== "todos") params.set("tecnico", filtros.tecnico);
      if (filtros.tipo !== "todas") params.set("tipo", filtros.tipo);
      const qs = params.toString();
      const res = await fetch(`/api/pos/relatorio${qs ? `?${qs}` : ""}`);
      const html = await res.text();
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      alert("Erro ao gerar relatório.");
    }
    setLoading(false);
  };

  return (
    <div className="pos-container" style={{ height: "calc(100vh - 64px)", overflow: "auto" }}>
      <LoadingIndicator visible={loading} />
      <Header
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        onNewOS={handleNewOS}
        onNewClient={() => setClientDrawerVisible(true)}
        onGenerateReport={handleGenerateReport}
        onLembretes={() => setLembretesVisible(true)}
        tecnicos={tecnicos}
        valorHora={valorHora}
        valorKm={valorKm}
        onConfigSaved={(h, k) => { setValorHora(h); setValorKm(k); }}
      />
      <PhaseAccordion
        orders={orders}
        searchTerm={searchTerm}
        onCardClick={handleCardClick}
        onPhaseChange={handlePhaseChange}
      />

      {drawerVisible && (
        <OSDrawer
          visible={drawerVisible}
          mode={drawerMode}
          osId={selectedOsId}
          clientes={clientes}
          tecnicos={tecnicos}
          userName={userProfile?.nome || ""}
          onClose={handleDrawerClose}
          onSaved={handleSaved}
          valorHora={valorHora}
          valorKm={valorKm}
        />
      )}

      <LembretesDrawer
        visible={lembretesVisible}
        clientes={clientes}
        userName={userProfile?.nome || ""}
        onClose={() => setLembretesVisible(false)}
      />

      <ClientDrawer
        visible={clientDrawerVisible}
        onClose={() => setClientDrawerVisible(false)}
        onSaved={() => {
          setClientDrawerVisible(false);
          fetchClientes();
        }}
      />
    </div>
  );
}

export default function PosPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('pos')) return <SemPermissao />;
  return <PosPageInner />;
}
