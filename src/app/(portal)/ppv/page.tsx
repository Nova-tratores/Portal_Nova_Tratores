"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import SemPermissao from "@/components/SemPermissao";
import { PPVProvider, usePPV } from "@/lib/ppv/PPVContext";
import { api } from "@/lib/ppv/api";
import Header from "@/components/ppv/Header";
import Toast from "@/components/ppv/Toast";
import GlobalLoader from "@/components/ppv/GlobalLoader";
import PhaseView from "@/components/ppv/PhaseView";
import CatalogoNovo from "@/components/ppv/CatalogoNovo";
import FormNovoLancamento from "@/components/ppv/FormNovoLancamento";
import PPVDrawer from "@/components/ppv/PPVDrawer";
import ModalBuscaCliente from "@/components/ppv/ModalBuscaCliente";
import ModalBuscaOS from "@/components/ppv/ModalBuscaOS";
import ModalBuscaProduto from "@/components/ppv/ModalBuscaProduto";
import ModalProdutoManual from "@/components/ppv/ModalProdutoManual";
import ModalRevisoes from "@/components/ppv/ModalRevisoes";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";

function PPVApp() {
  const { kanbanItems, carregarKanban, atualizarKanbanLocal, toast, hideToast, globalLoading, cacheProduct, showToast, tecnicos, recarregarRevisoes } = usePPV();
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeCriar = pode('ppv', 'criar');
  const podeMoverFase = pode('ppv', 'mover_fase');
  const podeCatalogo = pode('ppv', 'catalogo');
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Refresh ao voltar para a aba
  useRefreshOnFocus(carregarKanban);

  // Tabs e filtros.
  // O Catálogo tem URL própria (/ppv/catalogo) pra dar pra linkar/favoritar — a aba
  // inicial sai do pathname (usePathname é igual no servidor e no cliente, sem
  // descasar a hidratação) e a URL é mantida em sincronia quando troca de aba.
  const [activeTab, setActiveTab] = useState(
    pathname?.endsWith("/catalogo") ? "catalogoTab" : "kanbanTab"
  );
  useEffect(() => {
    const alvo = activeTab === "catalogoTab" ? "/ppv/catalogo" : "/ppv";
    if (window.location.pathname !== alvo) {
      window.history.replaceState(null, "", alvo + window.location.search);
    }
  }, [activeTab]);
  const [searchFilter, setSearchFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("TODOS");
  const [tecnicoFilter, setTecnicoFilter] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");
  const [activePhase, setActivePhase] = useState("");

  // Lista de clientes únicos para filtro
  const clientesUnicos = useMemo(() => {
    const set = new Set(kanbanItems.map((i) => i.cliente).filter(Boolean));
    return Array.from(set).sort();
  }, [kanbanItems]);

  // Handler para trocar status via dropdown — update otimista
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    if (!podeMoverFase) { showToast("error", "Você não tem permissão para mover de fase."); return; }
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
        userName: userProfile?.nome || "",
      });
      showToast("success", `PPV #${id} movido para "${newStatus}"`);
    } catch {
      showToast("error", `Erro ao alterar status da PPV #${id}`);
      carregarKanban(); // reverte em caso de erro
    }
  }, [showToast, carregarKanban, atualizarKanbanLocal, podeMoverFase, userProfile?.nome]);

  // Abrir PPV via URL (?id=PPV-0001)
  const urlPPVId = searchParams.get("id");
  const urlHandledRef = useRef(false);
  useEffect(() => {
    if (urlPPVId && !urlHandledRef.current) {
      urlHandledRef.current = true;
      setDetailsPPVId(urlPPVId);
      setDetailsOpen(true);
    }
  }, [urlPPVId]);

  // Modais
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPPVId, setDetailsPPVId] = useState<string | null>(null);
  const [buscaClienteOpen, setBuscaClienteOpen] = useState(false);
  const [buscaOSOpen, setBuscaOSOpen] = useState(false);
  const [buscaProdutoOpen, setBuscaProdutoOpen] = useState(false);
  const [buscaProdutoMode, setBuscaProdutoMode] = useState<"main" | "modal" | "edit">("main");
  const [produtoManualOpen, setProdutoManualOpen] = useState(false);
  const [produtoManualEdit, setProdutoManualEdit] = useState<{ id: string; codigo: string; descricao: string; preco: number } | null>(null);

  // Sync produtos
  const [syncingProdutos, setSyncingProdutos] = useState(false);
  const [showGerenciarKits, setShowGerenciarKits] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Menu cascata da topbar
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  async function syncPrecosOmie() {
    setSyncingProdutos(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/ppv/sync-produtos', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data.sucesso ? `Sincronizado! ${data.total} produtos atualizados.` : `Erro: ${data.erro || 'Falha na sincronização'}`);
    } catch {
      setSyncResult('Erro de conexão ao sincronizar produtos.');
    } finally {
      setSyncingProdutos(false);
      setTimeout(() => setSyncResult(null), 6000);
    }
  }

  // Form fields
  const [clienteValue, setClienteValue] = useState("");
  const [osIdValue, setOsIdValue] = useState("");
  const [osDisplayValue, setOsDisplayValue] = useState("");
  const [produtoDisplay, setProdutoDisplay] = useState("");

  // Modal fields
  const [modalOSId, setModalOSId] = useState("");
  const [modalOSDisplay, setModalOSDisplay] = useState("");
  const [modalProdDisplay, setModalProdDisplay] = useState("");
  const [modalProdCodigo, setModalProdCodigo] = useState("");

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

  function handleSelectProduto(codigo: string, descricao: string, preco: number, empresa?: string) {
    cacheProduct(codigo, descricao, preco, empresa);
    const display = `${codigo} - ${descricao}`;
    if (prodContext.current === "main") setProdutoDisplay(display);
    else if (prodContext.current === "modal") {
      setModalProdDisplay(display);
      setModalProdCodigo(codigo);
    }
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
      // Limpa antes de setar: garante que escolher o MESMO cliente de novo conte como
      // mudança de estado (senão o React não re-renderiza e o drawer não aplica).
      setModalClienteNome("");
      setTimeout(() => setModalClienteNome(nome), 0);
    }
  }
  // O drawer avisa quando já aplicou o nome — aí zeramos, pra próxima escolha valer.
  const handleClienteConsumido = useCallback(() => setModalClienteNome(""), []);

  function handleFormSaved() {
    setClienteValue(""); setOsIdValue(""); setOsDisplayValue(""); setProdutoDisplay("");
    setActiveTab("kanbanTab");
    carregarKanban();
  }

  // Filtro combinado: tipo (Pedido/Remessa) + técnico + cliente. Mostra todos os status.
  const filteredKanban = kanbanItems.filter((item) => {
    const isRem = (item.tipo || "").toLowerCase().includes("remessa") || (item.tipo || "").toUpperCase() === "REM";
    if (tipoFilter === "PEDIDO" && isRem) return false;
    if (tipoFilter === "REMESSA" && !isRem) return false;
    if (tecnicoFilter && item.tecnico !== tecnicoFilter) return false;
    if (clienteFilter && item.cliente !== clienteFilter) return false;
    return true;
  });

  // Fundo igual ao POS: superfície neutra clara, sem o padrão pontilhado.
  const bgPattern = { background: "var(--portal-bg, #f1f5f9)" };

  return (
    <div className="flex flex-col overflow-hidden font-[Poppins] text-[14px] text-slate-800" style={{ height: "calc(100vh - 84px)" }}>
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

        {/* Ações à direita: Novo Lançamento + Menu cascata */}
        <div className="ppv-topbar-actions">
          <button
            className={`ppv-topbar-nav-btn ${activeTab === "formTab" ? "active" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
            onClick={() => setActiveTab("formTab")}
            disabled={!podeCriar}
            title={!podeCriar ? MSG_SEM_PERMISSAO : undefined}
          >
            <i className="fas fa-plus-circle" /> Novo Lançamento
          </button>

          <div style={{ position: "relative" }} ref={menuRef}>
          <button className="ppv-topbar-action-btn" onClick={() => setMenuOpen((o) => !o)}>
            <i className="fas fa-bars" /> Menu
            <i className="fas fa-chevron-down" style={{ fontSize: 10, marginLeft: 6, transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>

          {menuOpen && (() => {
            const item = (icon: string, label: string, onClick: () => void, opts?: { active?: boolean; disabled?: boolean; danger?: boolean }) => (
              <button
                disabled={opts?.disabled}
                onClick={() => { onClick(); setMenuOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", width: "100%",
                  border: "none", borderRadius: 8, cursor: opts?.disabled ? "not-allowed" : "pointer",
                  background: opts?.active ? "var(--ppv-primary-light, #FEF2F2)" : "transparent",
                  color: opts?.active ? "var(--ppv-primary)" : "var(--ppv-text)",
                  fontSize: 13, fontWeight: 600, textAlign: "left", fontFamily: "'Poppins', sans-serif",
                  opacity: opts?.disabled ? 0.6 : 1, transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!opts?.disabled && !opts?.active) e.currentTarget.style.background = "#F1F5F9"; }}
                onMouseLeave={(e) => { if (!opts?.active) e.currentTarget.style.background = "transparent"; }}
              >
                <i className={`fas ${icon}`} style={{ width: 16, textAlign: "center", color: opts?.active ? "var(--ppv-primary)" : "var(--ppv-accent)" }} />
                {label}
              </button>
            );
            return (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 100,
                minWidth: 240, background: "#fff", borderRadius: 12,
                border: "1px solid var(--ppv-border-light)", boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
                padding: 6, display: "flex", flexDirection: "column", gap: 2,
              }}>
                {item("fa-th-large", "Gestão (Kanban)", () => setActiveTab("kanbanTab"), { active: activeTab === "kanbanTab" })}
                {podeCatalogo && (
                  <>
                    {item("fa-cogs", "Catálogo", () => setActiveTab("catalogoTab"), { active: activeTab === "catalogoTab" })}
                    <div style={{ height: 1, background: "var(--ppv-border-light)", margin: "4px 8px" }} />
                    {item("fa-box-open", "Criar Produto", () => { setProdutoManualEdit(null); setProdutoManualOpen(true); })}
                    {item("fa-edit", "Editar Produto", () => handleBuscaProduto("edit"))}
                    {item("fa-tools", "Gerenciar Kits", () => setShowGerenciarKits(true))}
                    {item(`fa-sync-alt ${syncingProdutos ? "fa-spin" : ""}`, syncingProdutos ? "Sincronizando..." : "Sync Preços Omie", syncPrecosOmie, { disabled: syncingProdutos })}
                  </>
                )}
              </div>
            );
          })()}

          {syncResult && (
            <span style={{
              position: 'absolute', top: '110%', right: 0, whiteSpace: 'nowrap',
              background: syncResult.startsWith('Erro') ? '#FEE2E2' : '#D1FAE5',
              color: syncResult.startsWith('Erro') ? '#DC2626' : '#065F46',
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 50,
            }}>
              {syncResult}
            </span>
          )}
          </div>
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeTab === "kanbanTab" && (
          <Header
            searchFilter={searchFilter} onSearchChange={setSearchFilter}
            tipoFilter={tipoFilter} onTipoFilterChange={setTipoFilter}
            tecnicoFilter={tecnicoFilter} onTecnicoFilterChange={setTecnicoFilter}
            tecnicos={tecnicos}
            clienteFilter={clienteFilter} onClienteFilterChange={setClienteFilter}
            clientes={clientesUnicos}
          />
        )}

        {activeTab === "kanbanTab" && (
          <div className="flex flex-1 flex-col overflow-auto" style={bgPattern}>
            <PhaseView orders={filteredKanban} searchTerm={searchFilter} onCardClick={openCardDetails} onStatusChange={handleStatusChange} loading={globalLoading} activePhase={activePhase} onPhaseChange={setActivePhase} />
          </div>
        )}

        {activeTab === "catalogoTab" && (
          <div className="flex-1 overflow-hidden p-4" style={bgPattern}>
            <CatalogoNovo userName={userProfile?.nome || ""} />
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
        modalProdDisplay={modalProdDisplay} modalProdCodigo={modalProdCodigo}
        onModalProdDisplayChange={(v) => { setModalProdDisplay(v); if (!v) setModalProdCodigo(""); }}
        onSetModalOS={handleSetModalOS}
        modalClienteNome={modalClienteNome}
        onClienteConsumido={handleClienteConsumido}
        onDirty={markDrawerDirty}
      />

      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={handleSelectCliente} />
      <ModalBuscaOS open={buscaOSOpen} onClose={() => setBuscaOSOpen(false)} onSelect={handleSelectOS} />
      <ModalBuscaProduto open={buscaProdutoOpen} mode={buscaProdutoMode} onClose={() => setBuscaProdutoOpen(false)} onSelect={handleSelectProduto} onEditManual={handleEditManual} />
      <ModalProdutoManual open={produtoManualOpen} onClose={() => setProdutoManualOpen(false)} onSaved={() => {}} editData={produtoManualEdit} />
      <ModalRevisoes open={showGerenciarKits} onClose={() => setShowGerenciarKits(false)} onSaved={recarregarRevisoes} />
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
