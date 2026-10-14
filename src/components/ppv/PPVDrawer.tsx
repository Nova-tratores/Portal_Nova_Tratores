"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from "react";
import { useAlteracoesPendentes } from "@/lib/rascunho/pendencias";
import MaquinasClienteIcone from "@/components/MaquinasClienteIcone";
import { createPortal } from "react-dom";
import type { PPVDetalhes, LogEntry } from "@/lib/ppv/types";
import type { ComunicacaoSefaz } from "@/lib/ppv/omie";
import { formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { normalizarStatus } from "@/lib/ppv/utils";
import { STATUS_OPTIONS, STATUS_COLORS, type StatusKey } from "@/lib/ppv/constants";
import { api } from "@/lib/ppv/api";
import { authHeaders } from "@/lib/auth/client";
import { usePPV } from "@/lib/ppv/PPVContext";
import { useAuth } from "@/hooks/useAuth";
import ModalBuscaCliente from "./ModalBuscaCliente";
import { usePermissoes } from "@/hooks/usePermissoes";
import ModalDevolucao from "./ModalDevolucao";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import FaturarModal from "./FaturarModal";
import ItemOrcamentoModal from "./ItemOrcamentoModal";
import AnexosModal from "./AnexosModal";
import TarefasModal from "./TarefasModal";
import SelecionarUsuarioModal from "./SelecionarUsuarioModal";
import { ClienteOmieModal, SeletorTecnicos, SeletorCondicao, useListasOmie } from "@/components/pos/OSOmieAbas";
import { normalizarEspelho, espelhoPadrao, type OmieEspelho } from "@/lib/pos/omie-espelho";
import { diasDoNumParcelas, rotuloNumParcelas, categoriaPPVPelaOS, numParcelasDaOS } from "@/lib/ppv/parcelas-condicao";
import OcorrenciaFormModal from "@/components/ocorrencias/OcorrenciaFormModal";
import PPVUnidadesInfo from "./PPVUnidadesInfo";
import QRScanner, { type ScanResultado } from "@/components/pecas/QRScanner";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";

// Previsão de faturamento vazia = hoje (José, 13/10/2026), no fuso de São Paulo, "aaaa-mm-dd".
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// Abas na MESMA ordem/nome do Omie (tela "Pedido de Venda").
const ABAS_OMIE = [
  "Itens da Venda",
  "Departamentos",
  "Informações sobre",
  "Parcelas",
  "Observações",
] as const;
type AbaOmie = (typeof ABAS_OMIE)[number];
// Aba extra: só aparece depois de faturar (mostra os dados da NF-e / SEFAZ).
const ABA_SEFAZ = "Comunicação com a SEFAZ";

// ── Parcelas (igual ao Omie): a "Previsão de Faturamento" é a data-base; o
// "Número de Parcelas" define os vencimentos (dias) e o rateio; a aba Parcelas é
// gerada daí — cada parcela: nº, dias, vencimento (= previsão + dias), %, valor.
function addDiasISO(previsaoISO: string, dias: number): string {
  const base = previsaoISO ? new Date(previsaoISO + "T00:00:00") : new Date();
  base.setDate(base.getDate() + dias);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
// vencimento em ISO (YYYY-MM-DD) pro <input type=date>; a UI edita data e valor.
interface ParcelaCalc { numero: number; dias: number; vencimento: string; percentual: number; valor: number }
function calcularParcelas(cond: string, previsaoISO: string, total: number): ParcelaCalc[] {
  const dias = diasDoNumParcelas(cond);
  const n = dias.length;
  const base = Math.floor((total / n) * 100) / 100; // valor por parcela (arredonda p/ baixo)
  return dias.map((d, i) => {
    const ultima = i === n - 1;
    const valor = ultima ? Math.round((total - base * (n - 1)) * 100) / 100 : base; // última absorve o resto
    const percentual = total > 0 ? Math.round((valor / total) * 10000) / 100 : Math.round((100 / n) * 100) / 100;
    return { numero: i + 1, dias: d, vencimento: addDiasISO(previsaoISO, d), percentual, valor };
  });
}

interface Props {
  open: boolean;
  ppvId: string | null;
  onClose: () => void;
  onBuscaProduto: () => void;
  onAbrirCatalogo: () => void;
  onBuscaOS: () => void;
  onBuscaCliente: () => void;
  modalOSId: string;
  modalOSDisplay: string;
  modalProdDisplay: string;
  modalProdCodigo?: string;
  onModalProdDisplayChange: (v: string) => void;
  onSetModalOS: (id: string, display: string) => void;
  modalClienteNome: string;
  onClienteConsumido?: () => void; // limpa o nome no pai depois de aplicado (ver useEffect)
  onDirty?: () => void;
  /** Incrementa quando o modal "Novo Item" pede pra abrir o Importar Kit. */
  kitSinal?: number;
  /** Quantidade escolhida no dialog do "Novo Item" (padrão 1). */
  modalProdQtd?: number;
  /** Incrementa quando o "Novo Item" FECHA → aplica as adições de uma vez (sem piscar durante). */
  buscaFechadaSinal?: number;
}

export default function PPVDrawer({
  open, ppvId, onClose, onBuscaProduto, onAbrirCatalogo, onBuscaOS, onBuscaCliente,
  modalOSId, modalOSDisplay, modalProdDisplay, modalProdCodigo,
  onModalProdDisplayChange, onSetModalOS,
  modalClienteNome, onClienteConsumido, onDirty, kitSinal, modalProdQtd, buscaFechadaSinal,
}: Props) {
  const { tecnicos, productCache, showToast } = usePPV();
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('ppv', 'editar');
  const podeItem = pode('ppv', 'adicionar_item');
  const podeOmie = pode('ppv', 'enviar_omie');
  const podeFaturar = pode('ppv', 'faturar');
  // Ocorrência rápida por PV (categoria PV pré-selecionada)
  const podeOcorrencia = pode('painel-mecanicos', 'criar_ocorrencia');
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  // Rastreio de unidades: liberação por QR + scan-to-add
  const podeLiberarQR = pode('ppv', 'rastreio_liberar');
  const [scanAddAberto, setScanAddAberto] = useState(false);
  // muda pra re-buscar o card de peças rastreadas depois de um scan
  const [unidadesVersao, setUnidadesVersao] = useState(0);

  const [details, setDetails] = useState<PPVDetalhes | null>(null);
  const [status, setStatus] = useState("Orçamento");
  const [tecnico, setTecnico] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [showCliInfo, setShowCliInfo] = useState(false); // popover de dados do cliente (hover)
  // clipe ao lado do nome: cadastro do cliente no Omie (mesmo modal da OS)
  const [cliOmie, setCliOmie] = useState<{ aberto: boolean; dados: Record<string, unknown> | null; doc: string }>({ aberto: false, dados: null, doc: "" });
  const abrirCliOmie = async () => {
    const doc = String(clienteDocumento || clienteDoc || "").trim();
    if (cliOmie.doc === doc && cliOmie.dados) { setCliOmie((c) => ({ ...c, aberto: true })); return; }
    setCliOmie({ aberto: true, dados: null, doc: "" });
    try {
      const r = await fetch(`/api/pos/omie-listas?so=cliente&cnpj=${encodeURIComponent(doc)}`, { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      setCliOmie({ aberto: true, dados: j.cliente || null, doc });
    } catch { setCliOmie({ aberto: true, dados: null, doc }); }
  };
  const [tipoPedido, setTipoPedido] = useState("Pedido");
  const [projeto, setProjeto] = useState("");
  // Projetos do banco (cronograma) — pra escolher em vez de digitar / usar o da OS
  const [projetosDB, setProjetosDB] = useState<{ nome: string }[]>([]);
  const [projDropdown, setProjDropdown] = useState(false);
  const [projBusca, setProjBusca] = useState("");
  const [usarProjetoOS, setUsarProjetoOS] = useState(true); // puxar o projeto da OS quando vazio
  const [motivoSaida, setMotivoSaida] = useState("Venda Balcão");
  const [observacao, setObservacao] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [temSubstituto, setTemSubstituto] = useState(false);
  const [substitutoTipo, setSubstitutoTipo] = useState<"POS" | "PPV">("POS");
  const [substitutoId, setSubstitutoId] = useState("");
  const [listaOSAbertas, setListaOSAbertas] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [listaPPVAbertos, setListaPPVAbertos] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [pedidoOmie, setPedidoOmie] = useState("");
  // PDF oficial do pedido no Omie (dfedocs · ObterPedVenda)
  const [baixandoPdfOmie, setBaixandoPdfOmie] = useState(false);
  const abrirPdfOmiePPV = useCallback(async () => {
    if (!ppvId || baixandoPdfOmie) return;
    setBaixandoPdfOmie(true);
    const win = window.open("", "_blank"); // abre no clique (evita bloqueio de pop-up)
    try {
      const r = await fetch(`/api/ppv/pedidos/pdf-omie?id=${encodeURIComponent(ppvId)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { win?.close(); showToast("error", d.error || "Não consegui obter o PDF do pedido no Omie."); return; }
      if (win) win.location.href = d.url; else window.open(d.url, "_blank");
    } catch {
      win?.close(); showToast("error", "Erro de conexão ao buscar o PDF no Omie.");
    } finally { setBaixandoPdfOmie(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppvId, baixandoPdfOmie]);
  const [faturadoEm, setFaturadoEm] = useState("");
  const [showFaturar, setShowFaturar] = useState(false);
  const [osVinc, setOsVinc] = useState<{ ordemOmie: string; status: string; tipoServico?: string; requisicoes: Array<{ id: string; valor: number; material: string }> } | null>(null);
  useEffect(() => {
    const id = (modalOSId || "").trim();
    if (!ppvId || !id) { setOsVinc(null); return; }
    let ativo = true;
    fetch(`/api/pos/ordens/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ativo || !d) return;
        // PPV com OS: categoria segue a OS (revisão → Revenda de Peças Revisão)
        setInfoCategoria(categoriaPPVPelaOS(String(d.tipoServico || "")));
        // previsão e número de parcelas: os mesmos da OS (José, 14/10/2026)
        setPrevisaoFat(String(d.previsaoFaturamento || "").slice(0, 10) || hojeSP());
        setNumParcelas(numParcelasDaOS(normalizarEspelho(d.omieEspelho, espelhoPadrao({ interna: !!d.servicoInterno }))));
        setOsVinc({
          ordemOmie: String(d.ordemOmie || ""), status: String(d.status || ""), tipoServico: String(d.tipoServico || ""),
          requisicoes: (d.infoRequisicoes || []).map((r: { id: string; valor?: number; material?: string }) => ({ id: String(r.id), valor: Number(r.valor) || 0, material: String(r.material || "") })),
        });
      })
      .catch(() => { /* sem OS */ });
    return () => { ativo = false; };
  }, [ppvId, modalOSId]);
  const imprimirOSVinc = useCallback(() => {
    const id = (modalOSId || "").trim();
    if (!id) return;
    const w = window.open("", "_blank");
    if (!w) return;
    fetch(`/api/pos/ordens/${encodeURIComponent(id)}/print?pecas=1`)
      .then((r) => r.text()).then((html) => { w.document.write(html); w.document.close(); })
      .catch(() => w.close());
  }, [modalOSId]);
  const [cancelarOpen, setCancelarOpen] = useState(false);   // modal que pede o motivo do cancelamento
  const [cancelMotivo, setCancelMotivo] = useState("");
  // Trocar a fase pra "Cancelada" pelo seletor passa pelo MESMO modal do motivo
  // (não deixa cancelar sem motivo — e cancela certo no Omie também).
  const mudarStatusPPV = (novo: string) => {
    if (novo === "Cancelada" && status !== "Cancelada") {
      setCancelMotivo(motivoCancelamento);
      setCancelarOpen(true);
      return;
    }
    setStatus(novo);
  };
  const [cancelando, setCancelando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [codCopiado, setCodCopiado] = useState<string | null>(null); // feedback do "copiar código"
  const [showAnexos, setShowAnexos] = useState(false);
  const [showTarefas, setShowTarefas] = useState(false);
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [anexosCount, setAnexosCount] = useState(0);
  const [custoCMC, setCustoCMC] = useState(0);       // soma do CMC (custo) de todos os itens
  const [cmcPorItem, setCmcPorItem] = useState<Record<string, number>>({}); // CMC unitário por código (coluna da tabela)
  const [custoLoading, setCustoLoading] = useState(false);
  const [showVendedor, setShowVendedor] = useState(false);   // modal de escolha do vendedor
  const [itemSelecionado, setItemSelecionado] = useState<string | null>(null); // linha selecionada
  const [qtdExtra, setQtdExtra] = useState(1);
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [importandoKit, setImportandoKit] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [autoSalvando, setAutoSalvando] = useState(false); // overlay ao auto-salvar no fechar
  const [addingExtra, setAddingExtra] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [enviandoOmie, setEnviandoOmie] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const [devolucaoProd, setDevolucaoProd] = useState<{ codigo: string; descricao: string; preco: number; max: number } | null>(null);
  const [detalheProd, setDetalheProd] = useState<{ codigo: string; descricao: string; conta: "NOVA" | "CASTRO"; quantidade: number; preco: number } | null>(null);
  const [confirmandoDev, setConfirmandoDev] = useState(false);

  const [editandoPrecoCod, setEditandoPrecoCod] = useState<string | null>(null);
  const [editandoPrecoVal, setEditandoPrecoVal] = useState("");
  const [salvandoPreco, setSalvandoPreco] = useState(false);
  const [desconto, setDesconto] = useState(0); // sempre guardado em % (fonte de verdade)
  const [descontoModo, setDescontoModo] = useState<"pct" | "valor">("pct"); // lápis alterna % / R$

  // ── Espelho do Omie: aba ativa + campos NOVOS (placeholder; // TODO: ligar ao banco) ──
  const [abaAtiva, setAbaAtiva] = useState<string>("Itens da Venda");
  // Comunicação com a SEFAZ (só aparece depois de faturar) — dados da NF-e
  const [sefaz, setSefaz] = useState<ComunicacaoSefaz | null>(null);
  const [sefazLoading, setSefazLoading] = useState(false);
  const [danfeLoading, setDanfeLoading] = useState(false);
  const [previsaoFat, setPrevisaoFat] = useState("");       // Previsão de Faturamento (data)
  const [cenarioFiscal, setCenarioFiscal] = useState(""); // Cenário Fiscal (código do Omie)
  const [numParcelas, setNumParcelas] = useState("30 dias");   // Número de Parcelas
  const listasOmiePPV = useListasOmie(open, "", "");
  const [parcelas, setParcelas] = useState<ParcelaCalc[]>([]);  // Parcelas editáveis (data/valor por parcela)
  const [departamentos, setDepartamentos] = useState<{ codigo: string; estrutura: string; descricao: string }[]>([]);
  const [distDeptos, setDistDeptos] = useState<Record<string, number>>({});  // codigo -> % da distribuição
  // Informações Adicionais (Omie) — listas do banco + campos (placeholder; ligar ao envio depois)
  const [listasPedido, setListasPedido] = useState<{ categorias: { codigo: string; descricao: string }[]; contasCorrentes: { codigo: string; descricao: string }[]; etapas: { codigo: string; descricao: string }[]; cenarios: { codigo: string; descricao: string; segmentos?: string }[] }>({ categorias: [], contasCorrentes: [], etapas: [], cenarios: [] });
  const [cenarioAberto, setCenarioAberto] = useState(false); // dropdown custom do Cenário Fiscal
  const [infoCategoria, setInfoCategoria] = useState("1.01.03");   // default: Revenda de Peças Balcão
  const [infoContaCorrente, setInfoContaCorrente] = useState("");  // default definido ao carregar (Bradesco)
  const [infoNumContrato, setInfoNumContrato] = useState("");
  const [infoContato, setInfoContato] = useState("");
  const [infoDadosNF, setInfoDadosNF] = useState("");
  const [infoConsumoFinal, setInfoConsumoFinal] = useState(false);

  // Carregar listas para dropdown de substituto
  useEffect(() => {
    if (!temSubstituto) return;
    if (substitutoTipo === "POS" && listaOSAbertas.length === 0) {
      // /api/pos/ordens devolve KanbanCard[] (campos minúsculos: id/cliente/status)
      fetch("/api/pos/ordens").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaOSAbertas(data.filter((o: any) => o.status !== "Cancelada" && o.status !== "Concluída").map((o: any) => ({ id: String(o.id), cliente: o.cliente || "", status: o.status || "" })));
      }).catch(() => {});
    }
    if (substitutoTipo === "PPV" && listaPPVAbertos.length === 0) {
      fetch("/api/ppv/pedidos").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaPPVAbertos(data.filter((p: any) => p.status !== "Cancelada" && p.status !== "Concluída" && p.status !== "Cancelado" && p.status !== "Fechado" && p.id !== ppvId).map((p: any) => ({ id: p.id, cliente: p.cliente || "", status: p.status || "" })));
      }).catch(() => {});
    }
  }, [temSubstituto, substitutoTipo]);

  const carregarDadosCliente = useCallback(async (nome: string) => {
    if (!nome) { setClienteDoc(""); setClienteEndereco(""); setClienteCidade(""); setClienteTelefone(""); setClienteEmail(""); return; }
    try {
      const res = await api.buscarClientePorNome(nome);
      setClienteDoc(res.documento || "");
      setClienteEndereco(res.endereco || "");
      setClienteCidade(res.cidade || "");
      setClienteTelefone(res.telefone || "");
      setClienteEmail(res.email || "");
    } catch {
      setClienteDoc(""); setClienteEndereco(""); setClienteCidade(""); setClienteTelefone(""); setClienteEmail("");
    }
  }, []);

  const carregarDetalhes = useCallback(async (id: string) => {
    setLoadingData(true);
    setSefaz(null); // zera a NF-e cacheada em memória ao trocar de pedido
    try {
      const d = await api.buscarPedido(id);
      setDetails(d);
      setStatus(d.status || "Aguardando");
      setTecnico(d.tecnico || "");
      setCliente(d.cliente || "");
      setTipoPedido(d.tipoPedido || "Pedido");
      setProjeto(d.projeto || "");
      // OS vinculada + projeto vazio ⇒ optaram por não puxar da OS (ou a OS não tem) —
      // deixa o "usar da OS" desligado pra não re-copiar ao salvar.
      setUsarProjetoOS(!((d.osId || "").trim() && !(d.projeto || "").trim()));
      setMotivoSaida(d.motivoSaida || "Venda Balcão");
      setObservacao(d.observacao || "");
      setMotivoCancelamento(d.motivoCancelamento || "");
      setTemSubstituto(!!(d.substitutoTipo && d.substitutoId));
      setSubstitutoTipo((d.substitutoTipo === "POS" || d.substitutoTipo === "PPV") ? d.substitutoTipo : "POS");
      setSubstitutoId(d.substitutoId || "");
      setPedidoOmie(d.pedidoOmie || "");
      setFaturadoEm(d.faturadoOmieEm || "");
      setDesconto(d.desconto || 0);
      onSetModalOS(d.osId || "", d.osId ? `OS #${d.osId} (Vinculada)` : "");
      // Campos do espelho Omie (Informações Adicionais + distribuição) — se já salvos.
      if (d.categoriaPedido) setInfoCategoria(d.categoriaPedido);
      if (d.contaCorrente) setInfoContaCorrente(d.contaCorrente);
      if (d.cenarioFiscal) setCenarioFiscal(d.cenarioFiscal);
      if (d.numParcelas) setNumParcelas(d.numParcelas);
      // sem OS: a previsão é sempre o dia de hoje ao abrir (José, 14/10/2026); com OS, segue a OS
      setPrevisaoFat(d.osId ? (d.previsaoFaturamento ? String(d.previsaoFaturamento).slice(0, 10) : hojeSP()) : hojeSP());
      setInfoNumContrato(d.numContrato || "");
      setInfoContato(d.contato || "");
      setInfoDadosNF(d.dadosNF || "");
      setInfoConsumoFinal(!!d.consumoFinal);
      if (Array.isArray(d.departamentos) && d.departamentos.length > 0) {
        setDistDeptos(Object.fromEntries(d.departamentos.map((x) => [x.codigo, x.perc])));
      }
      // Cliente: se o pedido já guarda o DOCUMENTO, usa ele (sem ambiguidade de homônimo).
      // Senão cai na busca por nome (pedidos antigos).
      const doc = (d.clienteDocumento || "").trim();
      setClienteDocumento(doc);
      if (doc) {
        setClienteDoc(doc);
        api.buscarClientePorDocumento(doc)
          .then((res) => { setClienteEndereco(res.endereco || ""); setClienteCidade(res.cidade || ""); })
          .catch(() => { setClienteEndereco(""); setClienteCidade(""); });
      } else {
        carregarDadosCliente(d.cliente || "");
      }
      // Auto-detecta faturamento feito no Omie: se está "Enviado Omie" mas já
      // foi faturado lá (etapa >= 60), o portal marca "Faturado" sozinho.
      if ((d.status || "") === "Enviado Omie" && (d.pedidoOmie || "").trim()) {
        (async () => {
          try {
            const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(id)}&sync=1`, { headers: { ...(await authHeaders()) } });
            const j = await r.json();
            if (r.ok && j?.faturado) { setStatus("Concluída"); setFaturadoEm(new Date().toISOString()); onDirty?.(); }
          } catch { /* silencioso */ }
        })();
      }
    } catch {
      showToast("error", "Erro ao carregar detalhes");
    }
    setLoadingData(false);
  }, [showToast, onSetModalOS, carregarDadosCliente, onDirty]);

  const carregarHistorico = useCallback(async () => {
    if (!ppvId) return;
    setLogsLoading(true);
    try { setLogs(await api.buscarHistorico(ppvId)); } catch { setLogs([]); }
    setLogsLoading(false);
  }, [ppvId]);

  // Comunicação com a SEFAZ (NF-e): cache-first; refresh força reconsulta no Omie.
  const carregarSefaz = useCallback(async (refresh = false) => {
    if (!ppvId) return;
    setSefazLoading(true);
    try {
      const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(ppvId)}${refresh ? "&refresh=1" : ""}`, { headers: { ...(await authHeaders()) } });
      const j = await r.json();
      if (!r.ok) { showToast("error", j?.error || "Erro ao carregar a comunicação com a SEFAZ."); setSefaz({ faturado: false, eventos: [], erro: j?.error }); }
      else setSefaz(j as ComunicacaoSefaz);
    } catch (e) {
      console.error("[PPV SEFAZ]", e);
      showToast("error", "Erro ao carregar a comunicação com a SEFAZ.");
    }
    setSefazLoading(false);
  }, [ppvId, showToast]);
  // NF-e faturada mas sem número ainda: relê a SEFAZ a cada 15 s (até 10 min com o pedido aberto)
  const aguardandoNF = !!faturadoEm && !sefaz?.numero && tipoPedido !== "Remessa";
  useEffect(() => {
    if (!aguardandoNF || !ppvId) return;
    const inicio = Date.now();
    const t = setInterval(() => {
      if (Date.now() - inicio > 10 * 60_000) { clearInterval(t); return; }
      void carregarSefaz(true);
    }, 15_000);
    return () => clearInterval(t);
  }, [aguardandoNF, ppvId, carregarSefaz]);
  const nfPedidoPedida = useRef("");
  useEffect(() => {
    if (!ppvId || !pedidoOmie || tipoPedido === "Remessa") return;
    if (nfPedidoPedida.current === ppvId + pedidoOmie) return; // uma vez por pedido aberto
    nfPedidoPedida.current = ppvId + pedidoOmie;
    void carregarSefaz(false);
  }, [ppvId, pedidoOmie, tipoPedido, carregarSefaz]);

  // Carrega a NF-e quando a aba SEFAZ é aberta (uma vez; botão "Atualizar" refaz).
  useEffect(() => {
    if (abaAtiva === ABA_SEFAZ && !sefaz && !sefazLoading) carregarSefaz(false);
  }, [abaAtiva, sefaz, sefazLoading, carregarSefaz]);

  // Abrir o DANFE (PDF) numa nova aba — URL temporária gerada sob demanda.
  const abrirDanfe = useCallback(async () => {
    if (!ppvId) return;
    setDanfeLoading(true);
    try {
      const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(ppvId)}&danfe=1`, { headers: { ...(await authHeaders()) } });
      const j = await r.json();
      if (!r.ok || !j.url) showToast("error", j?.error || "Não consegui gerar o DANFE.");
      else window.open(j.url, "_blank", "noopener");
    } catch { showToast("error", "Não consegui gerar o DANFE."); }
    setDanfeLoading(false);
  }, [ppvId, showToast]);

  // (o PDF do pedido no Omie sai por abrirPdfOmiePPV — botão único "PDF PV")

  // Troca de cliente: o modal vive DENTRO do drawer e escreve direto no estado.
  // IMPORTANTE: guardamos o DOCUMENTO (CNPJ/CPF), não só o nome. Existem clientes
  // HOMÔNIMOS com CNPJs diferentes (um ativo, um inativo) — com só o nome, trocar de um
  // pro outro gravava o mesmo texto (nada mudava) e o CNPJ vinha sempre do 1º match.
  const [buscaClienteOpen, setBuscaClienteOpen] = useState(false);
  const [clienteDocumento, setClienteDocumento] = useState(""); // documento salvo no pedido
  const aplicarCliente = useCallback((nome: string, documento?: string) => {
    if (!nome) return;
    setCliente(nome);
    setBuscaClienteOpen(false);
    const doc = (documento || "").trim();
    setClienteDocumento(doc);
    if (doc) {
      // Com o documento em mãos, busca os dados DESSE cliente (sem ambiguidade de nome)
      setClienteDoc(doc);
      api.buscarClientePorDocumento(doc)
        .then((res) => { setClienteEndereco(res.endereco || ""); setClienteCidade(res.cidade || ""); setClienteTelefone(res.telefone || ""); setClienteEmail(res.email || ""); })
        .catch(() => { setClienteEndereco(""); setClienteCidade(""); setClienteTelefone(""); setClienteEmail(""); });
    } else {
      carregarDadosCliente(nome);
    }
  }, [carregarDadosCliente]);

  // Compat: se o pai ainda mandar um nome (fluxo antigo), aplica também.
  useEffect(() => {
    if (modalClienteNome && open) {
      setCliente(modalClienteNome);
      carregarDadosCliente(modalClienteNome);
      onClienteConsumido?.();
    }
  }, [modalClienteNome, open, carregarDadosCliente, onClienteConsumido]);

  // Carrega do banco SÓ quando abre ou troca de pedido. Antes dependia de
  // carregarDetalhes (que muda de identidade a cada render do pai): o refresh do
  // kanban (60 s / volta pra aba / toast sumindo) recarregava a janela e APAGAVA o
  // que a pessoa tinha digitado e não salvo. (07/10/2026)
  // Digitou algo e ainda não salvou? (impede o portal de recarregar por cima e
  // pergunta antes de fechar a página)
  const [editou, setEditou] = useState(false);
  useAlteracoesPendentes("ppv-drawer", open && editou);
  const carregarDetalhesRef = useRef(carregarDetalhes);
  useEffect(() => { carregarDetalhesRef.current = carregarDetalhes; });
  useEffect(() => {
    if (open && ppvId) {
      setShowLogs(false);
      setShowAnexos(false);
      setEditou(false);
      carregarDetalhesRef.current(ppvId);
    }
  }, [open, ppvId]);

  // Modal "Novo Item" pediu o Importar Kit (botão com legenda ao lado da busca)
  useEffect(() => {
    if (kitSinal && open && ppvId) setKitModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitSinal]);

  // Produto escolhido no modal "Novo Item" → adiciona no pedido com a QTD
  // escolhida no dialog. O modal fica aberto. A adição é SILENCIOSA: a lista
  // do pedido (atrás do modal) NÃO re-renderiza a cada item — o resultado
  // fica pendente e é aplicado de uma vez quando o modal fecha (sem piscar).
  const autoAddRef = useRef(false);
  const detailsPendentesRef = useRef<typeof details | null>(null);
  useEffect(() => {
    if (!open || !ppvId || !modalProdCodigo || !modalProdDisplay || autoAddRef.current) return;
    autoAddRef.current = true;
    addExtra({ qtd: modalProdQtd, silencioso: true }).finally(() => { autoAddRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalProdCodigo, modalProdDisplay]);

  // "Novo Item" fechou → aplica as adições acumuladas de uma vez só
  useEffect(() => {
    if (!buscaFechadaSinal) return;
    if (detailsPendentesRef.current) {
      setDetails(detailsPendentesRef.current);
      detailsPendentesRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaFechadaSinal]);

  // Conta anexos/comentários (pra bolinha vermelha no botão Anexos)
  const recarregarAnexosCount = useCallback(() => {
    if (!ppvId) { setAnexosCount(0); return; }
    api.listarAnexos(ppvId).then((r) => setAnexosCount(r.anexos.length)).catch(() => setAnexosCount(0));
  }, [ppvId]);
  useEffect(() => { if (open && ppvId) recarregarAnexosCount(); }, [open, ppvId, recarregarAnexosCount]);

  const recarregarTarefasCount = useCallback(async () => {
    if (!ppvId) { setTarefasPendentes(0); return; }
    try {
      const r = await fetch(`/api/ppv/tarefas?id=${encodeURIComponent(ppvId)}`, { headers: { ...(await authHeaders()) } });
      const j = await r.json();
      setTarefasPendentes(r.ok ? (j.pendentes || 0) : 0);
    } catch { setTarefasPendentes(0); }
  }, [ppvId]);
  useEffect(() => { if (open && ppvId) recarregarTarefasCount(); }, [open, ppvId, recarregarTarefasCount]);
  // Veio da notificação da tarefa (?tarefas=1) → abre o modal de tarefas.
  useEffect(() => {
    if (open && ppvId && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tarefas") === "1") {
      setShowTarefas(true);
    }
  }, [open, ppvId]);

  // Custo Total (CMC): soma o CMC × saldo de cada item, lido DO BANCO pela conta
  // certa de cada item (rota /api/ppv/custo-cmc). Sem bater no Omie (que atrasa/
  // bloqueia) e sem "1ª conta que responder" (que pegava o CMC da conta errada).
  useEffect(() => {
    if (!open || !details) { setCustoCMC(0); return; }
    let cancel = false;
    (async () => {
      setCustoLoading(true);
      const devs = details.devolucoes || [];
      const itens = (details.produtos || [])
        .map((p) => ({
          codigo: p.codigo,
          conta: (p.empresa || "").toLowerCase().includes("primari") ? "CASTRO" : "NOVA",
          qtd: p.quantidade - devs.filter((x) => x.codigo === p.codigo).reduce((a, c) => a + c.quantidade, 0),
        }))
        .filter((p) => p.qtd > 0);
      try {
        const r = await fetch(`/api/ppv/custo-cmc`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ itens }),
        });
        const j = await r.json();
        if (!cancel) {
          setCustoCMC(r.ok ? (Number(j.total) || 0) : 0);
          const m: Record<string, number> = {};
          if (r.ok) (j.itens || []).forEach((d: { codigo: string; cmc: number }) => { m[d.codigo] = Number(d.cmc) || 0; });
          setCmcPorItem(m);
        }
        if (!r.ok) console.error("[PPV custo-cmc]", j?.error);
      } catch (e) {
        if (!cancel) { console.error("[PPV custo-cmc]", e); setCustoCMC(0); }
      }
      if (!cancel) setCustoLoading(false);
    })();
    return () => { cancel = true; };
  }, [open, details]);

  useEffect(() => {
    if (showLogs && ppvId) carregarHistorico();
  }, [showLogs, ppvId, carregarHistorico]);

  // Calcular totais
  let tOrig = 0, tDev = 0;
  const produtosComSaldo = (details?.produtos || []).map((p) => {
    const qtdDev = (details?.devolucoes || []).filter((x) => x.codigo === p.codigo).reduce((acc, cur) => acc + cur.quantidade, 0);
    const saldo = p.quantidade - qtdDev;
    tOrig += p.quantidade * p.preco;
    tDev += qtdDev * p.preco;
    return { ...p, saldo, qtdDev };
  });
  const totalSemDesconto = tOrig - tDev;
  const valorDesconto = totalSemDesconto * (desconto / 100);
  const totalFinal = totalSemDesconto - valorDesconto;

  // Regenera as parcelas quando muda a condição, a previsão ou o total (reseta
  // edições manuais nesses casos, igual ao Omie). Datas/valores por parcela são
  // editáveis abaixo (na aba Parcelas).
  useEffect(() => {
    setParcelas(calcularParcelas(numParcelas, previsaoFat, totalFinal));
  }, [numParcelas, previsaoFat, totalFinal]);

  // Conta Omie do pedido = maioria dos itens (mesma regra do envio em
  // lib/ppv/omie.ts): item da "Primária/Castro" conta pro CASTRO.
  // Os cenários fiscais são POR CONTA — o Castro tem "Padrão", a Nova "VENDA".
  const contaPedido = useMemo(() => {
    let nova = 0, castro = 0;
    (details?.produtos || []).forEach((p) => {
      if (!p.empresa) return;
      if (/primari|castro/i.test(p.empresa)) castro += 1; else nova += 1;
    });
    return castro > nova ? "CASTRO" : "NOVA";
  }, [details]);

  // Departamentos + listas (categorias/contas/etapas/cenários) do banco —
  // recarrega se a conta do pedido mudar (itens do Castro chegaram depois).
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const h = { ...(await authHeaders()) };
        const [rd, rl] = await Promise.all([
          fetch(`/api/ppv/departamentos`, { headers: h }),
          fetch(`/api/ppv/listas-pedido?conta=${contaPedido}`, { headers: h }),
        ]);
        const jd = await rd.json();
        if (rd.ok) setDepartamentos(jd.departamentos || []); else console.error("[PPV departamentos]", jd?.error);
        const jl = await rl.json();
        if (rl.ok) {
          setListasPedido(jl);
          // Conta corrente começa no Bradesco (se o usuário ainda não escolheu).
          const br = (jl.contasCorrentes || []).find((c: { descricao?: string }) => /bradesco/i.test(c.descricao || ""));
          if (br) setInfoContaCorrente((prev) => prev || br.codigo);
          // Cenário fiscal padrão da conta: "Padrão" no Castro, "VENDA" na Nova.
          // Se o cenário salvo não existir/estiver inativo nesta conta (ex.:
          // VENDA da Nova num pedido do Castro), troca pelo padrão da conta —
          // evita o erro do Omie "Cenário Fiscal está inativo".
          const cens: { codigo: string; descricao?: string }[] = jl.cenarios || [];
          const alvo = contaPedido === "CASTRO" ? /padr/i : /^venda\b/i;
          const def = cens.find((c) => alvo.test(c.descricao || "")) || cens[0];
          setCenarioFiscal((prev) => {
            if (prev && cens.some((c) => c.codigo === prev)) return prev;
            return def?.codigo || prev;
          });
        } else console.error("[PPV listas-pedido]", jl?.error);
      } catch (e) { console.error("[PPV listas]", e); }
    })();
  }, [open, contaPedido]);

  // Marca/desmarca um departamento e redistribui igualmente entre os selecionados.
  const toggleDepto = (codigo: string) => {
    setDistDeptos((prev) => {
      const next = { ...prev };
      if (codigo in next) delete next[codigo]; else next[codigo] = 0;
      const cods = Object.keys(next);
      const n = cods.length;
      if (n > 0) { const eq = Math.floor((100 / n) * 100) / 100; cods.forEach((c, i) => { next[c] = i === n - 1 ? Math.round((100 - eq * (n - 1)) * 100) / 100 : eq; }); }
      return next;
    });
  };
  const somaDeptos = Object.values(distDeptos).reduce((s, p) => s + (p || 0), 0);

  const statusNorm = normalizarStatus(status) as StatusKey;
  const statusColor = STATUS_COLORS[statusNorm] || { text: "var(--portal-text-secondary)", bg: "var(--portal-bg-card)" };

  async function salvar() {
    if (!podeEditar) { showToast("error", "Você não tem permissão para editar pedidos."); return; }
    const erros: string[] = [];
    if (!cliente.trim()) erros.push("Cliente");
    if (!tecnico.trim()) erros.push("Técnico");
    if (status === "Cancelada" && !motivoCancelamento.trim()) erros.push("Motivo do Cancelamento");
    if (status === "Cancelada" && temSubstituto && !substitutoId.trim()) erros.push("ID do Substituto");
    if (status === "Concluída" && !pedidoOmie.trim()) erros.push("Pedido OMIE");
    if (erros.length > 0) { showToast("error", `Campos obrigatórios: ${erros.join(", ")}`); return; }

    setSalvando(true);
    try {
      await api.editarPedido({
        id: ppvId!, status, observacao, tecnico, cliente, clienteDocumento, motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, projeto, usarProjetoOS, motivoSaida, userName: userProfile?.nome || "",
        substitutoTipo: temSubstituto ? substitutoTipo : null,
        substitutoId: temSubstituto ? substitutoId : null,
        desconto,
        categoriaPedido: infoCategoria, contaCorrente: infoContaCorrente, cenarioFiscal, previsaoFaturamento: previsaoFat || hojeSP(), numParcelas,
        numContrato: infoNumContrato, contato: infoContato, dadosNF: infoDadosNF, consumoFinal: infoConsumoFinal,
        departamentos: Object.entries(distDeptos).map(([codigo, perc]) => ({ codigo, perc })),
      });
      if (!previsaoFat) setPrevisaoFat(hojeSP());
      showToast("success", "Atualizado com sucesso!");
      setEditou(false);
      onDirty?.();
      if (showLogs) carregarHistorico(); // atualiza o histórico se estiver aberto
      // NÃO fecha o modal — o usuário continua editando.
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setSalvando(false);
  }

  async function addExtra(opts?: { qtd?: number; silencioso?: boolean }) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    const c = modalProdDisplay.split(" - ")[0].trim();
    const quantidade = opts?.qtd && opts.qtd > 0 ? opts.qtd : qtdExtra;
    if (!c || quantidade < 1) { showToast("error", "Dados inválidos"); return; }
    const cached = productCache[c] || { descricao: "ITEM MANUAL", preco: 0 };
    setAddingExtra(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId!, codigo: c, descricao: cached.descricao, quantidade, preco: cached.preco, tecnico: details?.tecnico || "", tipoMovimento: "Saída", userName: userProfile?.nome || "" });
      if (opts?.silencioso) {
        // Vindo do "Novo Item": não re-renderiza a lista atrás do modal (evita
        // o pisca) nem mostra toast no canto — a confirmação sai no próprio modal.
        detailsPendentesRef.current = d;
      } else {
        setDetails(d);
        showToast("success", "Item adicionado");
      }
      onModalProdDisplayChange("");
      setQtdExtra(1); // volta pra 1: senão fica a última qtd e a pessoa lança demais
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setAddingExtra(false);
  }

  // Scan-to-add: VINCULA primeiro (código já é item do pedido → só reserva a
  // unidade, sem duplicar a quantidade); código novo (422) → aí sim adiciona
  // 1 un E reserva. Sem o vincular-primeiro, escanear as 2 unidades físicas
  // de um item já lançado com qtde 2 dobraria o pedido pra 4 un.
  async function scanAdicionarUnidade(unidadeId: string): Promise<ScanResultado> {
    if (!ppvId) return { ok: false, mensagem: "Salve o pedido antes de escanear." };
    try {
      const chamar = async (apenasVincular: boolean) => {
        const res = await fetch("/api/ppv/pedidos/scan-add", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ id_ppv: ppvId, unidade_id: unidadeId, apenas_vincular: apenasVincular }),
        });
        return { res, j: await res.json().catch(() => ({})) };
      };
      let { res, j } = await chamar(true);
      let adicionouItem = false;
      if (res.status === 422 && j.codigo_fora_do_ppv) {
        // código não está no pedido — o botão é "Adicionar por QR", então adiciona
        ({ res, j } = await chamar(false));
        adicionouItem = true;
      }
      if (!res.ok) return { ok: false, mensagem: j.error || "Falha ao registrar o scan." };
      if (j.ja_vinculada) return { ok: "repetida", mensagem: `${j.unidade?.numero || ""} já vinculada a este pedido` };
      try { const d = await api.buscarPedido(ppvId); if (d) setDetails(d); } catch { /* segue */ }
      setUnidadesVersao((v) => v + 1);
      onDirty?.();
      const verbo = adicionouItem || j.item_criado ? "adicionado" : "vinculado (item já estava no pedido)";
      return { ok: true, mensagem: `${j.unidade?.codigo || ""} ${verbo} (${j.unidade?.numero || ""})${j.aviso_empresa ? ` · ${j.aviso_empresa}` : ""}` };
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : "Erro no scan." };
    }
  }

  async function importarKitItens(produtos: { codigo: string; descricao: string; quantidade: number; preco: number }[], _horas?: number, rotulo?: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId || produtos.length === 0) return;
    setImportandoKit(true);
    try {
      // Uma chamada só (antes ia item a item): grava o kit inteiro marcado com o rótulo.
      const d = await api.importarKitLote({ id: ppvId, kit: rotulo || "Kit", tecnico: details?.tecnico || "", userName: userProfile?.nome || "", itens: produtos });
      if (d) setDetails(d);
      showToast("success", `Kit importado: ${produtos.length} ${produtos.length === 1 ? "item" : "itens"}`);
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao importar kit"); }
    setImportandoKit(false);
  }

  const [removendoKit, setRemovendoKit] = useState<string | null>(null);
  async function removerKitInteiro(tag: string, rotulo: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId || !confirm(`Remover o kit "${rotulo}" inteiro do PPV?`)) return;
    setRemovendoKit(tag);
    try {
      const d = await api.removerKit(ppvId, tag, userProfile?.nome || "");
      if (d) setDetails(d);
      showToast("success", "Kit removido.");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao remover kit"); }
    setRemovendoKit(null);
  }

  async function salvarPrecoItem(codigo: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId) return;
    const preco = parseFloat(editandoPrecoVal.replace(",", "."));
    if (isNaN(preco) || preco < 0) { showToast("error", "Preço inválido"); return; }
    setSalvandoPreco(true);
    try {
      const d = await api.editarPrecoItem(ppvId, codigo, preco, userProfile?.nome || "");
      setDetails(d);
      setEditandoPrecoCod(null);
      setEditandoPrecoVal("");
      showToast("success", "Preço atualizado");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setSalvandoPreco(false);
  }

  async function confirmarDevolucao(quantidade: number) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!devolucaoProd || !ppvId) return;
    setConfirmandoDev(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId, codigo: devolucaoProd.codigo, descricao: devolucaoProd.descricao, quantidade, preco: devolucaoProd.preco, tecnico: details?.tecnico || "", tipoMovimento: "Devolução", userName: userProfile?.nome || "" });
      setDetails(d);
      setDevolucaoOpen(false);
      showToast("success", "Devolução registrada!");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setConfirmandoDev(false);
  }

  async function enviarOmie() {
    if (!podeOmie) { showToast("error", "Sem permissão para enviar ao Omie."); return; }
    if (!ppvId) return;
    setEnviandoOmie(true);
    try {
      const res = await api.enviarParaOmie(ppvId, userProfile?.nome || "");
      showToast("success", `Pedido de Venda nº ${res.numeroPedido} criado no Omie. Agora dá pra faturar.`);
      setPedidoOmie(res.numeroPedido); // o botão "Enviar" vira "Faturar"
      if (status !== "Concluída" && status !== "Cancelada") setStatus("Enviado Omie"); // fase avança
      onDirty?.();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao enviar para Omie");
    }
    setEnviandoOmie(false);
  }

  async function gerarPDF() {
    if (!ppvId) return;
    setGerando(true);
    try {
      const data = await api.gerarPDF(ppvId);
      if (data.html) {
        const w = window.open("", "_blank", "width=900,height=800");
        if (w) { w.document.write(data.html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); }
      }
    } catch { showToast("error", "Erro ao gerar PDF"); }
    setGerando(false);
  }

  // Fecha o drawer SALVANDO automaticamente antes (best-effort). Pedido do usuário:
  // "mesmo sem clicar em Salvar, ao fechar salva primeiro".
  async function fecharComSalvar() {
    const podeAutoSalvar = podeEditar && !!ppvId && !!details && cliente.trim() && tecnico.trim() && !(status === "Cancelada" && !motivoCancelamento.trim());
    if (podeAutoSalvar) {
      setAutoSalvando(true); // mostra "Salvando alterações…" na tela
      const t0 = Date.now();
      try {
        await api.editarPedido({ id: ppvId!, status, observacao, tecnico, cliente, clienteDocumento, motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, projeto, usarProjetoOS, motivoSaida, userName: userProfile?.nome || "", substitutoTipo: temSubstituto ? substitutoTipo : null, substitutoId: temSubstituto ? substitutoId : null, desconto, categoriaPedido: infoCategoria, contaCorrente: infoContaCorrente, cenarioFiscal, previsaoFaturamento: previsaoFat || hojeSP(), numParcelas, numContrato: infoNumContrato, contato: infoContato, dadosNF: infoDadosNF, consumoFinal: infoConsumoFinal, departamentos: Object.entries(distDeptos).map(([codigo, perc]) => ({ codigo, perc })) });
        onDirty?.();
        setEditou(false);
      } catch { /* fecha mesmo se o auto-save falhar */ }
      // Garante que o aviso apareça por um instante (mínimo ~600ms), mesmo se salvar rápido.
      const resta = 600 - (Date.now() - t0);
      if (resta > 0) await new Promise((r) => setTimeout(r, resta));
      setAutoSalvando(false);
    }
    onClose();
  }

  // Cancelar: pede o MOTIVO antes de tudo (modal). Ao confirmar, cancela no Omie
  // (CancelarPedidoVenda) E marca a PPV como Cancelada — tudo num passo só.
  function cancelarPedido() {
    if (!podeEditar) { showToast("error", "Sem permissão."); return; }
    setCancelMotivo("");
    setCancelarOpen(true);
  }
  async function confirmarCancelamento() {
    if (!ppvId) return;
    const mot = cancelMotivo.trim();
    if (!mot) { showToast("error", "Informe o motivo do cancelamento."); return; }
    setCancelando(true);
    try {
      await api.cancelarPedido(ppvId, mot, userProfile?.nome || "");
      showToast("success", pedidoOmie ? "Pedido cancelado no Omie e no portal." : "Pedido cancelado.");
      setStatus("Cancelada");
      setMotivoCancelamento(mot);
      setCancelarOpen(false);
      onDirty?.();
      onClose();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao cancelar."); }
    setCancelando(false);
  }

  // Duplica o pedido: cria um novo PPV com o mesmo cliente, itens e valores
  // (reusa a criação normal). NÃO vincula à mesma OS (evita dois PPVs na mesma OS).
  async function duplicarPedido() {
    if (!details || !ppvId) return;
    if (!confirm(`Duplicar o pedido ${ppvId}? Cria um novo pedido com o mesmo cliente, itens e valores (sem vincular à OS).`)) return;
    setDuplicando(true);
    try {
      const produtosSelecionados = produtosComSaldo
        .filter((p) => p.saldo > 0)
        .map((p) => ({ codigo: p.codigo, descricao: p.descricao, quantidade: p.saldo, preco: p.preco }));
      const res = await api.criarPedido({
        tipoPedido, motivoSaida, tecnico, cliente, observacao,
        osId: "", valorTotal: totalFinal, produtosSelecionados,
        userName: userProfile?.nome || "", projeto, usarProjetoOS: false,
      });
      showToast("success", `Pedido duplicado: ${res.id}`);
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao duplicar"); }
    setDuplicando(false);
  }

  // Ver as informações do produto selecionado (mesmo modal do clique no código).
  function verDescricaoProduto() {
    if (!itemSelecionado) { showToast("error", "Selecione um produto (clique na descrição)."); return; }
    const p = produtosComSaldo.find((x) => x.codigo === itemSelecionado);
    if (p) setDetalheProd({ codigo: p.codigo, descricao: p.descricao, conta: (p.empresa || "").toLowerCase().includes("primari") ? "CASTRO" : "NOVA", quantidade: p.saldo, preco: p.preco });
  }
  // Excluir o produto selecionado — abre a devolução (pergunta a quantidade).
  function excluirItemSelecionado() {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!itemSelecionado) { showToast("error", "Selecione um produto (clique na descrição)."); return; }
    const p = produtosComSaldo.find((x) => x.codigo === itemSelecionado);
    if (p && p.saldo > 0) { setDevolucaoProd({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, max: p.saldo }); setDevolucaoOpen(true); }
    else showToast("error", "Este item já foi todo devolvido.");
  }

  if (!open) return null;

  // Helpers de estilo do cabeçalho Omie (extraídos p/ tipar CSS corretamente)
  const labelOmie: CSSProperties = { textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#64748b", fontSize: 12.5, display: "block", marginBottom: 5 };
  // Caixas de totais no estilo Omie (cinza, valor à direita)
  const rotOmie: CSSProperties = { fontSize: 12, color: "#6b6259", marginBottom: 4 };
  const boxOmie: CSSProperties = { background: "#eceae4", border: "1px solid #d6d0c4", borderRadius: 4, height: 34, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px", fontSize: 14, color: "#4a453d", fontVariantNumeric: "tabular-nums" };
  // Número do pedido Omie no botão da barra (sem zeros à esquerda; nunca vazio)
  const numOmie = (pedidoOmie || "").replace(/^0+/, "") || pedidoOmie || "—";
  const railTextCol: CSSProperties = { display: "flex", flexDirection: "column", gap: 3, lineHeight: 1.1, minWidth: 0 };
  const railNumPill: CSSProperties = { alignSelf: "flex-start", background: "#fff3e6", color: "#c2570a", border: "1px solid #f5c99a", borderRadius: 4, padding: "1px 7px", fontSize: 12, fontWeight: 800, letterSpacing: 0.3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const railNumPillVerde: CSSProperties = { ...railNumPill, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" };
  // Ficha da NF-e (aba SEFAZ)
  const fichaBox: CSSProperties = { display: "flex", flexDirection: "column", gap: 3, border: "1px solid #e2ddd3", borderRadius: 4, padding: "8px 10px", background: "#fbfaf7" };
  const fichaLbl: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#94a3b8" };
  const fichaVal: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "#334155" };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {autoSalvando && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "20px 28px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div className="ppv-spinner" />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#334155" }}>Salvando alterações…</div>
          </div>
        </div>
      )}
      <div className="ppv-drawer-overlay fs" onClick={fecharComSalvar} style={{ padding: 0, alignItems: "stretch", overflow: "hidden", position: "fixed", inset: 0, zIndex: 200 }}>
        <div className={`ppv-modal-container fs ppv-x-drawer ${showLogs ? "with-logs" : ""}`} onClick={(e) => e.stopPropagation()}
          style={{ width: "100vw", maxWidth: "none", height: "100vh", maxHeight: "100vh", margin: 0, borderRadius: 0 }}>
          {/* Responsivo (só layout): tabelas de colunas fixas rolam na horizontal
              DENTRO da caixa em vez de cortar; abaixo de 1200px a caixa de totais
              desce pra baixo do cabeçalho; no celular 100dvh evita que a barra
              do navegador esconda a barra de ações. ≥1200px fica igual. */}
          <style>{`
            @supports (height: 100dvh) {
              .ppv-x-drawer { height: 100dvh !important; max-height: 100dvh !important; }
              .ppv-x-drawer > .ppv-drawer { max-height: 100dvh !important; }
            }
            /* flex-shrink 0: com overflow != visible, filho de coluna com altura limitada encolhe até sumir */
            .ppv-x-drawer .ppv-tabela-itens { overflow-x: auto !important; flex-shrink: 0; -webkit-overflow-scrolling: touch; }
            .ppv-x-drawer .ppv-tabela-itens .ppv-item-linha { min-width: 1070px; }
            .ppv-x-drawer .ppv-x-scroll { overflow-x: auto; flex-shrink: 0; -webkit-overflow-scrolling: touch; }
            @media (max-width: 1199px) {
              .ppv-x-drawer .ppv-x-head { flex-direction: column; }
              .ppv-x-drawer .ppv-x-head > .os-omie-totais { min-width: 0; }
            }
            @media (min-width: 769px) and (max-width: 1199px) {
              .ppv-x-drawer .ppv-g-vendedor { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
              .ppv-x-drawer .ppv-g-empilha { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important; }
            }
          `}</style>
          <div className="ppv-drawer" style={{ maxHeight: "100vh" }} onInput={() => { if (!editou) setEditou(true); }}>
            {/* ── Barra superior (estilo Omie) ── */}
            <div className="ppv-omie-topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 22px", borderBottom: "1px solid #E2E8F0", background: "#fff", position: "sticky", top: 0, zIndex: 12, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Pedido de Venda</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#c2570a", background: "#fff3e6", border: "1px solid #f5c99a", borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>#{ppvId}</span>
                <select value={status} onChange={(e) => mudarStatusPPV(e.target.value)} disabled={!podeEditar} title="Fase do PPV"
                  style={{ fontWeight: 700, color: statusColor.text, background: statusColor.bg, width: "auto", maxWidth: 230, padding: "6px 10px", borderRadius: 8, fontSize: 13, marginBottom: 0 }}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value} style={{ color: "#0f172a", background: "#fff" }}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {podeOcorrencia && (
                  <button onClick={() => setShowOcorrencia(true)}
                    title="Registrar ocorrência ligada a este PV (falta de informação, extravio, peça danificada…)"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#c2570a", background: "#fff3e6", border: "1px solid #f5c99a", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                    ⚠ Ocorrência
                  </button>
                )}
                <button onClick={fecharComSalvar} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 14, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-times" /> Fechar</button>
              </div>
            </div>

            {/* Modal de ocorrência rápida (categoria PV) */}
            <OcorrenciaFormModal
              aberto={showOcorrencia}
              onFechar={() => setShowOcorrencia(false)}
              tecnicos={Array.from(new Set([tecnico, ...tecnicos].filter(Boolean)))}
              categoriaInicial="pv"
              tecnicoInicial={tecnico || ""}
              idOrdemInicial={ppvId || ""}
              criadoPor={userProfile?.nome || undefined}
            />

            {loadingData ? (
              <div className="ppv-loading">
                <div className="ppv-spinner" />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                <div className="ppv-drawer-body">

                  {details && (
                    <>
                      {/* ── Cabeçalho estilo Omie ── */}
                      <div className="ppv-omie-head" style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 4, padding: "12px 14px", marginBottom: 12 }}>
                       <div className="ppv-x-head" style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                       <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Cliente + Consulta de Crédito + Previsão de Faturamento */}
                        <div className="ppv-g-cliente" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, alignItems: "start" }}>
                          <div>
                            <label style={labelOmie}>Cliente</label>
                            <div className="osh-cli">
                              <span className="osh-selo" title={cliente || ""} onMouseEnter={() => setShowCliInfo(true)} onMouseLeave={() => setShowCliInfo(false)} style={{ position: "relative", cursor: "help" }}>
                                {(cliente || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
                                {showCliInfo && (
                                  <div style={{ position: "absolute", top: "115%", left: 0, zIndex: 50, width: 340, maxWidth: "calc(100vw - 40px)", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 4, boxShadow: "0 12px 30px rgba(0,0,0,0.16)", padding: 12, color: "#334155", cursor: "default" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8, whiteSpace: "normal" }}>{cliente || "—"}</div>
                                    {[["CPF / CNPJ", clienteDoc], ["Telefone", clienteTelefone], ["E-mail", clienteEmail], ["Cidade", clienteCidade], ["Endereço", clienteEndereco]].map(([rot, val]) => (
                                      <div key={rot} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "3px 0", borderTop: "1px solid #F1F5F9" }}>
                                        <span style={{ color: "#94a3b8", minWidth: 78, fontWeight: 600 }}>{rot}</span>
                                        <span style={{ flex: 1, wordBreak: "break-word", fontWeight: 500 }}>{val || "—"}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </span>
                              <div className="osh-caixa">
                                <button type="button" className="osh-nome" onClick={() => (cliente ? abrirCliOmie() : setBuscaClienteOpen(true))} title={cliente ? "Ver as informações do cliente" : "Escolher o cliente"}>
                                  <span className="osh-nome-txt" style={{ color: cliente ? undefined : "#94a3b8", fontWeight: cliente ? undefined : 500 }}>{cliente || "Clique na lupa para escolher o cliente…"}</span>
                                  {(clienteDocumento || clienteDoc) && <span className="osh-doc">{clienteDocumento || clienteDoc}</span>}
                                </button>
                                {cliente && <button type="button" className="osh-ico" onClick={abrirCliOmie} title="Informações do cliente (cadastro no Omie)"><i className="fas fa-paperclip" /></button>}
                                <MaquinasClienteIcone doc={clienteDocumento} className="osh-ico" botaoStyle={{ width: 42, height: "100%", border: "none", borderLeft: "1px solid var(--border)", borderRadius: 0, fontSize: 13 }} />
                                <button type="button" className="osh-ico" onClick={() => setBuscaClienteOpen(true)} title="Trocar o cliente"><i className="fas fa-magnifying-glass" /></button>
                              </div>
                            </div>
                            <style>{`
                              .osh-cli { display: flex; gap: 10px; align-items: stretch; }
                              .osh-selo { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; letter-spacing: .5px;
                                color: #fefefe; background: linear-gradient(135deg, #F7B23B, #E8890C); box-shadow: 0 2px 6px rgba(232,137,12,.3); }
                              .osh-caixa { flex: 1; min-width: 0; display: flex; align-items: stretch; height: 44px; border: 1px solid var(--border, #E2E8F0); border-radius: 10px; background: var(--surface, #fefefe); transition: border-color .15s, box-shadow .15s; }
                              .osh-caixa:hover { border-color: #0F8B8D; box-shadow: 0 0 0 3px rgba(15,139,141,.08); }
                              .osh-caixa > :first-child { border-radius: 10px 0 0 10px; }
                              .osh-caixa > :last-child, .osh-caixa > :last-child > button { border-radius: 0 10px 10px 0 !important; }
                              .osh-caixa > div { align-self: stretch !important; }
                              .osh-nome { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 1px; padding: 0 12px; border: none; background: transparent; cursor: pointer; text-align: left; font: inherit; color: inherit; }
                              .osh-nome-txt { font-size: 13.5px; font-weight: 700; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                              .osh-doc { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
                              .osh-ico { width: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: none; border-left: 1px solid var(--border, #E2E8F0); background: transparent; color: #475569; cursor: pointer; font-size: 13px; transition: background .15s, color .15s; }
                              .osh-ico:hover { background: color-mix(in srgb, #0F8B8D 10%, transparent) !important; color: #0B6E70 !important; }
                            `}</style>
                          </div>
                          <div>
                            <label style={labelOmie}>Previsão de Faturamento</label>
                            <input type="date" value={previsaoFat} onChange={(e) => setPrevisaoFat(e.target.value)} style={{ marginBottom: 0 }}
                              disabled={!!(modalOSId || "").trim()} title={(modalOSId || "").trim() ? `Segue a ${modalOSId}: mude na OS` : undefined} />
                            {(modalOSId || "").trim() && <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}><i className="fas fa-link" /> segue a {modalOSId}</div>}
                          </div>
                        </div>

                        {/* Vendedor · Desconto (editável) · Parcelas · Cenário Fiscal */}
                        <div className="ppv-g-vendedor" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr 1fr 1fr", gap: 14, marginTop: 12, alignItems: "end" }}>
                          <div>
                            <label style={labelOmie}>Vendedor</label>
                            <SeletorTecnicos unico tecnicos={Array.from(new Set([tecnico, ...tecnicos].filter(Boolean)))} t1={tecnico || ""} t2="" podeEditar={podeEditar} onChange={(a) => setTecnico(a)} />
                          </div>
                          <div>
                            <div style={rotOmie}>
                              Valor do Desconto{" "}
                              <button type="button" onClick={() => setDescontoModo((m) => (m === "pct" ? "valor" : "pct"))} title="Alternar entre % e R$"
                                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#a79f92", fontSize: 10, padding: 0, marginLeft: 2 }}>
                                <i className="fas fa-pen" />
                              </button>{" "}
                              <span style={{ fontSize: 10.5, color: "#b7b0a3" }}>({descontoModo === "pct" ? "%" : "R$"})</span>
                            </div>
                            <div style={{ ...boxOmie, padding: "0 8px", gap: 4 }}>
                              {descontoModo === "pct" ? (
                                <>
                                  <input type="number" value={desconto || ""} min={0} max={100} step={0.5} placeholder="0" title="Desconto em %"
                                    onChange={(e) => { const v = parseFloat(e.target.value); setDesconto(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                    style={{ width: "100%", border: "none", background: "transparent", textAlign: "right", fontSize: 14, color: "#4a453d", outline: "none", padding: 0, margin: 0, fontFamily: "inherit" }} />
                                  <span style={{ fontSize: 12, color: "#8a8378" }}>%</span>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: 12, color: "#8a8378" }}>R$</span>
                                  <input type="number" value={valorDesconto ? Number(valorDesconto.toFixed(2)) : ""} min={0} max={totalSemDesconto} step={1} placeholder="0,00" title="Desconto em R$"
                                    onChange={(e) => { const v = parseFloat(e.target.value); const val = isNaN(v) ? 0 : Math.min(totalSemDesconto, Math.max(0, v)); setDesconto(totalSemDesconto > 0 ? (val / totalSemDesconto) * 100 : 0); }}
                                    style={{ width: "100%", border: "none", background: "transparent", textAlign: "right", fontSize: 14, color: "#4a453d", outline: "none", padding: 0, margin: 0, fontFamily: "inherit" }} />
                                </>
                              )}
                            </div>
                          </div>
                          <div>
                            <label style={labelOmie}>Número de Parcelas</label>
                            {(() => {
                              // o PPV guarda "omie:COD|nome|qtd" (ou as opções antigas); o seletor do POS trabalha com o espelho
                              const v = String(numParcelas || "");
                              const [cod, nome, qtd] = v.startsWith("omie:") ? v.slice(5).split("|") : ["", rotuloNumParcelas(v), ""];
                              const esp = { ...espelhoPadrao(), condicao: cod || v, condicaoNome: nome || rotuloNumParcelas(v), condicaoQtd: Number(qtd) || undefined, parcelas: [] } as OmieEspelho;
                              const setEsp = (f: (e: OmieEspelho) => OmieEspelho) => { const n = f(esp); setNumParcelas(numParcelasDaOS({ condicao: n.condicao, condicaoNome: n.condicaoNome, condicaoQtd: n.condicaoQtd, parcelas: [] })); };
                              return <SeletorCondicao esp={esp} setEsp={setEsp} podeEditar={podeEditar && !(modalOSId || "").trim()} listas={listasOmiePPV.listas} />;
                            })()}
                            {(modalOSId || "").trim() && <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 3 }}><i className="fas fa-link" /> segue a {modalOSId}</div>}
                          </div>
                          <div>
                            <label style={labelOmie}>Cenário Fiscal</label>
                            <div style={{ position: "relative" }}>
                              <button type="button" onClick={() => setCenarioAberto((o) => !o)}
                                style={{ width: "100%", textAlign: "left", background: "#fff", border: "1px solid #cfc9bd", borderRadius: 3, padding: "6px 30px 6px 9px", fontSize: 13, fontFamily: "inherit", color: "#3f3a34", cursor: "pointer", position: "relative", minHeight: 31 }}>
                                {listasPedido.cenarios.find((c) => c.codigo === cenarioFiscal)?.descricao || cenarioFiscal || "— selecione —"}
                                <i className={`fas ${cenarioAberto ? "fa-chevron-up" : "fa-chevron-down"}`} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#8a8378" }} />
                              </button>
                              {cenarioAberto && (
                                <>
                                  <div onClick={() => setCenarioAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                                  <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 41, background: "#fff", border: "1px solid #d6d0c4", borderRadius: 4, boxShadow: "0 12px 30px rgba(0,0,0,0.16)", maxHeight: 300, overflowY: "auto" }}>
                                    {listasPedido.cenarios.map((c) => {
                                      const sel = c.codigo === cenarioFiscal;
                                      return (
                                        <button key={c.codigo} type="button" onClick={() => { setCenarioFiscal(c.codigo); setCenarioAberto(false); }}
                                          style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1efe9", background: sel ? "#e8730c" : "#fff", cursor: "pointer", padding: "8px 12px" }}
                                          onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "#fff7ef"; }}
                                          onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "#fff"; }}>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: sel ? "#fff" : "#1f1f1f" }}>{c.descricao}</div>
                                          {c.segmentos && <div style={{ fontSize: 11, color: sel ? "#ffe7cf" : "#94a3b8", marginTop: 1 }}>{c.segmentos}</div>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                       </div>{/* fim coluna esquerda do cabeçalho */}

                       {/* Caixa de totais (igual à da OS) */}
                       <div className="os-omie-totais" style={{ alignSelf: "stretch", justifyContent: "center" }}>
                         <div className="os-omie-totais-linha"><span>Mercadorias:</span><b>{formatarMoeda(totalSemDesconto)}</b></div>
                         <div className="os-omie-totais-linha"><span>Descontos:</span><b style={{ color: valorDesconto > 0 ? "#0d9488" : "#b7b0a3" }}>{formatarMoeda(valorDesconto)}</b></div>
                         <div className="os-omie-totais-linha"><span>Custo (CMC):</span><b>{custoLoading ? "…" : custoCMC > 0 ? formatarMoeda(custoCMC) : "—"}</b></div>
                         <div className="os-omie-totais-total"><span>Valor Total:</span><span>{formatarMoeda(totalFinal)}</span></div>
                       </div>
                       </div>{/* fim flex do cabeçalho */}
                      </div>

                      {/* ── Abas (folder laranja estilo Omie) ── */}
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, borderBottom: "1px solid #e2ddd3", marginBottom: 14, paddingTop: 3, flexWrap: "wrap" }}>
                        {(faturadoEm ? [...ABAS_OMIE, ABA_SEFAZ] : ABAS_OMIE).map((a) => {
                          const on = abaAtiva === a;
                          return (
                            <button key={a} type="button" onClick={() => setAbaAtiva(a)}
                              style={{ padding: "8px 14px", fontSize: 13, lineHeight: 1.4, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", marginBottom: -1,
                                background: on ? "#fff" : "transparent", color: on ? "#e8730c" : "#7a7268", fontWeight: on ? 600 : 500,
                                border: on ? "1px solid #e2ddd3" : "1px solid transparent", borderBottom: on ? "1px solid #fff" : "1px solid transparent",
                                borderTop: on ? "2px solid #e8730c" : "2px solid transparent", borderRadius: on ? "5px 5px 0 0" : 0 }}>
                              {a}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* ── Detalhes do status (aba Informações sobre) — só Conclusão.
                      O Cancelamento MUDOU pra aba Observações (embaixo do bloco). ── */}
                  {abaAtiva === "Informações sobre" && status === "Concluída" && (
                    <div className="ppv-card">
                      <div className="ppv-card-title"><i className="fas fa-flag" /> Conclusão</div>
                      {status === "Concluída" && (
                        <div>
                          <label>Pedido OMIE *</label>
                          <input type="text" value={pedidoOmie} onChange={(e) => setPedidoOmie(e.target.value)} placeholder="Código do pedido Omie..." style={{ marginBottom: 0 }} />
                          {pedidoOmie && (
                            <button
                              onClick={abrirPdfOmiePPV}
                              disabled={baixandoPdfOmie}
                              style={{
                                marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                padding: "11px 14px", borderRadius: 8, border: "1.5px solid #EA580C",
                                background: "transparent", color: "#EA580C", fontWeight: 700, fontSize: 13.5,
                                cursor: baixandoPdfOmie ? "wait" : "pointer",
                              }}
                            >
                              {baixandoPdfOmie
                                ? <><i className="fas fa-spinner fa-spin" /> Buscando PDF no Omie...</>
                                : <><i className="fas fa-file-pdf" /> PDF do pedido (Omie)</>}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}


                  {/* ── Pedido (aba Informações sobre) ── */}
                  {abaAtiva === "Informações sobre" && (
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-file-invoice-dollar" /> Informações Adicionais (Omie)</div>
                    {/* Agrupado por assunto, todas as colunas da mesma largura em cada linha (13/10/2026) */}
                    <div className="ppv-info-grupo">Lançamento</div>
                    <div className="ppv-g-empilha ppv-info-linha" style={{ gridTemplateColumns: "1.6fr 1.2fr 1.2fr" }}>
                      <div>
                        <label>Categoria</label>
                        <select value={infoCategoria} onChange={(e) => setInfoCategoria(e.target.value)} style={{ marginBottom: 0 }} disabled={!!(modalOSId || "").trim()}
                          title={(modalOSId || "").trim() ? `Automática pela ${modalOSId}${/revis/i.test(osVinc?.tipoServico || "") ? " (revisão)" : ""}` : undefined}>
                          {infoCategoria && !listasPedido.categorias.some((c) => c.codigo === infoCategoria) && <option value={infoCategoria}>{infoCategoria}</option>}
                          {listasPedido.categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Conta Corrente</label>
                        <select value={infoContaCorrente} onChange={(e) => setInfoContaCorrente(e.target.value)} style={{ marginBottom: 0 }}>
                          <option value="">— padrão da empresa —</option>
                          {listasPedido.contasCorrentes.map((c) => <option key={c.codigo} value={c.codigo}>{c.descricao}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Etapa</label>
                        <select value={status} onChange={(e) => mudarStatusPPV(e.target.value)} disabled={!podeEditar} title="Fase do PPV" style={{ marginBottom: 0 }}>
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="ppv-info-dica">Na Castro, a conta corrente é trocada pela de mesmo nome dela (sem equivalente, vai na conta padrão).</div>

                    <div className="ppv-info-grupo">Vínculos</div>
                    <div className="ppv-g-empilha ppv-info-linha" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <label>OS vinculada (nº do pedido do cliente)</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="text" value={modalOSDisplay} readOnly onClick={onBuscaOS} placeholder="Clique para vincular O.S." title="Vincular O.S. (POS) ao PPV" style={{ marginBottom: 0, fontWeight: 600, cursor: "pointer", flex: 1, minWidth: 0 }} />
                          {modalOSId && podeEditar && (
                            <button type="button" title={`Desvincular a OS ${modalOSId} deste PPV`}
                              onClick={() => {
                                if (window.confirm(`Desvincular a OS ${modalOSId} deste PPV?\n\nO vínculo é removido dos DOIS lados ao salvar (o drawer também salva sozinho ao fechar). Depois é só vincular a ordem certa.`)) {
                                  onSetModalOS("", "");
                                }
                              }}
                              style={{ flexShrink: 0, width: 38, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Projeto (como no Omie) */}
                      <div style={{ position: "relative" }}>
                        <label>Projeto</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="text" value={usarProjetoOS && modalOSId && !projeto ? "" : projeto} onChange={(e) => setProjeto(e.target.value)}
                            disabled={usarProjetoOS && !!modalOSId && !projeto}
                            placeholder={usarProjetoOS && modalOSId ? "Projeto da OS" : "Digite ou banco"}
                            style={{ marginBottom: 0, fontWeight: 600, flex: 1, background: usarProjetoOS && modalOSId && !projeto ? "#f8fafc" : "#fff" }} />
                          <button type="button" title="Escolher um projeto do banco"
                            onClick={() => { setProjDropdown((o) => !o); setProjBusca(""); if (projetosDB.length === 0) fetch("/api/pos/buscas/projetos").then((r) => r.json()).then((d) => setProjetosDB(Array.isArray(d) ? d : [])).catch(() => {}); }}
                            style={{ flexShrink: 0, padding: "0 11px", borderRadius: 8, border: "1px solid #E2E8F0", background: projDropdown ? "#EFF6FF" : "#fff", color: "#334155", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            <i className="fas fa-database" style={{ fontSize: 11 }} />
                          </button>
                        </div>
                        {modalOSId && (
                          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, marginBottom: 0, fontSize: 11.5, color: "#64748b", cursor: "pointer", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                            <input type="checkbox" checked={usarProjetoOS} onChange={(e) => { setUsarProjetoOS(e.target.checked); if (e.target.checked) setProjeto(""); }} />
                            Usar projeto da OS
                          </label>
                        )}
                        {projDropdown && (
                          <div style={{ position: "absolute", zIndex: 30, top: 62, left: 0, right: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.14)", maxHeight: 260, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <div style={{ padding: 8, borderBottom: "1px solid #F1F5F9" }}>
                              <input autoFocus value={projBusca} onChange={(e) => setProjBusca(e.target.value)} placeholder="Buscar projeto..." style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                            <div style={{ overflow: "auto" }}>
                              {projetosDB.filter((p) => p.nome.toLowerCase().includes(projBusca.trim().toLowerCase())).slice(0, 60).map((p, i) => (
                                <button type="button" key={`${p.nome}-${i}`} onClick={() => { setUsarProjetoOS(false); setProjeto(p.nome); setProjDropdown(false); }}
                                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #F5F5F5" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                  <i className="fas fa-cog" style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }} />
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</span>
                                </button>
                              ))}
                              {projetosDB.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>Carregando...</div>}
                              {projetosDB.length > 0 && projetosDB.filter((p) => p.nome.toLowerCase().includes(projBusca.trim().toLowerCase())).length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>Nenhum projeto.</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ppv-info-grupo">Referências</div>
                    <div className="ppv-g-empilha ppv-info-linha" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div><label>N° do Contrato de Venda</label><input type="text" value={infoNumContrato} onChange={(e) => setInfoNumContrato(e.target.value)} placeholder={ppvId ? `vazio = ${ppvId}` : ""} style={{ marginBottom: 0 }} /></div>
                      <div><label>Contato</label><input type="text" value={infoContato} onChange={(e) => setInfoContato(e.target.value)} style={{ marginBottom: 0 }} /></div>
                      <div><label>Origem do Pedido</label><input type="text" value="Omie" readOnly style={{ marginBottom: 0, background: "#f8fafc", cursor: "default" }} /></div>
                    </div>

                    <div className="ppv-info-grupo">Nota fiscal</div>
                    <div>
                      <label>Dados adicionais da NF-e</label>
                      <textarea rows={3} value={infoDadosNF} onChange={(e) => setInfoDadosNF(e.target.value)} placeholder="Texto que vai nos dados adicionais da NF-e..." style={{ marginBottom: 0 }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 0, fontWeight: 400, textTransform: "none", letterSpacing: 0, cursor: "pointer", color: "#334155" }}>
                      <input type="checkbox" checked={infoConsumoFinal} onChange={(e) => setInfoConsumoFinal(e.target.checked)} />
                      Nota Fiscal para Consumo Final
                    </label>
                    <style>{`
                      .ppv-info-grupo { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #c2570a; margin: 18px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #f1e6d8; }
                      .ppv-info-grupo:first-of-type { margin-top: 4px; }
                      .ppv-info-linha { display: grid; gap: 16px; align-items: start; }
                      .ppv-info-dica { font-size: 11.5px; color: #94a3b8; margin-top: 6px; }
                    `}</style>
                  </div>
                  )}

                  {/* ── Observações (aba) ── */}
                  {abaAtiva === "Observações" && (
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-align-left" /> Observações</div>
                    <textarea rows={6} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas sobre o pedido..." style={{ marginBottom: 0 }} />
                  </div>
                  )}

                  {/* ── Cancelamento — embaixo do bloco de Observações ── */}
                  {abaAtiva === "Observações" && status === "Cancelada" && (
                    <div className="ppv-card" style={{ borderLeft: "3px solid #dc2626" }}>
                      <div className="ppv-card-title"><i className="fas fa-ban" style={{ color: "#dc2626" }} /> Cancelamento</div>
                      <label>Motivo do Cancelamento *</label>
                      <textarea rows={2} value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Descreva o motivo..." style={{ marginBottom: 12 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: temSubstituto ? 10 : 0 }}>
                        <input type="checkbox" id="ppvTemSubstituto" checked={temSubstituto} onChange={(e) => { setTemSubstituto(e.target.checked); if (!e.target.checked) { setSubstitutoId(""); } }} />
                        <label htmlFor="ppvTemSubstituto" style={{ margin: 0, fontWeight: 600, cursor: "pointer" }}>Tem substituto?</label>
                      </div>
                      {temSubstituto && (
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                          <select value={substitutoTipo} onChange={(e) => { setSubstitutoTipo(e.target.value as "POS" | "PPV"); setSubstitutoId(""); }} style={{ width: 100, fontWeight: 600 }}>
                            <option value="POS">POS</option>
                            <option value="PPV">PPV</option>
                          </select>
                          <select value={substitutoId} onChange={(e) => setSubstitutoId(e.target.value)} style={{ flex: 1, fontWeight: 600, marginBottom: 0 }}>
                            <option value="">Selecione...</option>
                            {(substitutoTipo === "POS" ? listaOSAbertas : listaPPVAbertos).map((item) => (
                              <option key={item.id} value={item.id}>
                                {substitutoTipo === "POS" ? `OS ${item.id}` : item.id} - {item.cliente} ({item.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Comunicação com a SEFAZ (aba) — só quando faturado ── */}
                  {abaAtiva === ABA_SEFAZ && (
                  <div className="ppv-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <div className="ppv-card-title" style={{ margin: 0, flex: 1 }}><i className="fas fa-satellite-dish" /> Comunicação com a SEFAZ</div>
                      {sefaz?.nCodNF && (
                        <button type="button" onClick={abrirDanfe} disabled={danfeLoading}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #f5c99a", background: "#fff", color: "#c2570a", fontSize: 12.5, fontWeight: 700, cursor: danfeLoading ? "wait" : "pointer" }}>
                          <i className={`fas ${danfeLoading ? "fa-spinner fa-spin" : "fa-file-pdf"}`} /> DANFE
                        </button>
                      )}
                      <button type="button" onClick={() => carregarSefaz(true)} disabled={sefazLoading}
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", borderRadius: 3, border: "1px solid #E2E8F0", background: "#fff", color: "#334155", fontSize: 12.5, fontWeight: 700, cursor: sefazLoading ? "wait" : "pointer" }}>
                        <i className={`fas ${sefazLoading ? "fa-spinner fa-spin" : "fa-sync-alt"}`} /> Atualizar
                      </button>
                    </div>

                    {/* Ficha da NF-e */}
                    {sefaz && !sefaz.semNF && (sefaz.numero || sefaz.chave) && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
                        {sefaz.numero && <div style={fichaBox}><span style={fichaLbl}>NF-e</span><span style={fichaVal}>{sefaz.numero}{sefaz.serie ? ` · série ${sefaz.serie}` : ""}</span></div>}
                        {sefaz.emitidaEm && <div style={fichaBox}><span style={fichaLbl}>Emissão</span><span style={fichaVal}>{sefaz.emitidaEm}</span></div>}
                        {sefaz.ambiente && <div style={fichaBox}><span style={fichaLbl}>Ambiente</span><span style={{ ...fichaVal, color: sefaz.ambiente === "producao" ? "#047857" : "#b45309" }}>{sefaz.ambiente === "producao" ? "Produção" : "Homologação (teste)"}</span></div>}
                        {sefaz.chave && <div style={{ ...fichaBox, gridColumn: "1 / -1" }}><span style={fichaLbl}>Chave de acesso</span><span style={{ ...fichaVal, fontFamily: "monospace", fontSize: 12.5, letterSpacing: 0.3, wordBreak: "break-all" }}>{sefaz.chave}</span></div>}
                      </div>
                    )}

                    {/* Tabela de eventos (estilo Omie, quadrado) */}
                    {sefazLoading && !sefaz ? (
                      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}><i className="fas fa-spinner fa-spin" /> Consultando a NF-e no Omie…</div>
                    ) : sefaz?.semNF ? (
                      <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2ddd3", borderRadius: 4 }}>
                        <i className="fas fa-clock" style={{ marginRight: 6 }} />
                        {sefaz.erro || "Faturado — a NF-e ainda não apareceu no Omie. A autorização na SEFAZ leva alguns instantes; clique em Atualizar."}
                      </div>
                    ) : sefaz && sefaz.eventos.length > 0 ? (
                      <div className="ppv-x-scroll">
                      <div style={{ border: "1px solid #d8d2c6", borderRadius: 4, overflow: "hidden", minWidth: 520 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "40px 200px 1fr 130px", gap: 8, alignItems: "center", padding: "8px 12px", background: "#edeae4", borderBottom: "1px solid #d8d2c6", fontSize: 12, fontWeight: 700, color: "#5f574c" }}>
                          <span /><span>Data e Hora</span><span>Descrição</span><span>Usuário</span>
                        </div>
                        {sefaz.eventos.map((ev, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 200px 1fr 130px", gap: 8, alignItems: "center", padding: "10px 12px", borderBottom: i < sefaz.eventos.length - 1 ? "1px solid #eee7da" : "none", background: i === 0 ? "#fff7ef" : "#fff", fontSize: 13 }}>
                            <span style={{ textAlign: "center" }}>
                              {ev.ok ? <i className="fas fa-check-circle" style={{ color: "#16a34a" }} /> : <i className="fas fa-exclamation-circle" style={{ color: "#d97706" }} />}
                            </span>
                            <span style={{ color: "#475569", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{ev.data}{ev.hora ? ` às ${ev.hora}` : ""}</span>
                            <span style={{ color: "#334155", fontWeight: i === 0 ? 700 : 400 }}>{ev.descricao}</span>
                            <span style={{ color: "#64748b" }}>{ev.usuario}</span>
                          </div>
                        ))}
                        <div style={{ padding: "7px 12px", background: "#faf8f4", borderTop: "1px solid #eee7da", fontSize: 11.5, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                          <span>{sefaz.eventos.length} registro(s)</span>
                          {sefaz.atualizadoEm && <span>Atualizado em {new Date(sefaz.atualizadoEm).toLocaleString("pt-BR")}</span>}
                        </div>
                      </div>
                      </div>
                    ) : (
                      <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2ddd3", borderRadius: 4 }}>
                        {sefaz?.erro || "Sem eventos de comunicação com a SEFAZ para este pedido."}
                      </div>
                    )}
                  </div>
                  )}

                  {/* ── Itens da Venda (aba) ── */}
                  {abaAtiva === "Itens da Venda" && (
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-boxes" /> Itens da Venda</div>

                    {/* Toolbar de itens (estilo Omie): Novo Item · Descrição Produto · Excluir Item */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                      <button type="button" onClick={onBuscaProduto} disabled={!ppvId || !podeItem} title={!podeItem ? MSG_SEM_PERMISSAO : "Buscar produto, mais usados, catálogo e kit"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 16px", borderRadius: 8, border: "none", background: "#f0a22e", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: !ppvId || !podeItem ? "not-allowed" : "pointer", opacity: !ppvId || !podeItem ? 0.55 : 1 }}>
                        <i className="fas fa-plus" /> Novo Item
                      </button>
                      <button type="button" onClick={verDescricaoProduto} disabled={!itemSelecionado} title={itemSelecionado ? "Ver informações do produto selecionado" : "Selecione um produto (clique na descrição)"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: itemSelecionado ? "#334155" : "#94a3b8", fontSize: 13.5, fontWeight: 600, cursor: itemSelecionado ? "pointer" : "not-allowed" }}>
                        <i className="fas fa-circle-info" /> Descrição Produto
                      </button>
                      <button type="button" onClick={excluirItemSelecionado} disabled={!itemSelecionado || !podeItem} title={itemSelecionado ? "Excluir o produto selecionado" : "Selecione um produto (clique na descrição)"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #f5c99a", background: "#fff", color: itemSelecionado && podeItem ? "#c2570a" : "#f0a3a3", fontSize: 13.5, fontWeight: 600, cursor: itemSelecionado && podeItem ? "pointer" : "not-allowed" }}>
                        <i className="fas fa-trash" /> Excluir Item
                      </button>

                      {/* Adicionar por QR (rastreio de unidades) */}
                      <button type="button" onClick={() => setScanAddAberto(true)} disabled={!ppvId || !podeItem}
                        title={!podeItem ? MSG_SEM_PERMISSAO : "Escanear o QR da etiqueta pra adicionar a peça e reservar a unidade"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#fff", color: !ppvId || !podeItem ? "#93c5fd" : "#1d4ed8", fontSize: 13.5, fontWeight: 600, cursor: !ppvId || !podeItem ? "not-allowed" : "pointer" }}>
                        <i className="fas fa-qrcode" /> Adicionar por QR
                      </button>
                    </div>

                    {/* Kits importados — remover o kit inteiro de uma vez */}
                    {(details?.kits || []).length > 0 && (
                      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {(details?.kits || []).map((k) => (
                          <div key={k.tag} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #f5c99a", background: "#fff7ef" }}>
                            <i className="fas fa-tools" style={{ fontSize: 13, color: "#e8730c" }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#9a3412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.rotulo}</span>
                              <span style={{ display: "block", fontSize: 11, color: "#b45309" }}>{k.itens.length} {k.itens.length === 1 ? "item" : "itens"} · {formatarMoeda(k.total)}</span>
                            </span>
                            <button type="button" onClick={() => removerKitInteiro(k.tag, k.rotulo)} disabled={!podeItem || removendoKit === k.tag}
                              title={!podeItem ? MSG_SEM_PERMISSAO : "Remover o kit inteiro"}
                              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #f5c99a", background: "#fff", color: "#c2570a", fontSize: 12, fontWeight: 700, cursor: !podeItem ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                              {removendoKit === k.tag ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />} Remover kit
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Lista de produtos — tabela estilo Omie */}
                    {produtosComSaldo.length > 0 && (
                      <div className="ppv-tabela-itens" style={{ border: "1px solid var(--ppv-border, #E2E8F0)", borderRadius: 4, overflow: "hidden" }}>
                        {/* Cabeçalho */}
                        <div className="ppv-item-linha" style={{ display: "grid", gridTemplateColumns: "150px 60px minmax(140px,1fr) 130px 116px 116px 210px 44px", gap: 10, alignItems: "center", padding: "9px 16px", background: "#edeae4", borderBottom: "1px solid #d8d2c6", fontSize: 12, fontWeight: 600, color: "#5f574c", letterSpacing: 0.2 }}>
                          <span>Produto <span style={{ color: "#b7b0a3" }}>»</span></span><span style={{ textAlign: "center" }}>Qtd <span style={{ color: "#b7b0a3" }}>»</span></span><span>Descrição <span style={{ color: "#b7b0a3" }}>»</span></span><span style={{ textAlign: "right" }}>Custo (CMC) <span style={{ color: "#b7b0a3" }}>»</span></span><span style={{ textAlign: "right" }}>Preço un. <span style={{ color: "#b7b0a3" }}>»</span></span><span style={{ textAlign: "right" }}>Total <span style={{ color: "#b7b0a3" }}>»</span></span><span>Categoria <span style={{ color: "#b7b0a3" }}>»</span></span><span />
                        </div>
                        {produtosComSaldo.map((p, i) => {
                          const isDevolvido = p.saldo === 0;
                          const isParcial = p.saldo > 0 && p.qtdDev > 0;
                          const editando = editandoPrecoCod === p.codigo;
                          const isPrimario = (p.empresa || "").toLowerCase().includes("primari");
                          return (
                            <div key={p.codigo} className="ppv-item-linha" style={{ display: "grid", gridTemplateColumns: "150px 60px minmax(140px,1fr) 130px 116px 116px 210px 44px", gap: 10, alignItems: "center", padding: "12px 16px", borderBottom: i < produtosComSaldo.length - 1 ? "1px solid #E2E8F0" : "none", background: itemSelecionado === p.codigo ? "#fff2df" : isDevolvido ? "#FAFAFA" : "#fff", opacity: isDevolvido ? 0.7 : 1, fontSize: 14 }}>
                              {/* Produto */}
                              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                                <button type="button" onClick={() => setDetalheProd({ codigo: p.codigo, descricao: p.descricao, conta: isPrimario ? "CASTRO" : "NOVA", quantidade: p.saldo, preco: p.preco })}
                                  title="Item de Orçamento — dados do produto + impostos"
                                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontWeight: 500, fontSize: "inherit", fontFamily: "inherit", color: "#2563EB", textDecoration: isDevolvido ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  {p.codigo}<i className="fas fa-circle-info" style={{ fontSize: 11, color: "#93C5FD" }} />
                                </button>
                                {/* Copiar o código do produto — opção clara, com feedback */}
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.codigo).then(() => { setCodCopiado(p.codigo); setTimeout(() => setCodCopiado((c) => (c === p.codigo ? null : c)), 1500); }).catch(() => {}); }}
                                  title={codCopiado === p.codigo ? "Copiado!" : "Copiar código do produto"}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, border: `1px solid ${codCopiado === p.codigo ? "#6EE7B7" : "#E2E8F0"}`, background: codCopiado === p.codigo ? "#ECFDF5" : "#fff", color: codCopiado === p.codigo ? "#059669" : "#64748B", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                  <i className={`fas ${codCopiado === p.codigo ? "fa-check" : "fa-copy"}`} style={{ fontSize: 10 }} /> {codCopiado === p.codigo ? "Copiado" : "Copiar"}
                                </button>
                                {p.empresa && <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: isPrimario ? "#DBEAFE" : "#fff3e6", color: isPrimario ? "#2563EB" : "#c2570a" }}>{isPrimario ? "CASTRO" : "NOVA"}</span>}
                              </div>
                              {/* Qtd / saldo + status */}
                              <div style={{ textAlign: "center", lineHeight: 1.3 }}>
                                <div style={{ fontWeight: 500 }}>{p.saldo}</div>
                                {p.qtdDev > 0
                                  ? <div style={{ fontSize: 11.5, color: "#EF4444" }}>de {p.quantidade} · dev {p.qtdDev}</div>
                                  : <div style={{ fontSize: 11, fontWeight: 500, color: isParcial ? "#B45309" : "#16A34A" }}>{isDevolvido ? "DEVOLVIDO" : isParcial ? "PARCIAL" : "ATIVO"}</div>}
                              </div>
                              {/* Descrição — clicar seleciona o item */}
                              <div onClick={() => setItemSelecionado(p.codigo)} style={{ minWidth: 0, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", fontWeight: itemSelecionado === p.codigo ? 700 : 400 }} title="Clique para selecionar este item">{p.descricao}</div>
                              {/* Custo unitário (CMC) do item — lido do banco pela conta certa */}
                              <div title="Custo unitário (CMC)" style={{ fontSize: 13, color: "#0f9d58", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
                                {custoLoading ? "…" : cmcPorItem[p.codigo] ? formatarMoeda(cmcPorItem[p.codigo]) : "—"}
                              </div>
                              {/* Preço un. (editável) */}
                              <div style={{ textAlign: "right" }}>
                                {editando ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                    <input type="number" step="0.01" min="0" autoFocus value={editandoPrecoVal} onChange={(e) => setEditandoPrecoVal(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarPrecoItem(p.codigo); } if (e.key === "Escape") { setEditandoPrecoCod(null); setEditandoPrecoVal(""); } }}
                                      disabled={salvandoPreco} style={{ width: 84, padding: "5px 7px", marginBottom: 0, fontSize: 14, fontWeight: 500, textAlign: "right" }} />
                                    <button type="button" onClick={() => salvarPrecoItem(p.codigo)} disabled={salvandoPreco} title="Salvar" style={{ background: "#10B981", color: "#fff", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 11, flexShrink: 0 }}><i className={`fas ${salvandoPreco ? "fa-spinner fa-spin" : "fa-check"}`} /></button>
                                    <button type="button" onClick={() => { setEditandoPrecoCod(null); setEditandoPrecoVal(""); }} disabled={salvandoPreco} title="Cancelar" style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 11, flexShrink: 0 }}><i className="fas fa-times" /></button>
                                  </div>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                    <span style={{ whiteSpace: "nowrap", color: "#475569" }}>{formatarMoeda(p.preco)}</span>
                                    <button type="button" onClick={() => { setEditandoPrecoCod(p.codigo); setEditandoPrecoVal(p.preco.toFixed(2)); }} title="Editar preço unitário" style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", padding: 2, fontSize: 12 }}><i className="fas fa-pen" /></button>
                                  </span>
                                )}
                              </div>
                              {/* Total */}
                              <div style={{ textAlign: "right", fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap" }}>{formatarMoeda(p.saldo * p.preco)}</div>
                              {/* Categoria (novo — placeholder, // TODO: ligar ao banco) */}
                              <div title="Categoria — definida em Informações Adicionais" style={{ fontSize: 12.5, color: "#475569", whiteSpace: "normal", lineHeight: 1.25 }}>{listasPedido.categorias.find((c) => c.codigo === infoCategoria)?.descricao || "—"}</div>
                              {/* Ação: devolver */}
                              <div style={{ textAlign: "right" }}>
                                {p.saldo > 0 && !editando && (
                                  <button onClick={() => { setDevolucaoProd({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, max: p.saldo }); setDevolucaoOpen(true); }} className="ppv-btn-devolver" title="Devolver / remover"><i className="fas fa-undo-alt" /></button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Unidades rastreadas (QR) vinculadas + conferência liberado × faturado */}
                    {ppvId && <PPVUnidadesInfo key={unidadesVersao} ppvId={ppvId} verificarConferencia={!!faturadoEm || normalizarStatus(status) === "Concluída"} />}
                  </div>
                  )}

                  {/* ── Abas placeholder do Omie — ligar ao banco depois ── */}
                  {/* Frete e Outras Despesas / E-mail para o Cliente: removidas */}
                  {abaAtiva === "Departamentos" && (
                    <div className="ppv-card">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Distribuição por Departamento <span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>(marque e edite o % de cada departamento)</span></div>
                        {Object.keys(distDeptos).length > 0 && (
                          <button type="button" onClick={() => setDistDeptos({})} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "#c2570a", background: "#fff", border: "1px solid #f5c99a", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                            <i className="fas fa-times" style={{ marginRight: 6 }} />Remover distribuição
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 10 }}>Distribui o valor do pedido ({formatarMoeda(totalFinal)}) entre os departamentos.</div>
                      <div className="ppv-x-scroll">
                      <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", minWidth: 420 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 160px 120px", background: "#F1F5F9", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                          <span /><span>Departamento</span><span style={{ textAlign: "right" }}>Valor Distribuído</span><span style={{ textAlign: "right" }}>% da Distribuição</span>
                        </div>
                        <div style={{ maxHeight: 340, overflowY: "auto" }}>
                          {departamentos.map((d, i) => {
                            const sel = d.codigo in distDeptos;
                            const perc = distDeptos[d.codigo] || 0;
                            const valor = totalFinal * (perc / 100);
                            return (
                              <div key={d.codigo} style={{ display: "grid", gridTemplateColumns: "44px 1fr 160px 120px", padding: "8px 14px", fontSize: 13.5, borderTop: "1px solid #EEF2F7", alignItems: "center", gap: 8, background: sel ? "#fff7ed" : (i % 2 ? "#FAFBFC" : "#fff") }}>
                                <input type="checkbox" checked={sel} onChange={() => toggleDepto(d.codigo)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                                <span style={{ color: sel ? "#9a3412" : "#334155", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.descricao}>{d.descricao}</span>
                                <span style={{ textAlign: "right", fontWeight: sel ? 600 : 400, color: sel ? "#0f172a" : "#94a3b8" }}>{formatarMoeda(sel ? valor : 0)}</span>
                                <span style={{ textAlign: "right", fontWeight: sel ? 600 : 400, color: sel ? "#0f172a" : "#94a3b8" }}>{(sel ? perc : 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 160px 120px", padding: "10px 14px", fontSize: 13.5, borderTop: "2px solid #E2E8F0", background: "#F1F5F9", fontWeight: 700 }}>
                          <span /><span>Total distribuído</span>
                          <span style={{ textAlign: "right" }}>{formatarMoeda(totalFinal * (somaDeptos / 100))}</span>
                          <span style={{ textAlign: "right" }}>{somaDeptos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</span>
                        </div>
                      </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>1 - {departamentos.length} de {departamentos.length} registros</div>
                    </div>
                  )}
                  {abaAtiva === "Parcelas" && (
                    <div className="ppv-card">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Contas a Receber <span style={{ fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>(edite a data de vencimento de cada parcela)</span></div>
                        <button type="button" onClick={() => setParcelas(calcularParcelas(numParcelas, previsaoFat, totalFinal))} title="Recalcular a partir do parcelamento e da previsão"
                          style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600, color: "#334155", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                          <i className="fas fa-rotate" style={{ marginRight: 6 }} />Recalcular
                        </button>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 10 }}>Abaixo as parcelas e vencimentos desta venda.</div>
                      <div className="ppv-x-scroll">
                      <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", minWidth: 580 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 80px 1fr 150px 90px", background: "#F1F5F9", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                          <span>Situação</span><span>Parcela</span><span>Vencimento</span><span style={{ textAlign: "right" }}>Valor a Receber</span><span style={{ textAlign: "right" }}>Percentual</span>
                        </div>
                        {parcelas.map((p, i) => {
                          const atrasada = !!p.vencimento && p.vencimento < new Date().toISOString().slice(0, 10);
                          return (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 80px 1fr 150px 90px", padding: "8px 14px", fontSize: 13.5, borderTop: "1px solid #EEF2F7", alignItems: "center", gap: 10, background: i % 2 ? "#FAFBFC" : "#fff" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: atrasada ? "#c2570a" : "#2563eb" }}>
                                <i className={`fas ${atrasada ? "fa-circle-exclamation" : "fa-clock"}`} />{atrasada ? "Atrasado" : "A vencer"}
                              </span>
                              <span style={{ fontVariantNumeric: "tabular-nums", color: "#475569" }}>{String(p.numero).padStart(3, "0")}/{String(parcelas.length).padStart(3, "0")}</span>
                              <input type="date" value={p.vencimento}
                                onChange={(e) => setParcelas((prev) => prev.map((x, idx) => idx === i ? { ...x, vencimento: e.target.value } : x))}
                                style={{ marginBottom: 0, maxWidth: 190 }} />
                              <span style={{ textAlign: "right", fontWeight: 600 }}>{formatarMoeda(p.valor)}</span>
                              <span style={{ textAlign: "right", color: "#64748b" }}>{p.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%</span>
                            </div>
                          );
                        })}
                        <div style={{ display: "grid", gridTemplateColumns: "120px 80px 1fr 150px 90px", padding: "10px 14px", fontSize: 13.5, borderTop: "2px solid #E2E8F0", background: "#F1F5F9", fontWeight: 700 }}>
                          <span style={{ gridColumn: "1 / 4" }}>Total</span>
                          <span style={{ textAlign: "right" }}>{formatarMoeda(totalFinal)}</span>
                          <span style={{ textAlign: "right", color: "#64748b" }}>100%</span>
                        </div>
                      </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>1 - {parcelas.length} de {parcelas.length} registros</div>
                    </div>
                  )}

                </div>

                {/* ── Footer ── */}
              </>
            )}
          </div>

          {/* ── Coluna de ações (estilo Omie) ── */}
          {!loadingData && (
            <div className="ppv-action-rail ppv-rail-nova">
              {/* visual da coluna igual ao da OS (José, 14/10/2026) */}
              <style>{`
                .ppv-rail-nova { gap: 10px !important; padding: 14px 12px !important; width: 232px !important; background: var(--portal-bg-secondary, #f6f8f9) !important; }
                .ppv-rail-nova .ppv-rail-btn.primary { height: 46px; justify-content: center; border-radius: 12px; font-size: 14.5px; font-weight: 800; letter-spacing: .2px; margin-bottom: 2px;
                  background: linear-gradient(135deg, #F7B23B, #E8890C 55%, #c2570a) !important; box-shadow: 0 6px 16px rgba(232,115,12,.3); }
                .ppv-rail-nova .ppv-rail-btn.primary:hover:not(:disabled) { filter: brightness(1.05); }
                .ppv-rail-nova .ppv-rail-btn.primary i { width: auto; font-size: 15px; }
                .ppv-rail-acoes, .ppv-rail-perigo { background: var(--surface, #fefefe); border: 1px solid var(--border, #E2E8F0); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
                .ppv-rail-perigo { border-color: color-mix(in srgb, #C62828 25%, var(--border, #E2E8F0)); }
                .ppv-rail-acoes-titulo { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; padding: 6px 8px 4px; }
                .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn, .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn { gap: 10px; padding: 7px 8px; font-size: 13.5px; font-weight: 600; border-radius: 9px; color: var(--portal-text, #1f2d3d); }
                .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn i, .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn i { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px;
                  background: color-mix(in srgb, #0891A8 11%, transparent); color: #0891A8; flex-shrink: 0; }
                .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn:hover:not(:disabled) { background: color-mix(in srgb, #0891A8 7%, transparent); }
                .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn > span[title] { left: 31px !important; top: 6px !important; }
                .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn { color: #C62828 !important; font-weight: 700; }
                .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn i { background: #fee2e2; color: #C62828 !important; }
                .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn:hover:not(:disabled) { background: #fef2f2; }
              `}</style>
              <button className="ppv-rail-btn primary" onClick={salvar} disabled={salvando || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : undefined}>
                <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-save"}`} /> {salvando ? "Salvando..." : "Salvar"}
              </button>
              {/* ── Blocos: Omie (pedido, NF-e, faturar) · OS vinculada · requisições da OS ── */}
              {(() => {
                const cartao = (cor: string): CSSProperties => ({ margin: "4px 0 6px", padding: 10, borderRadius: 10, border: `1px solid color-mix(in srgb, ${cor} 40%, #E2E8F0)`, background: `color-mix(in srgb, ${cor} 6%, #fff)`, display: "flex", flexDirection: "column", gap: 6 });
                const cabeca = (conteudo: React.ReactNode, onAbrir?: () => void) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px" }}>
                    <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4 }}>{conteudo}</span>
                    {onAbrir && <button type="button" onClick={onAbrir} style={{ background: "none", border: "none", color: "#0369A1", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>abrir</button>}
                  </div>
                );
                const botao = (onClick: () => void, icone: string, rotulo: string, titulo: string, carregando = false, cor = "#475569") => (
                  <button type="button" onClick={onClick} disabled={carregando} title={titulo}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 8px", borderRadius: 7, border: `1px solid ${cor === "#475569" ? "#E2E8F0" : cor}`, background: "#fff", color: cor, fontSize: 11.5, fontWeight: 700, cursor: carregando ? "wait" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    <i className={`fas ${carregando ? "fa-spinner fa-spin" : icone}`} /> {rotulo}
                  </button>
                );
                const icone = (onClick: () => void, icone: string, titulo: string) => (
                  <button type="button" onClick={onClick} title={titulo} aria-label={titulo}
                    style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12 }}>
                    <i className={`fas ${icone}`} />
                  </button>
                );
                const linha = (chave: string, titulo: string, sub: string | null, acao: React.ReactNode) => (
                  <div key={chave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, background: "#fff", border: "1px solid #E2E8F0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
                      {sub && <div style={{ fontSize: 10.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
                    </div>
                    {acao}
                  </div>
                );
                const osId = (modalOSId || "").trim();
                const reqs = osVinc?.requisicoes || [];
                return (
                  <>
                    <div style={cartao("#0BB7CD")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cabeca(<><img src="/marcas/omie.png" alt="Omie" style={{ height: 16, width: "auto" }} /><span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "#64748b" }}>pedido e nota</span></>)}
                      {!pedidoOmie ? (
                        <>
                          <div style={{ fontSize: 12, color: "#64748b", padding: "0 2px" }}>Este pedido ainda não está no Omie.</div>
                          <button type="button" onClick={enviarOmie} disabled={enviandoOmie || !podeOmie} title={!podeOmie ? MSG_SEM_PERMISSAO : "Criar o Pedido de Venda no Omie"}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 36, borderRadius: 9, border: "none", background: podeOmie ? "#0BB7CD" : "#94A3B8", color: "#fefefe", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                            <i className={`fas ${enviandoOmie ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {enviandoOmie ? "Enviando..." : "Enviar para o Omie"}
                          </button>
                        </>
                      ) : (() => {
                        // faturado = o portal registrou OU a SEFAZ diz que a NF-e existe (faturado direto no Omie)
                        const nf = sefaz?.faturado && !sefaz.canceladaEm ? sefaz : null;
                        const faturado = !!faturadoEm || !!nf;
                        const remessa = tipoPedido === "Remessa";
                        const selo = (txt: string, cor: string, bg: string) => <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color: cor, background: bg }}>{txt}</span>;
                        const doc = (rotulo: string, numero: string, extra: React.ReactNode, acoes: React.ReactNode, chave: string) => (
                          <div key={chave} style={{ padding: "8px 10px", borderRadius: 8, background: "#fff", border: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 6 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "#64748b" }}>{rotulo}</div>
                              <div style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{numero}</div>
                            </div>
                            {extra}
                            <div style={{ display: "flex", gap: 6 }}>{acoes}</div>
                          </div>
                        );
                        return (
                          <>
                            {doc(remessa ? "Remessa" : "Pedido de venda", `nº ${numOmie}`,
                              faturado ? selo("Faturado", "#047857", "#d1fae5") : remessa ? selo("Remessa enviada", "#047857", "#d1fae5") : selo("Aguardando faturar", "#b45309", "#fef3c7"),
                              botao(abrirPdfOmiePPV, "fa-file-pdf", "PDF do pedido", "PDF oficial do pedido no Omie (gerado na hora)", baixandoPdfOmie, "#0891A8"), "pv")}
                            {faturado && !nf?.numero && (
                              <div style={{ padding: "8px 10px", borderRadius: 8, background: "#fefefe", border: "1px solid #bae6fd", color: "#075985" }}>
                                <div style={{ fontSize: 12, fontWeight: 800 }}><i className="fas fa-satellite-dish" /> Aguardando a nota da SEFAZ</div>
                                <div style={{ fontSize: 10.5, marginTop: 2 }}>O portal está buscando a NF-e. Aparece aqui sozinha.</div>
                                <div style={{ height: 5, borderRadius: 3, background: "rgba(11,183,205,.18)", overflow: "hidden", marginTop: 6 }}>
                                  <div className="ppv-nf-barra" style={{ height: "100%", width: "40%", borderRadius: 3, background: "#0BB7CD" }} />
                                </div>
                                <style>{`@keyframes ppvNfBarra { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } } .ppv-nf-barra { animation: ppvNfBarra 1.4s ease-in-out infinite; }`}</style>
                              </div>
                            )}
                            {faturado && nf?.numero && doc("Nota fiscal (NF-e)", `nº ${String(nf.numero).replace(/^0+/, "")}`,
                              <span style={{ fontSize: 11.5, color: "#64748b" }}>
                                {[nf?.emitidaEm ? `emitida em ${nf.emitidaEm}` : "", !faturadoEm ? "faturada direto no Omie" : ""].filter(Boolean).join(" · ") || "nota das peças"}
                              </span>,
                              botao(abrirDanfe, "fa-print", "Imprimir a nota", "Imprimir a NF-e (DANFE em PDF)", danfeLoading), "nf")}
                            {!faturado && !remessa && (
                              <button type="button" onClick={() => setShowFaturar(true)} disabled={!podeFaturar} title={!podeFaturar ? MSG_SEM_PERMISSAO : `Faturar (emite NF-e) — Omie nº ${numOmie}`}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 36, borderRadius: 9, border: "none", background: podeFaturar ? "#0BB7CD" : "#94A3B8", color: "#fefefe", fontWeight: 800, fontSize: 13, cursor: podeFaturar ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: podeFaturar ? "0 3px 10px rgba(11,183,205,.35)" : "none" }}>
                                <i className="fas fa-file-invoice-dollar" /> Faturar pedido
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div style={cartao("#DC2626")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cabeca(<><img src="/Logo_Nova.png" alt="Nova Tratores" style={{ height: 16, width: "auto" }} /><span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600, color: "#64748b" }}>portal</span></>)}
                      {ppvId && linha("ppv", ppvId, "pedido de peças (PDF do portal)", icone(gerarPDF, gerando ? "fa-spinner fa-spin" : "fa-print", `Imprimir o ${ppvId}`))}
                      {osId && (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "#64748b", margin: "4px 2px 0", display: "flex", alignItems: "center" }}>
                            <span style={{ flex: 1 }}>Ordem de serviço</span>
                            <button type="button" onClick={() => window.open(`/pos?id=${encodeURIComponent(osId)}`, "_blank")} style={{ background: "none", border: "none", color: "#0369A1", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, textTransform: "none", letterSpacing: 0 }}>abrir</button>
                          </div>
                          {linha("os", osId, [osVinc?.ordemOmie ? `Omie nº ${osVinc.ordemOmie.replace(/^0+/, "")}` : "", osVinc?.status || ""].filter(Boolean).join(" · ") || null,
                            icone(imprimirOSVinc, "fa-print", `Imprimir a OS ${osId}`))}
                          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "#64748b", margin: "4px 2px 0" }}>Requisições{reqs.length ? ` (${reqs.length})` : ""}</div>
                          {reqs.slice(0, 4).map((r) => linha(r.id, `Req. #${r.id}`, [r.material, r.valor > 0 ? `R$ ${r.valor.toFixed(2).replace(".", ",")}` : ""].filter(Boolean).join(" · ") || null,
                            icone(() => window.open(`/requisicoes/imprimir/${r.id}`, "_blank"), "fa-print", `Imprimir a requisição #${r.id}`)))}
                          {reqs.length > 4 && <div style={{ fontSize: 11, color: "#64748b" }}>+{reqs.length - 4} na OS (abrir a OS)</div>}
                          {!reqs.length && <div style={{ fontSize: 11, color: "#64748b", padding: "0 2px" }}>{osVinc ? "Nenhuma requisição na OS." : "Carregando…"}</div>}
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
              <div className="ppv-rail-acoes">
              <div className="ppv-rail-acoes-titulo">Ações</div>
              <button className="ppv-rail-btn" onClick={() => { setAbaAtiva("Itens da Venda"); onBuscaProduto(); }} disabled={!ppvId || !podeItem} title={!podeItem ? MSG_SEM_PERMISSAO : "Incluir item (busca, mais usados, catálogo ou kit)"}><i className="fas fa-plus-circle" /> Incluir</button>
              {/* Rastreio de unidades: tela de liberação por QR (feature pausada, mantida) */}
              {podeLiberarQR && ppvId && (
                <button className="ppv-rail-btn" onClick={() => window.open(`/ppv/liberacao/${encodeURIComponent(ppvId)}`, "_blank")}
                  title="Tela de liberação de peças por QR (escanear e liberar retiradas)">
                  <i className="fas fa-qrcode" /> Liberação (QR)
                </button>
              )}
              <button className="ppv-rail-btn" onClick={duplicarPedido} disabled={duplicando || !details} title="Duplicar este pedido"><i className={`fas ${duplicando ? "fa-spinner fa-spin" : "fa-copy"}`} /> {duplicando ? "Duplicando..." : "Duplicador"}</button>
              <button className="ppv-rail-btn" onClick={() => setShowAnexos(true)} disabled={!ppvId} title="Anexar mídia + comentário" style={{ position: "relative" }}>
                <i className="fas fa-paperclip" /> Anexos
                {anexosCount > 0 && <span title={`${anexosCount} anexo(s)/comentário(s)`} style={{ position: "absolute", left: 27, top: 8, minWidth: 8, height: 8, borderRadius: 999, background: "#c2570a", border: "1.5px solid #fbfcfe" }} />}
              </button>
              <button className="ppv-rail-btn" onClick={() => setShowLogs(!showLogs)}><i className="fas fa-history" /> Histórico</button>
              <button className="ppv-rail-btn" onClick={() => setShowTarefas(true)} disabled={!ppvId} title="Tarefas do pedido" style={{ position: "relative" }}>
                <i className="fas fa-tasks" /> Tarefas
                {tarefasPendentes > 0 && <span title={`${tarefasPendentes} tarefa(s) pendente(s)`} style={{ position: "absolute", left: 27, top: 8, minWidth: 8, height: 8, borderRadius: 999, background: "#c2570a", border: "1.5px solid #fbfcfe" }} />}
              </button>
              </div>
              <div className="ppv-rail-perigo">
                <button className="ppv-rail-btn" onClick={cancelarPedido} disabled={!podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Cancelar o pedido (exige motivo)"}><i className="fas fa-ban" /> Cancelar pedido</button>
              </div>
            </div>
          )}

          {/* ── Histórico (modal) ── */}
          {showLogs && (
            <div onClick={() => setShowLogs(false)} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 580, maxHeight: "82vh", borderRadius: 8, boxShadow: "0 24px 60px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #eef0f3" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 6, background: "#e8730c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}><i className="fas fa-history" /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>Histórico de Alterações</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Quem mudou o quê, e quando</div>
                  </div>
                  <button onClick={() => setShowLogs(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, width: 32, height: 32, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
                </div>
                <div style={{ overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {logsLoading ? (
                    <div className="ppv-loading" style={{ padding: "40px 20px" }}><div className="ppv-spinner" /><span>Carregando...</span></div>
                  ) : logs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8", fontSize: 13 }}>Nenhuma ação registrada.</div>
                  ) : (
                    logs.map((l, idx) => (
                      <div key={idx} style={{ border: "1px solid #E2E8F0", borderLeft: "3px solid #e8730c", borderRadius: 4, padding: "9px 12px", background: "#fff" }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b", lineHeight: 1.35 }}>{l.acao}</div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span><i className="far fa-user" style={{ marginRight: 4 }} />{l.usuario_email || "—"}</span>
                          <span><i className="far fa-clock" style={{ marginRight: 4 }} />{l.data_hora}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ModalDevolucao open={devolucaoOpen} produto={devolucaoProd} onClose={() => setDevolucaoOpen(false)} onConfirm={confirmarDevolucao} confirmando={confirmandoDev} />
      <ItemOrcamentoModal
        open={!!detalheProd}
        ppvId={ppvId}
        pedidoOmie={pedidoOmie}
        conta={detalheProd?.conta || "NOVA"}
        codigo={detalheProd?.codigo || null}
        descricao={detalheProd?.descricao}
        quantidade={detalheProd?.quantidade}
        preco={detalheProd?.preco}
        userName={userProfile?.nome || ""}
        onClose={() => setDetalheProd(null)}
        showToast={showToast}
        itens={produtosComSaldo.map((p) => ({ codigo: p.codigo, descricao: p.descricao, conta: (p.empresa || "").toLowerCase().includes("primari") ? "CASTRO" : "NOVA", quantidade: p.saldo, preco: p.preco }))}
        onIrPara={(item) => setDetalheProd(item)}
      />
      <ModalImportarKit open={kitModalOpen} onClose={() => setKitModalOpen(false)} onImportar={(produtos) => importarKitItens(produtos)} />
      {showFaturar && <FaturarModal
        open={showFaturar}
        ppvId={ppvId}
        numeroPedido={pedidoOmie}
        userName={userProfile?.nome || ""}
        onClose={() => setShowFaturar(false)}
        onDone={() => {
          // Faturou: já está gravado no banco. Fecha o drawer SEM re-salvar (o
          // fecharComSalvar sobrescreveria o status). Marca dirty p/ o Kanban atualizar.
          setFaturadoEm(new Date().toISOString());
          setStatus("Concluída");
          onDirty?.();
          onClose();
        }}
        showToast={showToast}
      />}
      <AnexosModal open={showAnexos} ppvId={ppvId} autor={userProfile?.nome || ""} onClose={() => setShowAnexos(false)} onChanged={recarregarAnexosCount} showToast={showToast} />
      <TarefasModal open={showTarefas} ppvId={ppvId} userName={userProfile?.nome || ""} onClose={() => setShowTarefas(false)} onChanged={recarregarTarefasCount} showToast={showToast} />
      {cliOmie.aberto && (cliOmie.dados || cliOmie.doc
        ? <ClienteOmieModal cliente={cliOmie.dados} cnpj={cliOmie.doc} fechar={() => setCliOmie((c) => ({ ...c, aberto: false }))} />
        : <div style={{ position: "fixed", inset: 0, zIndex: 100010, background: "rgba(15,23,42,.35)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setCliOmie((c) => ({ ...c, aberto: false }))}>
            <div style={{ background: "#fefefe", borderRadius: 10, padding: "16px 22px", fontSize: 13.5, color: "#334155" }}><i className="fas fa-spinner fa-spin" /> Buscando o cliente no Omie…</div>
          </div>)}
      <SelecionarUsuarioModal open={showVendedor} atual={tecnico} onClose={() => setShowVendedor(false)} onSelect={(nome) => setTecnico(nome)} />
      {/* Busca de cliente do PRÓPRIO drawer — escreve direto no estado daqui */}
      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={aplicarCliente} />
      {/* Scan-to-add: escaneia o QR da etiqueta → adiciona o item e reserva a
          unidade (rastreio de unidades — feature pausada, mantida) */}
      <QRScanner
        open={scanAddAberto}
        onClose={() => setScanAddAberto(false)}
        onScan={scanAdicionarUnidade}
        titulo="Adicionar peça por QR"
        subtitulo={ppvId ? `${ppvId} · cada leitura adiciona 1 un e reserva a unidade` : undefined}
      />

      {/* Cancelamento: pede o MOTIVO antes de tudo, depois cancela no Omie + portal */}
      {cancelarOpen && (
        <div onClick={() => !cancelando && setCancelarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
              <i className="fas fa-ban" style={{ color: "#dc2626" }} />
              <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Cancelar Pedido de Venda{pedidoOmie ? ` nº ${numOmie}` : ""}</div>
              <button onClick={() => setCancelarOpen(false)} disabled={cancelando} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Motivo do cancelamento <span style={{ color: "#dc2626" }}>*</span></label>
              <textarea autoFocus rows={3} value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)} placeholder="Descreva o motivo do cancelamento…"
                style={{ width: "100%", borderRadius: 4, border: "1px solid #d1d5db", padding: "9px 11px", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              {pedidoOmie && <div style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}><i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />Isto cancela o pedido também no Omie.</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={confirmarCancelamento} disabled={cancelando || !cancelMotivo.trim()}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 4, border: "none", fontSize: 14, fontWeight: 700, cursor: cancelando || !cancelMotivo.trim() ? "not-allowed" : "pointer", background: cancelMotivo.trim() ? "#dc2626" : "#fca5a5", color: "#fff" }}>
                  {cancelando ? "Cancelando…" : "Confirmar cancelamento"}
                </button>
                <button onClick={() => setCancelarOpen(false)} disabled={cancelando} style={{ padding: "10px 16px", borderRadius: 4, border: "1px solid #E2E8F0", background: "#fff", color: "#334155", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Voltar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
