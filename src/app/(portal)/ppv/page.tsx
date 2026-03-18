"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import { PPVProvider, usePPV } from "@/lib/ppv/PPVContext";
import { api } from "@/lib/ppv/api";
import Header from "@/components/ppv/Header";
import Toast from "@/components/ppv/Toast";
import GlobalLoader from "@/components/ppv/GlobalLoader";
import PhaseView from "@/components/ppv/PhaseView";
import FormNovoLancamento from "@/components/ppv/FormNovoLancamento";
import PPVDrawer from "@/components/ppv/PPVDrawer";
import ModalBuscaCliente from "@/components/ppv/ModalBuscaCliente";
import ModalBuscaOS from "@/components/ppv/ModalBuscaOS";
import ModalBuscaProduto from "@/components/ppv/ModalBuscaProduto";
import ModalProdutoManual from "@/components/ppv/ModalProdutoManual";
import CatalogoPecas from "@/components/ppv/CatalogoPecas";
import RastreioEncomendas from "@/components/ppv/RastreioEncomendas";

function PPVApp() {
  const { kanbanItems, carregarKanban, atualizarKanbanLocal, toast, hideToast, globalLoading, cacheProduct, showToast, tecnicos } = usePPV();

  // Tabs e filtros
  const [activeTab, setActiveTab] = useState("kanbanTab");
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ATIVOS");
  const [tecnicoFilter, setTecnicoFilter] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");

  // Lista de clientes únicos para filtro
  const clientesUnicos = useMemo(() => {
    const set = new Set(kanbanItems.map((i) => i.cliente).filter(Boolean));
    return Array.from(set).sort();
  }, [kanbanItems]);

  // Handler para trocar status via dropdown — update otimista
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    // Atualiza UI imediatamente (otimista)
    atualizarKanbanLocal(id, { status: newStatus });

    try {
      const detalhes = await api.buscarPedido(id);
      await api.editarPedido({
        id,
        status: newStatus,
        observacao: detalhes.observacao || "",
        tecnico: detalhes.tecnico || "",
        motivoCancelamento: detalhes.motivoCancelamento || "",
        pedidoOmie: detalhes.pedidoOmie || "",
        osId: detalhes.osId || "",
        tipoPedido: detalhes.tipoPedido || "",
        motivoSaida: detalhes.motivoSaida || "",
      });
      showToast("success", `PPV #${id} movido para "${newStatus}"`);
    } catch {
      showToast("error", `Erro ao alterar status da PPV #${id}`);
      carregarKanban(); // reverte em caso de erro
    }
  }, [showToast, carregarKanban, atualizarKanbanLocal]);

  // Modais
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPPVId, setDetailsPPVId] = useState<string | null>(null);
  const [buscaClienteOpen, setBuscaClienteOpen] = useState(false);
  const [buscaOSOpen, setBuscaOSOpen] = useState(false);
  const [buscaProdutoOpen, setBuscaProdutoOpen] = useState(false);
  const [buscaProdutoMode, setBuscaProdutoMode] = useState<"main" | "modal" | "edit">("main");
  const [produtoManualOpen, setProdutoManualOpen] = useState(false);
  const [produtoManualEdit, setProdutoManualEdit] = useState<{ id: string; codigo: string; descricao: string; preco: number } | null>(null);

  // Form fields
  const [clienteValue, setClienteValue] = useState("");
  const [osIdValue, setOsIdValue] = useState("");
  const [osDisplayValue, setOsDisplayValue] = useState("");
  const [produtoDisplay, setProdutoDisplay] = useState("");

  // Modal fields
  const [modalOSId, setModalOSId] = useState("");
  const [modalOSDisplay, setModalOSDisplay] = useState("");
  const [modalProdDisplay, setModalProdDisplay] = useState("");

  // Modal cliente field
  const [modalClienteNome, setModalClienteNome] = useState("");

  // Contextos de busca
  const osContext = useRef<"main" | "modal">("main");
  const prodContext = useRef<"main" | "modal" | "edit">("main");
  const clienteContext = useRef<"main" | "modal">("main");

  const handleSetModalOS = useCallback((id: string, display: string) => {
    setModalOSId(id);
    setModalOSDisplay(display);
  }, []);

  // Handlers
  const drawerDirty = useRef(false);
  function openCardDetails(id: string) { setDetailsPPVId(id); setDetailsOpen(true); drawerDirty.current = false; }
  function markDrawerDirty() { drawerDirty.current = true; }
  function closeDetails() {
    setDetailsOpen(false);
    setDetailsPPVId(null);
    if (drawerDirty.current) carregarKanban();
  }
  function handleBuscaOS(ctx: "main" | "modal") { osContext.current = ctx; setBuscaOSOpen(true); }

  function handleSelectOS(id: string, cliente: string) {
    const display = `OS #${id} - ${cliente}`;
    if (osContext.current === "main") { setOsIdValue(id); setOsDisplayValue(display); }
    else { setModalOSId(id); setModalOSDisplay(display); }
  }

  function handleBuscaProduto(ctx: "main" | "modal" | "edit") {
    prodContext.current = ctx;
    setBuscaProdutoMode(ctx);
    setBuscaProdutoOpen(true);
  }

  function handleSelectProduto(codigo: string, descricao: string, preco: number) {
    cacheProduct(codigo, descricao, preco);
    const display = `${codigo} - ${descricao}`;
    if (prodContext.current === "main") setProdutoDisplay(display);
    else if (prodContext.current === "modal") setModalProdDisplay(display);
  }

  function handleEditManual(id: number, codigo: string, descricao: string, preco: number) {
    setBuscaProdutoOpen(false);
    setProdutoManualEdit({ id: String(id), codigo, descricao, preco });
    setProdutoManualOpen(true);
  }

  function handleBuscaCliente(ctx: "main" | "modal") {
    clienteContext.current = ctx;
    setBuscaClienteOpen(true);
  }

  function handleSelectCliente(nome: string) {
    if (clienteContext.current === "main") {
      setClienteValue(nome);
    } else {
      setModalClienteNome(nome);
    }
  }

  function handleFormSaved() {
    setClienteValue(""); setOsIdValue(""); setOsDisplayValue(""); setProdutoDisplay("");
    setActiveTab("kanbanTab");
    carregarKanban();
  }

  // Filtro combinado: status + técnico + cliente
  const filteredKanban = kanbanItems.filter((item) => {
    const st = (item.status || "").toLowerCase();
    if (statusFilter === "ATIVOS" && (st.includes("fechado") || st.includes("concluido") || st.includes("cancelado"))) return false;
    if (statusFilter === "FECHADOS" && !(st.includes("fechado") || st.includes("concluido") || st.includes("cancelado"))) return false;
    if (tecnicoFilter && item.tecnico !== tecnicoFilter) return false;
    if (clienteFilter && item.cliente !== clienteFilter) return false;
    return true;
  });

  const bgPattern = { backgroundImage: "radial-gradient(#E8C4A8 1px, transparent 1px)", backgroundSize: "24px 24px" };

  return (
    <div className="flex flex-col overflow-hidden font-[Poppins] text-[14px] text-slate-800" style={{ height: "calc(100vh - 64px)" }}>
      <GlobalLoader visible={globalLoading} />
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />

      {/* ===== TOP BAR ===== */}
      <div className="ppv-topbar">
        {/* Brand */}
        <div className="ppv-topbar-brand">
          <div className="ppv-topbar-icon">
            <i className="fas fa-file-invoice-dollar" />
          </div>
          <span className="ppv-topbar-title">NOVA <span style={{ fontWeight: 400 }}>PPV</span></span>
        </div>

        {/* Nav tabs */}
        <div className="ppv-topbar-nav">
          <button
            className={`ppv-topbar-nav-btn ${activeTab === "kanbanTab" ? "active" : ""}`}
            onClick={() => setActiveTab("kanbanTab")}
          >
            <i className="fas fa-th-large" /> Gestão
          </button>
          <button
            className={`ppv-topbar-nav-btn ${activeTab === "formTab" ? "active" : ""}`}
            onClick={() => setActiveTab("formTab")}
          >
            <i className="fas fa-plus-circle" /> Novo Lançamento
          </button>
          <button
            className={`ppv-topbar-nav-btn ${activeTab === "catalogoTab" ? "active" : ""}`}
            onClick={() => setActiveTab("catalogoTab")}
          >
            <i className="fas fa-cogs" /> Catálogo
          </button>
          <button
            className={`ppv-topbar-nav-btn ${activeTab === "rastreioTab" ? "active" : ""}`}
            onClick={() => setActiveTab("rastreioTab")}
          >
            <i className="fas fa-truck" /> Rastreio
          </button>
        </div>

        {/* Action buttons */}
        <div className="ppv-topbar-actions">
          <button
            className="ppv-topbar-action-btn"
            onClick={() => { setProdutoManualEdit(null); setProdutoManualOpen(true); }}
          >
            <i className="fas fa-box-open" /> Criar Produto
          </button>
          <button
            className="ppv-topbar-action-btn secondary"
            onClick={() => handleBuscaProduto("edit")}
          >
            <i className="fas fa-edit" /> Editar Produto
          </button>
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeTab === "kanbanTab" && (
          <Header
            searchFilter={searchFilter} onSearchChange={setSearchFilter}
            statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
            tecnicoFilter={tecnicoFilter} onTecnicoFilterChange={setTecnicoFilter}
            tecnicos={tecnicos}
            clienteFilter={clienteFilter} onClienteFilterChange={setClienteFilter}
            clientes={clientesUnicos}
          />
        )}

        {activeTab === "kanbanTab" && (
          <div className="flex flex-1 flex-col overflow-auto" style={bgPattern}>
            <PhaseView orders={filteredKanban} searchTerm={searchFilter} onCardClick={openCardDetails} onStatusChange={handleStatusChange} loading={globalLoading} />
          </div>
        )}

        {activeTab === "catalogoTab" && (
          <div className="flex-1 overflow-hidden bg-red-950 p-5">
            <CatalogoPecas />
          </div>
        )}

        {activeTab === "rastreioTab" && (
          <div className="flex-1 overflow-hidden" style={bgPattern}>
            <RastreioEncomendas />
          </div>
        )}

        {activeTab === "formTab" && (
          <div className="flex-1 overflow-y-auto p-5" style={bgPattern}>
            <FormNovoLancamento
              onVoltar={() => setActiveTab("kanbanTab")}
              onBuscaCliente={() => handleBuscaCliente("main")}
              onBuscaOS={() => handleBuscaOS("main")}
              onBuscaProduto={() => handleBuscaProduto("main")}
              onSaved={handleFormSaved}
              clienteValue={clienteValue}
              osIdValue={osIdValue}
              osDisplayValue={osDisplayValue}
              produtoDisplay={produtoDisplay}
              onProdutoDisplayChange={setProdutoDisplay}
            />
          </div>
        )}
      </main>

      {/* Modais */}
      <PPVDrawer
        open={detailsOpen} ppvId={detailsPPVId} onClose={closeDetails}
        onBuscaProduto={() => handleBuscaProduto("modal")} onBuscaOS={() => handleBuscaOS("modal")}
        onBuscaCliente={() => handleBuscaCliente("modal")}
        modalOSId={modalOSId} modalOSDisplay={modalOSDisplay}
        modalProdDisplay={modalProdDisplay} onModalProdDisplayChange={setModalProdDisplay}
        onSetModalOS={handleSetModalOS}
        modalClienteNome={modalClienteNome}
        onDirty={markDrawerDirty}
      />

      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={handleSelectCliente} />
      <ModalBuscaOS open={buscaOSOpen} onClose={() => setBuscaOSOpen(false)} onSelect={handleSelectOS} />
      <ModalBuscaProduto open={buscaProdutoOpen} mode={buscaProdutoMode} onClose={() => setBuscaProdutoOpen(false)} onSelect={handleSelectProduto} onEditManual={handleEditManual} />
      <ModalProdutoManual open={produtoManualOpen} onClose={() => setProdutoManualOpen(false)} onSaved={() => {}} editData={produtoManualEdit} />
    </div>
  );
}

export default function PPVPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('ppv')) return <SemPermissao />;
  return (
    <PPVProvider>
      <PPVApp />
    </PPVProvider>
  );
}
