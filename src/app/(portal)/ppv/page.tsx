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
import RelacaoView from "@/components/ppv/RelacaoView";
import DashboardPPV from "@/components/ppv/DashboardPPV";
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
import ItemOrcamentoModal from "@/components/ppv/ItemOrcamentoModal";
import ModalProdutoManual from "@/components/ppv/ModalProdutoManual";
import ModalRevisoes from "@/components/ppv/ModalRevisoes";
import { BadgeRetiradas, useRetiradasPendentes } from "@/components/ppv/BotaoRetiradas";
import PecasNav, { subAbasPPV } from "@/components/ppv/PecasNav";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";
import { fetchAuth } from "@/lib/auth/client";
import MenuSuspenso from "@/components/comum/MenuSuspenso";
import { BotaoRedondo } from "@/components/comum/MenuRadial";
import { usePpvVisualNovo, ESTILO_PPV_VN } from "@/components/ppv/VisualNovoPPV";

function PPVApp() {
  const { kanbanItems, carregarKanban, atualizarKanbanLocal, toast, hideToast, globalLoading, cacheProduct, showToast, recarregarRevisoes } = usePPV();
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const isMobile = useIsMobile();
  usePpvVisualNovo(); // visual igual ao POS (só aparência; ver VisualNovoPPV.tsx)
  const podeCriar = pode('ppv', 'criar');
  const podeMoverFase = pode('ppv', 'mover_fase');
  const podeCatalogo = pode('ppv', 'catalogo');
  const podeEtiquetas = pode('ppv', 'etiquetas');
  const podeRetiradas = pode('ppv', 'rastreio_liberar');
  const retiradasPendentes = useRetiradasPendentes();
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
      : searchParams?.get("tab") === "dashboard" ? "dashTab"
      : "kanbanTab"
  );
  useEffect(() => {
    const alvo = activeTab === "catalogoTab" ? "/ppv/catalogo" : "/ppv";
    const sp = new URLSearchParams(window.location.search);
    sp.delete("tab");
    if (activeTab === "etiquetasTab") sp.set("tab", "etiquetas");
    if (activeTab === "dashTab") sp.set("tab", "dashboard");
    const qs = sp.toString();
    const destino = alvo + (qs ? `?${qs}` : "");
    if (window.location.pathname + window.location.search !== destino) {
      window.history.replaceState(null, "", destino);
    }
  }, [activeTab]);
  const [searchFilter, setSearchFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("TODOS");
  const [activePhase, setActivePhase] = useState("");
  // Cards | Lista (compacta, por fase) | Relação (tabela com filtros por coluna, PDF, e-mail). Lembra a escolha.
  const [viewMode, setViewMode] = useState<"cards" | "lista" | "relacao">("cards");
  useEffect(() => {
    try { const v = localStorage.getItem("ppv-view-mode"); if (v === "cards" || v === "lista" || v === "relacao") setViewMode(v); } catch { /* sem storage */ }
  }, []);
  const trocarViewMode = useCallback((v: "cards" | "lista" | "relacao") => { setViewMode(v); try { localStorage.setItem("ppv-view-mode", v); } catch { /* sem storage */ } }, []);

  // Handler para trocar status via dropdown — update otimista
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    if (!podeMoverFase) { showToast("error", "Você não tem permissão para mover de fase."); return; }
    // Cancelada: pede o motivo e cancela de verdade (no Omie primeiro, se o pedido está lá).
    // Antes só mudava a fase no portal e o pedido seguia vivo no Omie.
    if (newStatus === "Cancelada") {
      const motivo = (window.prompt(`Motivo do cancelamento da PPV #${id}:`) || "").trim();
      if (!motivo) { showToast("error", "Cancelamento não feito: informe o motivo."); return; }
      atualizarKanbanLocal(id, { status: newStatus });
      try {
        const r = await api.cancelarPedido(id, motivo, userProfile?.nome || "");
        showToast("success", r?.empresa ? `PPV #${id} cancelada no Omie (${r.empresa}) e no portal.` : `PPV #${id} cancelada.`);
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : `Erro ao cancelar a PPV #${id}`);
        carregarKanban();
      }
      return;
    }
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

  // Checkbox de reserva no card: agenda a OS vinculada (Orçamento Aprovado + Data Início);
  // PPV sem OS só muda de fase (não tem serviço pra datar).
  const handleAgendar = useCallback(async (id: string, dataISO: string) => {
    if (!podeMoverFase) { showToast("error", "Você não tem permissão para mover de fase."); return; }
    atualizarKanbanLocal(id, { status: "Orçamento Aprovado" });
    try {
      const item = kanbanItems.find((k) => k.id === id) as { osId?: string } | undefined;
      const osId = String(item?.osId || "").trim();
      if (osId) {
        const res = await fetchAuth(`/api/pos/ordens/${encodeURIComponent(osId)}/fase`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Orçamento Aprovado", userName: userProfile?.nome, previsaoExecucao: dataISO }),
        });
        const d = await res.json();
        if (!res.ok || d.erro) throw new Error(d.erro || "falha");
        showToast("success", `Agendado pra ${dataISO.split("-").reverse().join("/")} — a OS ${osId} foi junto`);
      } else {
        await handleStatusChange(id, "Orçamento Aprovado");
      }
      carregarKanban();
    } catch {
      showToast("error", "Erro ao agendar");
      carregarKanban();
    }
  }, [kanbanItems, podeMoverFase, userProfile?.nome, atualizarKanbanLocal, carregarKanban, showToast, handleStatusChange]);

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
  const [modalProdQtd, setModalProdQtd] = useState(1);            // qtd escolhida no "Novo Item"
  const [buscaFechadaSinal, setBuscaFechadaSinal] = useState(0);  // fechou o "Novo Item" → drawer atualiza 1x
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
      const res = await fetchAuth('/api/ppv/sync-produtos', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data.sucesso ? `Sincronizado! ${data.total} produtos atualizados.` : `Erro: ${data.erro || 'Falha na sincronização'}${data.total ? ` (${data.total} gravados)` : ''}`);
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
  // Ficha completa do produto (mesma janela do Item de Orçamento), aberta da lista de estoque
  const [itemProduto, setItemProduto] = useState<{ codigo: string; descricao: string; conta: "NOVA" | "CASTRO"; preco: number } | null>(null);
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
  // useCallback: função nova a cada render fazia o PPVDrawer recarregar do banco (e apagar o digitado)
  const markDrawerDirty = useCallback(() => { drawerDirty.current = true; }, []);
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
      fetchAuth(`/api/ppv/ordens-servico?id=${encodeURIComponent(id)}`)
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

  function handleSelectProduto(codigo: string, descricao: string, preco: number, empresa?: string, qtd?: number) {
    cacheProduct(codigo, descricao, preco, empresa);
    const display = `${codigo} - ${descricao}`;
    if (prodContext.current === "filtro") { setUsoProduto({ codigo, descricao }); return; }
    if (prodContext.current === "main") setProdutoDisplay(display);
    else if (prodContext.current === "modal") {
      setModalProdQtd(qtd && qtd > 0 ? qtd : 1);
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

  // Ações do topo no padrão do POS (roteiro ppv-estilo-pos.md): menu suspenso "Atalhos" + botão redondo "+".
  // Mesmos itens e mesmas funções do antigo "Menu" e do "Novo Lançamento".
  const headerActions = (
    <div className="ppv-tb-acoes" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
      {podeCatalogo && (
        <MenuSuspenso cor="#E8730C" rotulo="Menu" titulo="Menu: kits, produtos e sync de preços"
          itens={[
            { k: "kits", t: "Gerenciar Kits", ic: "fa-tools", cor: "#E8730C", ir: () => setShowGerenciarKits(true) },
            { k: "criar", grupo: "Produtos", t: "Criar Produto", ic: "fa-box-open", cor: "#E8730C", ir: () => { setProdutoManualEdit(null); setProdutoManualProvisorio(false); setProdutoManualOpen(true); } },
            { k: "editar", t: "Editar Produto", ic: "fa-edit", cor: "#E8730C", ir: () => handleBuscaProduto("edit") },
            { k: "sync", t: syncingProdutos ? "Sincronizando..." : "Sync Preços", sub: syncResult || undefined, ic: `fa-sync-alt ${syncingProdutos ? "fa-spin" : ""}`, cor: "#047857", ir: () => { if (!syncingProdutos) syncPrecosOmie(); } },
          ]} />
      )}
      <BotaoRedondo cor="#E8730C" icone="fa-plus" titulo={podeCriar ? "Novo Lançamento" : MSG_SEM_PERMISSAO} onClick={() => setActiveTab("formTab")}
        disabled={!podeCriar} style={podeCriar ? undefined : { opacity: 0.55, cursor: "not-allowed" }} />
    </div>
  );

  const listaCelular = isMobile && activeTab === "kanbanTab";
  return (
    // celular na lista: a página rola (sem altura travada nem overflow-hidden); o quadro do PC continua preso à tela
    <div className={`ppv-vn-page flex min-w-0 flex-col ${listaCelular ? "overflow-x-clip" : "overflow-hidden"} font-[Poppins] text-[14px] text-slate-800`} style={listaCelular ? { minHeight: "calc(100vh - 84px)" } : { height: "calc(100vh - 84px)" }}>
      <style>{ESTILO_PPV_VN}</style>
      <GlobalLoader visible={globalLoading} />
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />

      {/* ===== TOP BAR: módulos do setor Peças (iguais à dashboard) + telas do Pedidos de Peças na 2ª linha ===== */}
      <PecasNav sub={subAbasPPV({
        ativo: activeTab === 'dashTab' ? 'dash' : activeTab === 'catalogoTab' ? 'catalogo' : activeTab === 'etiquetasTab' ? 'etiquetas' : 'kanban',
        podeCatalogo, podeEtiquetas, podeRetiradas, badgeRetiradas: <BadgeRetiradas n={retiradasPendentes} />,
        ir: (aba) => setActiveTab(aba === 'dash' ? 'dashTab' : aba === 'catalogo' ? 'catalogoTab' : aba === 'etiquetas' ? 'etiquetasTab' : 'kanbanTab'),
      })} />

      {/* ===== CONTENT ===== */}
      <main className={`relative flex min-w-0 flex-1 flex-col ${listaCelular ? "" : "overflow-hidden"}`}>
        {activeTab === "kanbanTab" && isMobile && (
          // ===== CELULAR: lista própria (o kanban de colunas do PC não é usado) =====
          <PPVMobile
            orders={kanbanItems}
            searchTerm={searchFilter} onSearchChange={setSearchFilter}
            onCardClick={openCardDetails}
            onNovo={() => setActiveTab("formTab")}
            podeCriar={podeCriar}
            loading={globalLoading}
            podeLiberar={podeRetiradas}
            onLiberar={(id) => { window.location.href = `/ppv/liberacao/${encodeURIComponent(id)}`; }}
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
          <div className="ppv-vn-fundo flex flex-1 flex-col overflow-auto" style={bgPattern}>
            {/* Alternar Cards ⇄ Lista */}
            <div className="ppv-visao-linha" style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 6, padding: "10px 16px 0" }}>
             <div className="ppv-visao" role="tablist" aria-label="Visão">
              <button type="button" role="tab" aria-selected={viewMode === "cards"} className={`ppv-visao-bt ${viewMode === "cards" ? "on" : ""}`} onClick={() => trocarViewMode("cards")} title="Ver em cards"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #e2ddd3", background: viewMode === "cards" ? "#e8730c" : "#fff", color: viewMode === "cards" ? "#fff" : "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <i className="fas fa-table-cells-large" /> Cards
              </button>
              <button type="button" role="tab" aria-selected={viewMode === "lista"} className={`ppv-visao-bt ${viewMode === "lista" ? "on" : ""}`} onClick={() => trocarViewMode("lista")} title="Ver em lista"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #e2ddd3", background: viewMode === "lista" ? "#e8730c" : "#fff", color: viewMode === "lista" ? "#fff" : "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <i className="fas fa-list" /> Lista
              </button>
              <button type="button" role="tab" aria-selected={viewMode === "relacao"} className={`ppv-visao-bt ${viewMode === "relacao" ? "on" : ""}`} onClick={() => trocarViewMode("relacao")} title="Relação em tabela: filtros por coluna, ordenação, PDF e envio por e-mail"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #e2ddd3", background: viewMode === "relacao" ? "#e8730c" : "#fff", color: viewMode === "relacao" ? "#fff" : "#5f574c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <i className="fas fa-table-list" /> Relação
              </button>
             </div>
            </div>
            {viewMode === "relacao" ? (
              <RelacaoView orders={filteredKanban} searchTerm={searchFilter} tipoFilter={tipoFilter} onCardClick={openCardDetails} onStatusChange={podeMoverFase ? handleStatusChange : undefined} loading={globalLoading} />
            ) : (
              <PhaseView orders={filteredKanban} searchTerm={searchFilter} onCardClick={openCardDetails} onStatusChange={handleStatusChange} onAgendar={podeMoverFase ? handleAgendar : undefined} loading={globalLoading} activePhase={activePhase} onPhaseChange={setActivePhase} viewMode={viewMode} />
            )}
          </div>
        )}

        {activeTab === "dashTab" && (
          <div className="ppv-vn-aba flex-1 overflow-y-auto" style={bgPattern}>
            <DashboardPPV orders={kanbanItems} onAbrirPedido={openCardDetails} />
          </div>
        )}

        {activeTab === "catalogoTab" && (
          <div className="pecas-skin ppv-vn-aba flex-1 overflow-hidden p-2 md:p-4" style={bgPattern}>
            <CatalogoNovo userName={userProfile?.nome || ""} />
          </div>
        )}

        {activeTab === "etiquetasTab" && (
          <div className="pecas-skin ppv-vn-aba flex-1 overflow-y-auto" style={bgPattern}>
            <EtiquetasPanel embedded />
          </div>
        )}

        {activeTab === "formTab" && (
          <div className="ppv-vn-form flex-1 overflow-y-auto p-3 md:p-5" style={bgPattern}>
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
              onRestaurarVinculos={(c, id, disp) => { setClienteValue(c); setOsIdValue(id); setOsDisplayValue(disp); }}
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
        modalProdQtd={modalProdQtd}
        buscaFechadaSinal={buscaFechadaSinal}
      />

      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={handleSelectCliente} />
      <ModalBuscaOS open={buscaOSOpen} onClose={() => setBuscaOSOpen(false)} onSelect={handleSelectOS} />
      <ModalBuscaProduto open={buscaProdutoOpen} mode={buscaProdutoMode} onClose={() => { setBuscaProdutoOpen(false); if (buscaProdutoMode === "modal") setBuscaFechadaSinal((s) => s + 1); }} onSelect={handleSelectProduto} onEditManual={handleEditManual} abrirNoCatalogo={buscaProdutoCatalogo} onCriarProvisorio={handleCriarProvisorio}
        onAbrirKit={buscaProdutoMode === "modal" ? () => { setBuscaProdutoOpen(false); setKitSinal((s) => s + 1); } : undefined} />
      <ModalProdutosEstoque open={produtosEstoqueOpen} onClose={() => setProdutosEstoqueOpen(false)} onSelect={(codigo, descricao, conta, valor) => { setItemProduto({ codigo, descricao, conta: conta === "CASTRO" ? "CASTRO" : "NOVA", preco: valor }); }} />
      <ItemOrcamentoModal
        open={!!itemProduto}
        ppvId={null}
        conta={itemProduto?.conta || "NOVA"}
        codigo={itemProduto?.codigo || null}
        descricao={itemProduto?.descricao}
        quantidade={1}
        preco={itemProduto?.preco}
        userName={userProfile?.nome || ""}
        onClose={() => setItemProduto(null)}
        showToast={showToast}
      />
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
