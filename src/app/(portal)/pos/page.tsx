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
import type { KanbanCard, ClienteOption } from "@/lib/pos/types";

function PosPageInner() {
  const [orders, setOrders] = useState<KanbanCard[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

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

  // Fetch inicial — ordens primeiro (prioridade), resto em background
  useEffect(() => {
    const ac = new AbortController();
    fetchOrders(ac.signal);
    fetchClientes(ac.signal);
    fetchTecnicos(ac.signal);
    return () => ac.abort();
  }, [fetchOrders, fetchClientes, fetchTecnicos]);

  // Auto-sync every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrders, 60000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

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
        body: JSON.stringify({ status: newPhase }),
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

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/relatorio");
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
        onSync={handleSync}
        onLembretes={() => setLembretesVisible(true)}
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
          onClose={handleDrawerClose}
          onSaved={handleSaved}
        />
      )}

      <LembretesDrawer
        visible={lembretesVisible}
        clientes={clientes}
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
