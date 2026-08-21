"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import Header from "@/components/pos/Header";
import PhaseAccordion from "@/components/pos/PhaseAccordion";
import PosMobile from "@/components/pos/PosMobile";
import OSDrawer from "@/components/pos/OSDrawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import LembretesDrawer from "@/components/pos/LembretesDrawer";
import LoadingIndicator from "@/components/pos/LoadingIndicator";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { authHeaders } from "@/lib/auth/client";
import { supabase } from "@/lib/supabase";
import { normName } from "@/lib/tecnico-utils";
import type { PerfilTecnico } from "@/components/pos/Header";
import type { KanbanCard, ClienteOption } from "@/lib/pos/types";

function PosPageInner() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeCriar = pode('pos', 'criar');
  const podeEditar = pode('pos', 'editar');
  const podeMoverFase = pode('pos', 'mover_fase');
  const podeOmie = pode('pos', 'enviar_omie');
  const podeConcluir = pode('pos', 'concluir');
  const podeCancelar = pode('pos', 'cancelar');
  const [orders, setOrders] = useState<KanbanCard[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  // Filtro por técnico no header: fila de perfis do PORTAL (com foto)
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");
  const [tecnicosPerfil, setTecnicosPerfil] = useState<PerfilTecnico[]>([]);

  // Casa cada técnico com o usuário do portal (financeiro_usu) pelo nome →
  // pega a FOTO (avatar_url). Técnico sem conta no portal entra com inicial.
  useEffect(() => {
    if (tecnicos.length === 0) return;
    let ativo = true;
    (async () => {
      try {
        const { data: usuarios } = await supabase
          .from("financeiro_usu").select("nome, avatar_url").eq("ativo", true);
        if (!ativo) return;
        const porNome = new Map((usuarios || []).map((u) => [normName(u.nome || ""), u.avatar_url || ""]));
        setTecnicosPerfil(tecnicos.map((t) => {
          const chave = normName(t);
          let avatar = porNome.get(chave) || "";
          if (!avatar) {
            // fallback: usuário cujo nome contém o do técnico (ou vice-versa)
            for (const [n, a] of porNome) {
              if (a && (n.includes(chave) || chave.includes(n))) { avatar = a; break; }
            }
          }
          return { nome: t, avatar };
        }));
      } catch { setTecnicosPerfil(tecnicos.map((t) => ({ nome: t, avatar: "" }))); }
    })();
    return () => { ativo = false; };
  }, [tecnicos]);
  const [loading, setLoading] = useState(true);
  const [valorHora, setValorHora] = useState(193);
  const [valorKm, setValorKm] = useState(2.8);

  // Drawer states
  const isMobile = useIsMobile();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);
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

  // Abre a OS que veio na URL (/pos?id=OS-XXXX) uma vez, ao montar.
  const urlHandledRef = useRef(false);
  useEffect(() => {
    if (urlHandledRef.current || typeof window === "undefined") return;
    urlHandledRef.current = true;
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      setDrawerMode("edit");
      setSelectedOsId(id);
      setDrawerVisible(true);
    }
  }, []);

  const handleNewOS = () => {
    if (!podeCriar) return;
    setDrawerMode("create");
    setSelectedOsId(null);
    setDrawerVisible(true);
  };

  const handleCardClick = (order: KanbanCard) => {
    setDrawerMode("edit");
    setSelectedOsId(order.id);
    setDrawerVisible(true);
    // URL reflete o card aberto (/pos?id=OS-XXXX), pra copiar/compartilhar o link.
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/pos?id=${encodeURIComponent(order.id)}`);
  };

  // ── Envio ao Omie (manual, pelos botões da fase "Enviar Omie") ──
  // Cria ordem/pedido REAL no Omie, por isso não é automático.
  const [enviandoOmie, setEnviandoOmie] = useState<string | null>(null); // id da OS, ou "__todas__"

  const handleEnviarOmie = async (orderId: string) => {
    if (!podeOmie) { alert("Você não tem permissão para enviar ao Omie."); return; }
    const o = orders.find((x) => x.id === orderId);
    if (!confirm(`Enviar a ${orderId} ao Omie?\n\nCliente: ${o?.cliente || "—"}\n${o?.temPPV ? "O PPV vinculado também vai (pedido de venda).\n" : ""}\nIsso cria ordem REAL no Omie. Ação irreversível.`)) return;
    setEnviandoOmie(orderId);
    try {
      const res = await fetch(`/api/pos/ordens/${orderId}/enviar-omie`, { method: "POST", headers: { ...(await authHeaders()) } });
      const r = await res.json();
      if (r.ok) {
        alert(`✅ ${orderId} enviada!\nOrdem Omie nº ${r.cNumOS || "—"}${r.pedidoVenda ? `\nPedido de Venda nº ${r.pedidoVenda}` : ""}${r.ppvErro ? `\n\n⚠️ Erro no PPV: ${r.ppvErro}` : ""}`);
      } else {
        alert(`❌ Não enviou a ${orderId}:\n\n${r.erro || r.error || "erro desconhecido"}`);
      }
    } catch { alert("Erro de conexão ao enviar ao Omie."); }
    setEnviandoOmie(null);
    fetchOrders();
  };

  const handleEnviarOmieTodas = async () => {
    if (!podeOmie) { alert("Você não tem permissão para enviar ao Omie."); return; }
    const fila = orders.filter((o) => o.status === "Enviar Omie");
    if (fila.length === 0) { alert('Não há nenhuma OS na fase "Enviar Omie".'); return; }
    if (!confirm(`Enviar ao Omie as ${fila.length} OS da fase "Enviar Omie"?\n\nIsso cria ordens REAIS no Omie (OS + PPV vinculado). Ação irreversível.`)) return;
    setEnviandoOmie("__todas__");
    try {
      const res = await fetch("/api/pos/ordens/enviar-omie-lote", { method: "POST", headers: { ...(await authHeaders()) } });
      const r = await res.json();
      if (res.ok) {
        const ruins = (r.resultados || []).filter((x: { ok: boolean; ppvErro?: string }) => !x.ok || x.ppvErro);
        alert(`Envio ao Omie: ${r.ok}/${r.total} enviadas${r.erros ? ` · ${r.erros} com erro` : ""}` +
          (ruins.length ? `\n\n${ruins.map((x: { os: string; erro?: string; ppvErro?: string }) => `${x.os}: ${x.erro || `PPV: ${x.ppvErro}`}`).join("\n")}` : ""));
      } else alert(`Erro: ${r.error || "falha"}`);
    } catch { alert("Erro de conexão ao enviar ao Omie."); }
    setEnviandoOmie(null);
    fetchOrders();
  };

  const handlePhaseChange = async (orderId: string, newPhase: string) => {
    if (!podeMoverFase) { alert("Você não tem permissão para mover de fase."); return; }
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
    // Volta a URL pra /pos ao fechar o card.
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/pos");
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
      {isMobile ? (
        // ===== CELULAR: tela própria (o desktop abaixo não é usado no mobile) =====
        <PosMobile
          orders={orders}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onCardClick={handleCardClick}
          onNewOS={handleNewOS}
          podeCriar={podeCriar}
          loading={loading}
        />
      ) : (
        <>
          <Header
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            onNewOS={handleNewOS}
            onGenerateReport={handleGenerateReport}
            onLembretes={() => setLembretesVisible(true)}
            tecnicos={tecnicos}
            valorHora={valorHora}
            valorKm={valorKm}
            onConfigSaved={(h, k) => { setValorHora(h); setValorKm(k); }}
            podeCriar={podeCriar}
            tecnicosPerfil={tecnicosPerfil}
            tecnicoFiltro={tecnicoFiltro}
            onTecnicoFiltro={setTecnicoFiltro}
          />
          <PhaseAccordion
            orders={orders}
            searchTerm={searchTerm}
            tecnicoFiltro={tecnicoFiltro}
            onCardClick={handleCardClick}
            onPhaseChange={podeMoverFase ? handlePhaseChange : undefined}
            onEnviarOmie={podeOmie ? handleEnviarOmie : undefined}
            onEnviarOmieTodas={podeOmie ? handleEnviarOmieTodas : undefined}
            enviandoOmie={enviandoOmie}
          />
        </>
      )}

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
          podeEditar={podeEditar}
          podeOmie={podeOmie}
          podeConcluir={podeConcluir}
          podeCancelar={podeCancelar}
        />
      )}

      <LembretesDrawer
        visible={lembretesVisible}
        clientes={clientes}
        userName={userProfile?.nome || ""}
        onClose={() => setLembretesVisible(false)}
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
