"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
import PPVMobile from "@/components/ppv/PPVMobile";
import { useIsMobile } from "@/hooks/useIsMobile";
import CatalogoNovo from "@/components/ppv/CatalogoNovo";
import EtiquetasPanel from "@/components/ppv/EtiquetasPanel";
import FormNovoLancamento from "@/components/ppv/FormNovoLancamento";
import PPVDrawer from "@/components/ppv/PPVDrawer";
import ModalBuscaCliente from "@/components/ppv/ModalBuscaCliente";
import ModalBuscaOS from "@/components/ppv/ModalBuscaOS";
import ModalBuscaProduto from "@/components/ppv/ModalBuscaProduto";
import ModalUsoProduto from "@/components/ppv/ModalUsoProduto";
import ModalProdutosEstoque from "@/components/ppv/ModalProdutosEstoque";
import ModalProdutoManual from "@/components/ppv/ModalProdutoManual";
import ModalRevisoes from "@/components/ppv/ModalRevisoes";
import BotaoRetiradas from "@/components/ppv/BotaoRetiradas";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";

function PPVApp() {
  const { kanbanItems, carregarKanban, atualizarKanbanLocal, toast, hideToast, globalLoading, cacheProduct, showToast, recarregarRevisoes } = usePPV();
  const { userProfile } = useAuth();
  const { pode, temAcesso } = usePermissoes(userProfile?.id);
  const isMobile = useIsMobile();
  const podeCriar = pode('ppv', 'criar');
  const podeMoverFase = pode('ppv', 'mover_fase');
  const podeCatalogo = pode('ppv', 'catalogo');
  const podeEtiquetas = pode('ppv', 'etiquetas');
  const podeRetiradas = pode('ppv', 'rastreio_liberar');
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Refresh ao voltar para a aba
  useRefreshOnFocus(carregarKanban);

  // Tabs e filtros.
  // O Catálogo tem URL própria (/ppv/catalogo) pra dar pra linkar/favoritar — a aba
  // inicial sai do pathname (usePathname é igual no servidor e no cliente, sem
  // descasar a hidratação) e a URL é mantida em sincronia quando troca de aba.
  const [activeTab, setActiveTab] = useState(
    pathname?.endsWith("/catalogo") ? "catalogoTab"
      : searchParams?.get("tab") === "etiquetas" ? "etiquetasTab"
      : "kanbanTab"
  );
  useEffect(() => {
    const alvo = activeTab === "catalogoTab" ? "/ppv/catalogo" : "/ppv";
    const sp = new URLSearchParams(window.location.search);
    sp.delete("tab");
    if (activeTab === "etiquetasTab") sp.set("tab", "etiquetas");
    const qs = sp.toString();
    const destino = alvo + (qs ? `?${qs}` : "");
    if (window.location.pathname + window.location.search !== destino) {
      window.history.replaceState(null, "", destino);
    }
  }, [activeTab]);
  const [searchFilter, setSearchFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("TODOS");
  const [activePhase, setActivePhase] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "lista">("cards");

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
  const [buscaProdutoCatalogo, setBuscaProdutoCatalogo] = useState(false);
  const [produtoManualOpen, setProdutoManualOpen] = useState(false);
  const [produtoManualEdit, setProdutoManualEdit] = useState<{ id: string; codigo: string; descricao: string; preco: number } | null>(null);
  const [produtoManualProvisorio, setProdutoManualProvisorio] = useState(false);
  // Menu suspenso de ações no cabeçalho da Gestão (Kits/Produtos/Sync)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDoc = (e: MouseEvent) => { if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [headerMenuOpen]);

  // Sync produtos
  const [syncingProdutos, setSyncingProdutos] = useState(false);
  const [showGerenciarKits, setShowGerenciarKits] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);


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
  const [osAutofill, setOsAutofill] = useState<{ nonce: number; tecnico: string; projeto: string; solicitacao: string } | null>(null);
  const [produtoDisplay, setProdutoDisplay] = useState("");

  // Modal fields
  const [modalOSId, setModalOSId] = useState("");
  const [modalOSDisplay, setModalOSDisplay] = useState("");
  const [modalProdDisplay, setModalProdDisplay] = useState("");
  const [modalProdCodigo, setModalProdCodigo] = useState("");
  const [kitSinal, setKitSinal] = useState(0); // modal "Novo Item" → abrir Importar Kit no drawer

  // Modal cliente field
  const [modalClienteNome, setModalClienteNome] = useState("");

  // Contextos de busca
  const osContext = useRef<"main" | "modal">("main");
  const prodContext = useRef<"main" | "modal" | "edit" | "filtro">("main");
  // Filtro por produto: mostra em quais PPVs o produto foi/está sendo usado.
  const [usoProduto, setUsoProduto] = useState<{ codigo: string; descricao: string } | null>(null);
  const [produtosEstoqueOpen, setProdutosEstoqueOpen] = useState(false);
  // Guarda o produto do filtro quando abrimos um PPV a partir dele, pra REABRIR
  // o histórico no mesmo produto quando o usuário fechar o PPV.
  const usoProdutoVoltar = useRef<{ codigo: string; descricao: string } | null>(null);
  const clienteContext = useRef<"main" | "modal">("main");

  const handleSetModalOS = useCallback((id: string, display: string) => {
    setModalOSId(id);
    setModalOSDisplay(display);
  }, []);

  // Handlers
  const drawerDirty = useRef(false);
  function openCardDetails(id: string) {
    setDetailsPPVId(id); setDetailsOpen(true); drawerDirty.current = false;
    // Reflete o card aberto na URL (dá pra linkar/favoritar/abrir direto)
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/ppv?id=${encodeURIComponent(id)}`);
  }
  function markDrawerDirty() { drawerDirty.current = true; }
  function closeDetails() {
    setDetailsOpen(false);
    setDetailsPPVId(null);
    if (typeof window !== "undefined") window.history.replaceState(null, "", activeTab === "catalogoTab" ? "/ppv/catalogo" : "/ppv");
    if (drawerDirty.current) carregarKanban();
    // Veio do Histórico Produto? volta pra ele, no mesmo produto.
    if (usoProdutoVoltar.current) { setUsoProduto(usoProdutoVoltar.current); usoProdutoVoltar.current = null; }
  }
  function handleBuscaOS(ctx: "main" | "modal") { osContext.current = ctx; setBuscaOSOpen(true); }

  function handleSelectOS(id: string, cliente: string) {
    const display = `OS #${id} - ${cliente}`;
    if (osContext.current === "main") {
      setOsIdValue(id); setOsDisplayValue(display);
      // Vincular OS no formulário novo: puxa cliente + os demais campos.
      if (cliente) setClienteValue(cliente);
      fetch(`/api/ppv/ordens-servico?id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || d.error) return;
          if (d.cliente) setClienteValue(d.cliente);
          setOsAutofill({ nonce: Date.now(), tecnico: d.tecnico || "", projeto: d.projeto || "", solicitacao: d.solicitacao || "" });
        })
        .catch(() => {});
    } else { setModalOSId(id); setModalOSDisplay(display); }
  }

  function handleBuscaProduto(ctx: "main" | "modal" | "edit" | "filtro") {
    prodContext.current = ctx;
    // No filtro só escolhemos um produto; o modo "main" do buscador serve.
    setBuscaProdutoMode(ctx === "filtro" ? "main" : ctx);
    setBuscaProdutoCatalogo(false);
    setBuscaProdutoOpen(true);
  }

  // Abre a busca de produto já na aba de catálogo (botão "Catálogo" do drawer/form).
  function handleAbrirCatalogo(ctx: "main" | "modal") {
    prodContext.current = ctx;
    setBuscaProdutoMode(ctx);
    setBuscaProdutoCatalogo(true);
    setBuscaProdutoOpen(true);
  }

  // Peça do catálogo não cadastrada no Omie → cria produto provisório pré-preenchido.
  function handleCriarProvisorio(codigo: string, descricao: string) {
    setBuscaProdutoOpen(false);
    setProdutoManualEdit({ id: "", codigo, descricao, preco: 0 });
    setProdutoManualProvisorio(true);
    setProdutoManualOpen(true);
  }

  function handleSelectProduto(codigo: string, descricao: string, preco: number, empresa?: string) {
    cacheProduct(codigo, descricao, preco, empresa);
    const display = `${codigo} - ${descricao}`;
    if (prodContext.current === "filtro") { setUsoProduto({ codigo, descricao }); return; }
    if (prodContext.current === "main") setProdutoDisplay(display);
    else if (prodContext.current === "modal") {
      setModalProdDisplay(display);
      setModalProdCodigo(codigo);
    }
  }

  function handleEditManual(id: number, codigo: string, descricao: string, preco: number) {
    setBuscaProdutoOpen(false);
    setProdutoManualEdit({ id: String(id), codigo, descricao, preco });
    setProdutoManualProvisorio(false);
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
    setClienteValue(""); setOsIdValue(""); setOsDisplayValue(""); setProdutoDisplay(""); setOsAutofill(null);
    setActiveTab("kanbanTab");
    carregarKanban();
  }

  // Filtro combinado: tipo (Pedido/Remessa). A busca por texto cobre técnico/cliente/ID.
  const filteredKanban = kanbanItems.filter((item) => {
    const isRem = (item.tipo || "").toLowerCase().includes("remessa") || (item.tipo || "").toUpperCase() === "REM";
    if (tipoFilter === "PEDIDO" && isRem) return false;
    if (tipoFilter === "REMESSA" && !isRem) return false;
    return true;
  });

  // Fundo igual ao POS: superfície neutra clara, sem o padrão pontilhado.
  const bgPattern = { background: "var(--portal-bg, #f1f5f9)" };

  const headerMenuItem = (icon: string, label: string, onClick: () => void, disabled = false) => (
    <button disabled={disabled} onClick={() => { onClick(); setHeaderMenuOpen(false); }}
      style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", width: "100%", border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", background: "transparent", color: "var(--ppv-text)", fontSize: 14.5, fontWeight: 500, textAlign: "left", fontFamily: "'Poppins', sans-serif", opacity: disabled ? 0.6 : 1 }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "#F1F5F9"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <i className={`fas ${icon}`} style={{ width: 17, textAlign: "center", color: "var(--ppv-accent)" }} /> {label}
    </button>
  );

  const headerActions = (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <button onClick={() => setActiveTab("formTab")} disabled={!podeCriar} title={!podeCriar ? MSG_SEM_PERMISSAO : undefined}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--ppv-primary, #dc2626)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: podeCriar ? "pointer" : "not-allowed", opacity: podeCriar ? 1 : 0.55, fontFamily: "'Poppins', sans-serif", whiteSpace: "nowrap" }}>
        <i className="fas fa-plus-circle" /> Novo Lançamento
      </button>
      {podeCatalogo && (
        <div style={{ position: "relative" }} ref={headerMenuRef}>
          <button onClick={() => setHeaderMenuOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1.5px solid var(--ppv-border-light)", background: "#fff", color: "var(--ppv-text)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif", whiteSpace: "nowrap" }}>
            <i className="fas fa-bars" /> Menu <i className="fas fa-chevron-down" style={{ fontSize: 10, transform: headerMenuOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          {headerMenuOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, minWidth: 220, background: "#fff", border: "1px solid var(--ppv-border-light)", borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,0.14)", padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {headerMenuItem("fa-tools", "Gerenciar Kits", () => setShowGerenciarKits(true))}
              <div style={{ height: 1, background: "var(--ppv-border-light)", margin: "4px 8px" }} />
              {headerMenuItem("fa-box-open", "Criar Produto", () => { setProdutoManualEdit(null); setProdutoManualProvisorio(false); setProdutoManualOpen(true); })}
              {headerMenuItem("fa-edit", "Editar Produto", () => handleBuscaProduto("edit"))}
              {headerMenuItem(`fa-sync-alt ${syncingProdutos ? "fa-spin" : ""}`, syncingProdutos ? "Sincronizando..." : "Sync Preços", syncPrecosOmie, syncingProdutos)}
              {syncResult && <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, color: syncResult.startsWith("Erro") ? "#DC2626" : "#065F46" }}>{syncResult}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col overflow-hidden font-[Poppins] text-[14px] text-slate-800" style={{ height: "calc(100vh - 84px)" }}>
      <GlobalLoader visible={globalLoading} />
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />

      {/* ===== TOP BAR ===== */}
      <div className="ppv-topbar">
        {/* Abas (estilo Chrome) à direita: só Gestão e Catálogo */}
        <div className="ppv-topbar-actions">
          <button className={`ppv-topbar-nav-btn ${activeTab === "kanbanTab" ? "active" : ""}`} onClick={() => setActiveTab("kanbanTab")}>
            <i className="fas fa-th-large" /> Pré-Pedido de Venda
          </button>
          {podeCatalogo && (
            <button className={`ppv-topbar-nav-btn ${activeTab === "catalogoTab" ? "active" : ""}`} onClick={() => setActiveTab("catalogoTab")}>
              <i className="fas fa-cogs" /> Catálogo
            </button>
          )}
          {podeEtiquetas && (
            <button className={`ppv-topbar-nav-btn ${activeTab === "etiquetasTab" ? "active" : ""}`} onClick={() => setActiveTab("etiquetasTab")} title="Imprimir etiquetas de identificação de peças (código por empresa)">
              <i className="fas fa-tags" /> Etiquetas
            </button>
          )}
          {podeRetiradas && <BotaoRetiradas />}
          {/* Sistema Peças: Orçamentos e Requisições como abas internas do PPV */}
          {temAcesso('orcamentos') && (
            <a href="/orcamentos" className="ppv-topbar-nav-btn" style={{ textDecoration: 'none' }}>
              <i className="fas fa-calculator" /> Orçamentos
            </a>
          )}
          {temAcesso('requisicoes') && (
            <a href="/requisicoes" className="ppv-topbar-nav-btn" style={{ textDecoration: 'none' }}>
              <i className="fas fa-clipboard-list" /> Requisições
            </a>
          )}
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeTab === "kanbanTab" && isMobile && (
          // ===== CELULAR: lista própria (o kanban de colunas do PC não é usado) =====
          <PPVMobile
            orders={kanbanItems}
            searchTerm={searchFilter} onSearchChange={setSearchFilter}
            onCardClick={openCardDetails}
            onNovo={() => setActiveTab("formTab")}
            podeCriar={podeCriar}
            loading={globalLoading}
          />
        )}

        {activeTab === "kanbanTab" && !isMobile && (
          <Header
            searchFilter={searchFilter} onSearchChange={setSearchFilter}
            tipoFilter={tipoFilter} onTipoFilterChange={setTipoFilter}
            actions={headerActions}
            onFiltrarProduto={() => setProdutosEstoqueOpen(true)}
          />
        )}

        {activeTab === "kanbanTab" && !isMobile && (
          <div className="flex flex-1 flex-col overflow-auto" style={bgPattern}>
            {/* Alternar Cards ⇄ Lista */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "10px 16px 0" }}>
              <button type="button" onClick={() => setViewMode("cards")} title="Ver em cards"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #e2ddd3", background: viewMode === "cards" ? "#e8730c" : "#fff", color: viewMode === "cards" ? "#fff" : "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <i className="fas fa-table-cells-large" /> Cards
              </button>
              <button type="button" onClick={() => setViewMode("lista")} title="Ver em lista"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #e2ddd3", background: viewMode === "lista" ? "#e8730c" : "#fff", color: viewMode === "lista" ? "#fff" : "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <i className="fas fa-list" /> Lista
              </button>
            </div>
            <PhaseView orders={filteredKanban} searchTerm={searchFilter} onCardClick={openCardDetails} onStatusChange={handleStatusChange} loading={globalLoading} activePhase={activePhase} onPhaseChange={setActivePhase} viewMode={viewMode} />
          </div>
        )}

        {activeTab === "catalogoTab" && (
          <div className="pecas-skin flex-1 overflow-hidden p-4" style={bgPattern}>
            <CatalogoNovo userName={userProfile?.nome || ""} />
          </div>
        )}

        {activeTab === "etiquetasTab" && (
          <div className="pecas-skin flex-1 overflow-y-auto" style={bgPattern}>
            <EtiquetasPanel embedded />
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
              osAutofill={osAutofill}
            />
          </div>
        )}
      </main>

      {/* Modais */}
      <PPVDrawer
        open={detailsOpen} ppvId={detailsPPVId} onClose={closeDetails}
        onBuscaProduto={() => handleBuscaProduto("modal")} onBuscaOS={() => handleBuscaOS("modal")}
        onAbrirCatalogo={() => handleAbrirCatalogo("modal")}
        onBuscaCliente={() => handleBuscaCliente("modal")}
        modalOSId={modalOSId} modalOSDisplay={modalOSDisplay}
        modalProdDisplay={modalProdDisplay} modalProdCodigo={modalProdCodigo} kitSinal={kitSinal}
        onModalProdDisplayChange={(v) => { setModalProdDisplay(v); if (!v) setModalProdCodigo(""); }}
        onSetModalOS={handleSetModalOS}
        modalClienteNome={modalClienteNome}
        onClienteConsumido={handleClienteConsumido}
        onDirty={markDrawerDirty}
      />

      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={handleSelectCliente} />
      <ModalBuscaOS open={buscaOSOpen} onClose={() => setBuscaOSOpen(false)} onSelect={handleSelectOS} />
      <ModalBuscaProduto open={buscaProdutoOpen} mode={buscaProdutoMode} onClose={() => setBuscaProdutoOpen(false)} onSelect={handleSelectProduto} onEditManual={handleEditManual} abrirNoCatalogo={buscaProdutoCatalogo} onCriarProvisorio={handleCriarProvisorio}
        onAbrirKit={buscaProdutoMode === "modal" ? () => { setBuscaProdutoOpen(false); setKitSinal((s) => s + 1); } : undefined} />
      <ModalProdutosEstoque open={produtosEstoqueOpen} onClose={() => setProdutosEstoqueOpen(false)} onSelect={(codigo, descricao) => { setProdutosEstoqueOpen(false); setUsoProduto({ codigo, descricao }); }} />
      <ModalUsoProduto open={!!usoProduto} codigo={usoProduto?.codigo || null} descricao={usoProduto?.descricao} onClose={() => setUsoProduto(null)} onAbrirPpv={(id) => { usoProdutoVoltar.current = usoProduto; setUsoProduto(null); openCardDetails(id); }} />
      <ModalProdutoManual open={produtoManualOpen} onClose={() => setProdutoManualOpen(false)} onSaved={() => {}} editData={produtoManualEdit} provisorio={produtoManualProvisorio} />
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
