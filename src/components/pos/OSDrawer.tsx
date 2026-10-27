"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { useMarcarCaso } from "@/lib/uso/caso";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { VALOR_HORA, VALOR_KM, TEXT_TEMPLATE, PHASES } from "@/lib/pos/constants";
import { faltaParaEnviarOmie } from "@/lib/pos/envio-omie-regras";
import { authHeaders, fetchAuth } from "@/lib/auth/client";
import type { ClienteOption, ClienteDados, Produto, AlimentacaoItem } from "@/lib/pos/types";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";
import SearchModal from "./SearchModal";
import LogPanel from "./LogPanel";
import EmailsPecasOS from "./EmailsPecasOS";
import ModalBuscaProduto from "@/components/ppv/ModalBuscaProduto";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import ItemOrcamentoModal from "@/components/ppv/ItemOrcamentoModal";
import ModalEditarItemOS from "./ModalEditarItemOS";
import { PPVMiniProvider } from "@/lib/ppv/PPVContext";
import OSGarantiaInfo from "@/components/garantias/OSGarantiaInfo";
import MaquinasClienteIcone from "@/components/MaquinasClienteIcone";
import LocalizacaoClienteModal from "./LocalizacaoClienteModal";
import OSUnidadesInfo from "@/components/ppv/OSUnidadesInfo";
import OcorrenciaFormModal from "@/components/ocorrencias/OcorrenciaFormModal";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import FaturamentoOSBloco from "./FaturamentoOSBloco";
import SubstituirOmieModal from "./SubstituirOmieModal";
import EditarPPVsModal from "./EditarPPVsModal";
import NovaRequisicaoOSModal from "./NovaRequisicaoOSModal";
import NotasFiscaisBloco from "./NotasFiscaisBloco";
import EnviarOmieModal, { type FaseEnvioOmie } from "./EnviarOmieModal";
import AnexosModal from "@/components/ppv/AnexosModal";
import TarefasModal from "@/components/ppv/TarefasModal";
import ChequeRevisaoBloco from "./ChequeRevisaoBloco";
import AssinaturaClienteBloco from "./AssinaturaClienteBloco";
import ResservicoBloco from "./ResservicoBloco";
import ComissaoOSBloco from "./ComissaoOSBloco";
import TemparioOSBloco from "./TemparioOSBloco";
import ModalNovoCliente from "@/components/clientes/ModalNovoCliente";
import ModalNovaMaquina from "@/components/clientes/ModalNovaMaquina";
import MaquinasClienteDestaque from "./MaquinasClienteDestaque";
// Cobrança das requisições + lembretes ligados à OS (José, 26/10/2026)
import { SeloCobranca, AcoesCobranca, AvisoCobrancaOS, temCobranca, statusCobranca, type ReqCobranca } from "./CobrancaRequisicao";
import LembretesDaOS from "./LembretesDaOS";
import { ModalValorLembrete, ModalMotivoDesconto, IconeMotivoDesconto, temValorPendente, tituloLembrete, valorDoLembrete, type LembreteValor } from "./ValoresLembreteOS";
import { GradeServicosOmie, AbaDepartamentos, AbaInfoAdicionais, AbaParcelas, AbaEmail, ClienteOmieModal, SeletorCondicao, SeletorTecnicos, Chave, useListasOmie } from "./OSOmieAbas";
import { espelhoPadrao, normalizarEspelho, aplicarInterna, totalExtras, type OmieEspelho } from "@/lib/pos/omie-espelho";
import type { DocAnterior } from "@/lib/pos/omie-anteriores";

// Previsão de faturamento vazia = hoje (José, 13/10/2026), no fuso de São Paulo, "aaaa-mm-dd".
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

interface OSDrawerProps {
  visible: boolean;
  mode: "create" | "edit";
  osId: string | null;
  clientes: ClienteOption[];
  /** atalho "Novo cliente": a página insere o criado na lista na hora */
  onClienteCriado?: (c: ClienteOption) => void;
  tecnicos: string[];
  userName?: string;
  onClose: () => void;
  onSaved: () => void;
  valorHora?: number;
  valorKm?: number;
  podeEditar?: boolean;
  podeOmie?: boolean;
  podeConcluir?: boolean;
  podeCancelar?: boolean;
  /** veio do botão Faturar da capa: abre a janela de faturar assim que der */
  abrirFaturar?: boolean;
}

/* ── Inline style constants (avoid new refs each render) ── */
const S_FLEX1 = { flex: 1 } as const;
const S_FLEX2 = { flex: 2 } as const;
const S_MB0 = { marginBottom: 0 } as const;
const S_MT12 = { marginTop: 12 } as const;
const S_SEARCH_ICON = { position: "absolute" as const, left: 14, top: 13, color: "var(--portal-text-secondary)" };
const S_SEARCH_INPUT = { paddingLeft: 40, marginBottom: 0 };
const S_POINTER_BOLD = { cursor: "pointer" as const, fontWeight: 600 };
const S_POINTER_BOLD_MB0 = { cursor: "pointer" as const, fontWeight: 600, marginBottom: 0 };
const S_MONO_MB0 = { fontFamily: "monospace", marginBottom: 0 };
const S_RELATIVE = { position: "relative" as const };
const printMenuItem: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "9px 10px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "var(--portal-text)", borderRadius: 7 };
const S_EMPTY_RESULT = { padding: 16, textAlign: "center" as const, color: "var(--portal-text-secondary)", fontSize: 13 };
const S_CLIENT_ITEM_WRAP = { flex: 1, minWidth: 0 };
const S_CLIENT_ITEM_NAME = { fontSize: 13, fontWeight: 600 };
const S_CLIENT_ITEM_SUB = { fontSize: 11, color: "var(--portal-text-secondary)" };
const S_REQ_MATERIAL = { color: "var(--portal-text-secondary)", flex: 1, textAlign: "right" as const, fontSize: 12 };
const S_PRODUTO_VALOR = { fontWeight: 600 };
const S_SPINNER_LOADING = { width: 28, height: 28, borderColor: "var(--portal-border)", borderTopColor: "var(--portal-text-secondary)" };
const S_MR6 = { marginRight: 6 };
const S_DISC_BADGE = { fontSize: 11, color: "#C41E2A", fontWeight: 700, marginLeft: "auto" };
const S_REQ_BOLD = { fontWeight: 600 };

const STATUS_BADGE_STYLE = (status: string) => ({
  fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px",
  padding: "4px 12px", borderRadius: 6,
  background: status.includes("Exec") ? "#FEF3C7" : status === "Concluída" ? "#D1FAE5" : status === "Cancelada" ? "#FEE2E2" : "#E8E0D0",
  color: status.includes("Exec") ? "#92400E" : status === "Concluída" ? "#065F46" : status === "Cancelada" ? "#991B1B" : "#1E3A5F",
});

const BOMBA_HORAS = ["600", "1200", "1800", "2400", "3000"];

function horaAtualBR() {
  const n = new Date();
  const brMs = n.getTime() + (n.getTimezoneOffset() * 60000) - (3 * 3600000);
  const br = new Date(brMs);
  return `${String(br.getHours()).padStart(2, '0')}:${String(br.getMinutes()).padStart(2, '0')}`;
}

export default function OSDrawer({ visible, mode, osId, clientes, onClienteCriado, tecnicos, userName, onClose, onSaved, valorHora: propValorHora, valorKm: propValorKm, podeEditar = true, podeOmie = true, podeConcluir = true, podeCancelar = true, abrirFaturar = false }: OSDrawerProps) {
  // valor da hora/km DESTA OS (editável com dois cliques na linha); sem ele, o da configuração
  const [unitHr, setUnitHr] = useState<number | null>(null);
  // faturou agora: o bloco de notas mostra "aguardando" e confere de 15 em 15 s
  const [notasEsperaDesde, setNotasEsperaDesde] = useState<number | null>(null);
  const [unitKm, setUnitKm] = useState<number | null>(null);
  const VH = unitHr ?? propValorHora ?? VALOR_HORA;
  const VK = unitKm ?? propValorKm ?? VALOR_KM;
  // Ocorrência rápida por OS (categoria OS pré-selecionada, técnico da OS)
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeOcorrencia = pode("painel-mecanicos", "criar_ocorrencia");
  const podeCriarOS = pode("pos", "criar");
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [clienteChave, setClienteChave] = useState("");
  const [clienteInfo, setClienteInfo] = useState<ClienteDados | null>(null);
  const [status, setStatus] = useState("Orçamento");
  // Fase que o BANCO tinha quando a janela carregou (ou depois de uma ação do servidor).
  // O salvar manda junto: se a pessoa não mexeu na fase, o servidor não regrava a fase velha
  // por cima do que o robô ou o Tratorilson moveram enquanto a janela estava aberta.
  const statusDoBanco = useRef<string | null>(null);
  const setStatusDoServidor = (s: string) => { statusDoBanco.current = s; setStatus(s); };
  // OS faturada (NFS-e ou recibo): fase trancada — só pode ir para Concluída (o servidor também recusa)
  const [faturadaEm, setFaturadaEm] = useState<string | null>(null);
  const [tecnico1, setTecnico1] = useState("");
  const [tecnico2, setTecnico2] = useState("");
  const [tipoServico, setTipoServico] = useState("Manutenção");
  const [projeto, setProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [servSolicitado, setServSolicitado] = useState(TEXT_TEMPLATE);
  const [observacoes, setObservacoes] = useState("");
  const [showLembretes, setShowLembretes] = useState(false);
  const [mostrarTrocaCliente, setMostrarTrocaCliente] = useState(false);
  const [descontoModoOS, setDescontoModoOS] = useState<"pct" | "valor">("pct");
  const [ppv, setPpv] = useState("");
  const [qtdHoras, setQtdHoras] = useState(1);
  const [qtdKm, setQtdKm] = useState(0);
  const [descPorc, setDescPorc] = useState(0);
  const [descValor, setDescValor] = useState(0);
  const [descHoraValor, setDescHoraValor] = useState(0);
  const [descKmValor, setDescKmValor] = useState(0);
  const [ordemOmie, setOrdemOmie] = useState("");
  // Pendência Mahindra gravada na OS (vigia de revisões / checagem na criação)
  const [pendenciaMahindra, setPendenciaMahindra] = useState<string[]>([]);
  const [pedidoVenda, setPedidoVenda] = useState("");
  const [omieLog, setOmieLog] = useState("");
  // PDF da OS no Omie (osdocs · ObterOS) — aparece depois do "Enviar Omie".
  // O Omie GERA o documento na hora a cada clique (nunca é versão velha);
  // guardamos a data da última alteração no Omie pra mostrar embaixo do botão.
  const [baixandoPdfOmie, setBaixandoPdfOmie] = useState(false);
  const [omieAlteradaEm, setOmieAlteradaEm] = useState("");
  const abrirPdfOmie = useCallback(async () => {
    if (!osId || baixandoPdfOmie) return;
    setBaixandoPdfOmie(true);
    const win = window.open("", "_blank"); // abre no clique (evita bloqueio de pop-up)
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/pdf-omie`, { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { win?.close(); alert(d.error || "Não consegui obter o PDF da ordem no Omie."); return; }
      if (d.alteradaEm) setOmieAlteradaEm(String(d.alteradaEm));
      if (win) win.location.href = d.url; else window.open(d.url, "_blank");
    } catch {
      win?.close(); alert("Erro de conexão ao buscar o PDF no Omie.");
    } finally { setBaixandoPdfOmie(false); }
  }, [osId, baixandoPdfOmie]);
  // PDF do pedido de PEÇAS vinculado (PPV) — atalho pela própria OS.
  // Só aparece quando o PPV JÁ virou pedido/remessa no Omie; o rótulo mostra
  // o número do Omie (não o id do PPV).
  const [ppvOmieMap, setPpvOmieMap] = useState<Record<string, string>>({});
  // empresa de cada pedido/remessa no Omie (pedido da Castro aparece com "CASTRO")
  const [ppvEmpresaMap, setPpvEmpresaMap] = useState<Record<string, string>>({});
  const [ppvOmieCarregando, setPpvOmieCarregando] = useState(false);
  // Substituir a OS/pedido no Omie (só Dev ou quem um Dev liberou)
  const [omieRefresh, setOmieRefresh] = useState(0);
  // PPV da OS que ficou fora do Omie (ex.: produto não achado) → reenviar só as peças
  const [enviandoPecas, setEnviandoPecas] = useState<string | null>(null);
  const [msgPecas, setMsgPecas] = useState<{ ok: boolean; texto: string } | null>(null);
  const [substituindo, setSubstituindo] = useState(false);
  const [podeSubstituir, setPodeSubstituir] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/pos/ordens/x/substituir", { headers: await authHeaders() });
        const j = r.ok ? await r.json() : null;
        if (ativo) setPodeSubstituir(!!j?.pode);
      } catch { /* sem atalho */ }
    })();
    return () => { ativo = false; };
  }, [visible]);
  useEffect(() => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    if (!visible || ids.length === 0) { setPpvOmieMap({}); return; }
    let ativo = true;
    setPpvOmieCarregando(true);
    (async () => {
      const mapa: Record<string, string> = {};
      const emp: Record<string, string> = {};
      await Promise.all(ids.map(async (pid) => {
        try {
          const r = await fetch(`/api/ppv/pedidos?id=${encodeURIComponent(pid)}`);
          const j = r.ok ? await r.json() : null;
          if (j?.pedidoOmie) mapa[pid] = String(j.pedidoOmie);
          if (j?.omieEmpresa) emp[pid] = String(j.omieEmpresa);
        } catch { /* sem Omie ainda */ }
      }));
      if (ativo) { setPpvOmieMap(mapa); setPpvEmpresaMap(emp); setPpvOmieCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [ppv, visible, ordemOmie, omieRefresh]);
  const [baixandoPdfPecas, setBaixandoPdfPecas] = useState<string | null>(null);
  const abrirPdfPecasOmie = useCallback(async (pid: string) => {
    if (!pid || baixandoPdfPecas) return;
    setBaixandoPdfPecas(pid);
    const win = window.open("", "_blank");
    try {
      const r = await fetch(`/api/ppv/pedidos/pdf-omie?id=${encodeURIComponent(pid)}`, { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { win?.close(); alert(d.error || "Não consegui obter o PDF do pedido no Omie."); return; }
      if (win) win.location.href = d.url; else window.open(d.url, "_blank");
    } catch {
      win?.close(); alert("Erro de conexão ao buscar o PDF no Omie.");
    } finally { setBaixandoPdfPecas(null); }
  }, [baixandoPdfPecas]);
  const [motivoCancel, setMotivoCancel] = useState("");
  // Cancelar exige MOTIVO: modal central intercepta a troca pra "Cancelada"
  // (só efetiva com o motivo preenchido).
  const [cancelModal, setCancelModal] = useState(false);
  const [motivoTmp, setMotivoTmp] = useState("");
  const mudarStatus = (novo: string) => {
    if (faturadaEm && novo !== status && novo !== "Concluída") {
      alert("Esta OS já foi faturada no Omie (NFS-e ou recibo): a fase fica travada — só pode ir para Concluída.");
      return;
    }
    if (novo === "Cancelada" && status !== "Cancelada") {
      setMotivoTmp(motivoCancel);
      setCancelModal(true);
      return; // o status só muda quando confirmar o motivo no modal
    }
    setStatus(novo);
  };
  const [temSubstituto, setTemSubstituto] = useState(false);
  const [substitutoTipo, setSubstitutoTipo] = useState<"POS" | "PPV">("POS");
  const [substitutoId, setSubstitutoId] = useState("");
  const [listaOSAbertas, setListaOSAbertas] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [listaPPVAbertos, setListaPPVAbertos] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [relatorioTecnico, setRelatorioTecnico] = useState("");
  const [previsaoExecucao, setPrevisaoExecucao] = useState("");
  const [previsaoFaturamento, setPrevisaoFaturamento] = useState("");
  const [dataFimServico, setDataFimServico] = useState("");
  const [horaInicioServico, setHoraInicioServico] = useState("");
  const [diasExecucao, setDiasExecucao] = useState<string[]>([]);
  const [servicoNumero, setServicoNumero] = useState(0);
  const [horaInicioExec, setHoraInicioExec] = useState(() => {
    return horaAtualBR();
  });
  const [horaChegada, setHoraChegada] = useState("");
  const [horaFimExec, setHoraFimExec] = useState("");
  const [agendaTecnico, setAgendaTecnico] = useState<Array<{ id_ordem: string; cliente: string; hora_inicio: string; hora_fim: string; qtd_horas: number }>>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalPecas, setTotalPecas] = useState(0);
  // Adicionar peça direto no PPV vinculado, a partir da OS
  const [showAddProdModal, setShowAddProdModal] = useState(false);
  const [addProdTarget, setAddProdTarget] = useState("");
  const [addProdQtd, setAddProdQtd] = useState(1);
  const [addingProduto, setAddingProduto] = useState(false);
  // Criação: peças escolhidas antes de a OS existir — entram no PPV que nasce
  // junto com ela; e "abrir requisição" depois de criar (já ligada à OS)
  const [pecasPendentes, setPecasPendentes] = useState<{ codigo: string; descricao: string; preco: number; quantidade: number; kit?: string }[]>([]);
  const [abrirReqDepois, setAbrirReqDepois] = useState(false);
  // Peça da lista: info (mesmo modal do PPV ao clicar no código) e edição
  const [detalheProd, setDetalheProd] = useState<Produto | null>(null);
  const [editandoProd, setEditandoProd] = useState<Produto | null>(null);
  const [saving, setSaving] = useState(false);
  const [aba, setAba] = useState<"os" | "ppv">("os");
  // Sub-abas no padrão Omie (modelo aprovado 04/09): cada card vive numa aba
  const [abaOmie, setAbaOmie] = useState<"servicos" | "produtos" | "requisicoes" | "relatorio" | "garantia" | "obs" | "dados" | "deptos" | "info" | "parcelas" | "email">("servicos");
  // OS no formato do Omie (José, 13/10/2026): o que o Omie tem e o portal não tinha
  const [esp, setEspRaw] = useState<OmieEspelho>(() => espelhoPadrao());
  const setEsp = useCallback((f: (e: OmieEspelho) => OmieEspelho) => setEspRaw((e) => f(e)), []);
  const [verClienteOmie, setVerClienteOmie] = useState(false);
  const [editarPPVs, setEditarPPVs] = useState(false);
  const [novaReqOS, setNovaReqOS] = useState(false);
  const listasOmie = useListasOmie(visible && mode === "edit", String(ordemOmie || "").replace(/^0+(?=\d)/, ""), clienteInfo?.cpf || "");
  const [loadingData, setLoadingData] = useState(false);
  // Incrementado após importar um orçamento → força recarregar os dados da OS
  const [reloadKey, setReloadKey] = useState(0);
  const [showProjModal, setShowProjModal] = useState(false);
  const [verLocalizacao, setVerLocalizacao] = useState(false);
  // atalhos de cadastro (criam no Omie e já usam na OS)
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showNovaMaquina, setShowNovaMaquina] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [printMenu, setPrintMenu] = useState(false);
  // O rail tem overflow-y:auto e cortava o menu; abrimos ele em position:fixed.
  const printBtnRef = useRef<HTMLButtonElement | null>(null);
  const [printPos, setPrintPos] = useState<{ top: number; left: number } | null>(null);
  const abrirPrintMenu = useCallback(() => {
    const r = printBtnRef.current?.getBoundingClientRect();
    if (r) setPrintPos({ top: r.top, left: Math.max(8, r.left - 246) });
    setPrintMenu((o) => !o);
  }, []);

  // Requisições que o usuário desmarcou no menu de imprimir: saem da folha e
  // da soma da impressão (escolha só na hora de imprimir, igual "sem peças").
  const [reqsOcultasPrint, setReqsOcultasPrint] = useState<Set<string>>(new Set());
  const toggleReqPrint = useCallback((rid: string) => {
    setReqsOcultasPrint((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid); else next.add(rid);
      return next;
    });
  }, []);

  // Imprime a OS (com ou sem a lista de peças) ou o PDF do PPV vinculado.
  const imprimirOS = useCallback((comPecas: boolean) => {
    setPrintMenu(false);
    const w = window.open("", "_blank");
    if (!w) return;
    const ocultas = [...reqsOcultasPrint].join(",");
    fetch(`/api/pos/ordens/${osId}/print?pecas=${comPecas ? 1 : 0}${ocultas ? `&reqocultas=${encodeURIComponent(ocultas)}` : ""}`)
      .then((r) => r.text()).then((html) => { w.document.write(html); w.document.close(); })
      .catch(() => w.close());
  }, [osId, reqsOcultasPrint]);

  const imprimirPPV = useCallback((ppvId: string) => {
    setPrintMenu(false);
    const w = window.open("", "_blank");
    if (!w) return;
    fetch(`/api/ppv/pdf?id=${encodeURIComponent(ppvId)}`)
      .then((r) => r.json()).then((d) => {
        if (d?.html) { w.document.write(d.html); w.document.close(); }
        else { w.close(); alert("Não consegui gerar o PDF do PPV " + ppvId); }
      }).catch(() => { w.close(); });
  }, []);

  // QR Code da OS: link público de VISUALIZAÇÃO (view=1) que relê o banco a cada
  // abertura — o mesmo QR sempre mostra a OS atualizada.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrLink, setQrLink] = useState("");
  const [qrCopiado, setQrCopiado] = useState(false);
  const [qrObs, setQrObs] = useState("");
  const abrirQR = useCallback(async () => {
    if (!osId) return;
    const link = `${window.location.origin}/api/pos/ordens/${osId}/print?view=1`;
    setQrLink(link); setQrCopiado(false); setQrDataUrl(""); setQrObs("");
    setQrOpen(true);
    try { setQrDataUrl(await QRCode.toDataURL(link, { width: 720, margin: 1 })); } catch { /* mostra erro simples */ }
  }, [osId]);
  const imprimirQR = useCallback(() => {
    if (!qrDataUrl) return;
    const esc = (s: string) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
    const obs = qrObs.trim();
    const obsHtml = obs
      ? `<div style="font-size:14px;color:#111827;white-space:pre-wrap;line-height:1.6">${esc(obs)}</div>`
      : `<div style="border-bottom:1px solid #cbd5e1;height:24px"></div><div style="border-bottom:1px solid #cbd5e1;height:24px;margin-top:16px"></div><div style="border-bottom:1px solid #cbd5e1;height:24px;margin-top:16px"></div>`;
    // nome do cliente sob o número — identifica de quem é o QR impresso
    const clienteHtml = clienteInfo?.nome
      ? `<div style="font-size:17px;font-weight:700;color:#334155;margin:-16px 0 22px">${esc(clienteInfo.nome)}</div>`
      : "";
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>QR OS ${osId}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:44px 24px;margin:0">
      <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#94a3b8">Ordem de Serviço</div>
      <div style="font-size:36px;font-weight:800;color:#111827;margin:4px 0 22px">${osId}</div>
      ${clienteHtml}
      <img src="${qrDataUrl}" style="width:320px;max-width:80vw"/>
      <div style="font-size:15px;color:#475569;max-width:380px;margin:20px auto 0;line-height:1.6">Aponte a câmera do celular para o QR Code para acompanhar esta ordem de serviço — sempre atualizada.</div>
      <div style="text-align:left;max-width:400px;margin:26px auto 0;border-top:1px solid #e5e7eb;padding-top:14px">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px">Observações</div>
        ${obsHtml}
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
    </body></html>`);
    w.document.close();
  }, [qrDataUrl, osId, qrObs, clienteInfo]);

  const [logRefreshKey, setLogRefreshKey] = useState(0);
  // Tarefas e anexos da OS (mesmas janelas/tabelas do PPV, com o id da OS)
  const [showTarefas, setShowTarefas] = useState(false);
  const [showAnexos, setShowAnexos] = useState(false);
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [anexosCount, setAnexosCount] = useState(0);
  const [duplicando, setDuplicando] = useState(false);
  const avisar = useCallback((t: "success" | "error", m: string) => { if (t === "error") alert(m); }, []);
  const recarregarTarefasCount = useCallback(async () => {
    if (!osId) { setTarefasPendentes(0); return; }
    try {
      const r = await fetch(`/api/ppv/tarefas?id=${encodeURIComponent(osId)}`, { headers: await authHeaders() });
      const j = await r.json();
      setTarefasPendentes(r.ok ? (j.pendentes || 0) : 0);
    } catch { setTarefasPendentes(0); }
  }, [osId]);
  const recarregarAnexosCount = useCallback(async () => {
    if (!osId) { setAnexosCount(0); return; }
    try {
      const r = await fetch(`/api/ppv/anexos?id=${encodeURIComponent(osId)}`);
      const j = await r.json();
      setAnexosCount(r.ok ? (j.anexos || []).length : 0);
    } catch { setAnexosCount(0); }
  }, [osId]);
  useEffect(() => {
    if (!visible || !osId) return;
    void recarregarTarefasCount(); void recarregarAnexosCount();
    // veio da notificação da tarefa (?tarefas=1) → abre as tarefas
    try { if (new URLSearchParams(window.location.search).get("tarefas") === "1") setShowTarefas(true); } catch { /* sem URL */ }
  }, [visible, osId, recarregarTarefasCount, recarregarAnexosCount]);
  const [garantiaVinculada, setGarantiaVinculada] = useState(false);
  useEffect(() => {
    if (!visible || !osId) return;
    let ativo = true;
    fetchAuth(`/api/garantias?os=${encodeURIComponent(osId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (ativo) setGarantiaVinculada(!!(d?.garantias || []).length); })
      .catch(() => { /* sem garantia */ });
    return () => { ativo = false; };
  }, [visible, osId]);
  const [omieAnteriores, setOmieAnteriores] = useState<DocAnterior[]>([]);
  const [requisicoes, setRequisicoes] = useState<Array<{ id: string; atualizada: boolean; valor: number; material: string; solicitante: string; tipo?: string | null; status?: string | null; cobranca_status?: string | null; cobranca_motivo?: string | null; cobranca_por?: string | null; cobranca_em?: string | null }>>([]);
  const [desvinculandoReq, setDesvinculandoReq] = useState<string | null>(null);
  const [justificativaDesvinc, setJustificativaDesvinc] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");
  const [gerarPPV, setGerarPPV] = useState(false);
  const [servicoOficina, setServicoOficina] = useState(false);
  const [servicoInterno, setServicoInterno] = useState(false);
  const internoOriginalRef = useRef(false);
  const [alimentacoes, setAlimentacoes] = useState<AlimentacaoItem[]>([]);
  // Fotos das notas de almoço enviadas pelo técnico, casadas por dia ({ data → foto }).
  const [fotosAlmocoDia, setFotosAlmocoDia] = useState<Record<string, string>>({});
  // upload da NOTA pelo admin — anexou, a despesa automática abre NA HORA
  const [enviandoNota, setEnviandoNota] = useState<number | null>(null);
  const notaFileRef = useRef<HTMLInputElement>(null);
  const notaIdxRef = useRef<number>(-1);

  const anexarNota = async (idx: number, file: File | null) => {
    if (!file || !osId) return;
    const item = alimentacoes[idx];
    if (!item?.data) { alert("Informe a DATA da alimentação antes de anexar a nota."); return; }
    setEnviandoNota(idx);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("data", item.data);
      fd.set("valor", String(item.valor || 0));
      fd.set("tecnicos", JSON.stringify(item.tecnicos || []));
      const r = await fetch(`/api/pos/ordens/${osId}/alimentacao-nota`, {
        method: "POST", headers: await authHeaders(), body: fd,
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || "Falha ao anexar a nota."); return; }
      setAlimentacoes(prev => prev.map((x, i) => i === idx ? { ...x, foto: d.foto_url } : x));
      if (d.criada) {
        alert(`Nota anexada — despesa de alimentação #${d.requisicao_id} criada em nome do técnico${d.status === 'financeiro' ? ' e já ENVIADA PRO FINANCEIRO' : ', EM ABERTO na fase Pedido (vai pro financeiro quando a OS concluir)'}.`);
      } else {
        alert(`Nota anexada. ${d.aviso || ""}`.trim());
      }
    } catch (e) { alert(String(e)); } finally { setEnviandoNota(null); }
  };
  const [enviandoOmie, setEnviandoOmie] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [showDescontos, setShowDescontos] = useState(false);
  const [dadosTecnico, setDadosTecnico] = useState<any>(null);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  const [lembretes, setLembretes] = useState<Array<LembreteValor>>([]);
  // Lembrete com valor (cobrar / crédito) ao abrir a OS + motivo do desconto (José, 27/10/2026)
  const [lembretesAdiados, setLembretesAdiados] = useState<number[]>([]);
  const [aplicandoLembrete, setAplicandoLembrete] = useState(false);
  const [salvarPendente, setSalvarPendente] = useState(false);
  const concluirAoSalvarRef = useRef<Array<{ id: number; nota: string; resto?: number }>>([]);
  /** desconto geral que já tem motivo (o carregado da OS conta como explicado) */
  const descExplicadoRef = useRef(0);
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [editingLembreteId, setEditingLembreteId] = useState<number | null>(null);
  const [editingLembreteText, setEditingLembreteText] = useState("");
  const [estimativa, setEstimativa] = useState<{
    ida: { distancia_km: number; tempo_min: number };
    volta: { distancia_km: number; tempo_min: number };
    servico: { horas: number; tempo_min: number };
    total: { tempo_min: number; tempo_horas: number; distancia_total_km: number };
    enderecoUsado: string;
    fonte?: string;
    enderecosDisponiveis?: { label: string; fonte: string; endereco: string }[];
  } | null>(null);
  const [loadingEstimativa, setLoadingEstimativa] = useState(false);
  const [erroEstimativa, setErroEstimativa] = useState("");
  const [enderecoEstimativa, setEnderecoEstimativa] = useState("");
  const [enderecosDisponiveis, setEnderecosDisponiveis] = useState<{ label: string; fonte: string; endereco: string }[]>([]);

  // Ref para evitar loop circular entre diasExecucao <-> qtdHoras

  // Auto-calcular hora chegada (início + tempo_ida) e hora fim (chegada + qtdHoras)
  useEffect(() => {
    if (!horaInicioExec) return;
    const [h, m] = horaInicioExec.split(':').map(Number);
    const inicioMin = h * 60 + m;
    const idaMin = estimativa?.ida?.tempo_min || 0;
    const chegadaMin = inicioMin + idaMin;
    const ch = Math.floor(chegadaMin / 60);
    const cm = Math.round(chegadaMin % 60);
    setHoraChegada(`${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`);
    if (qtdHoras && qtdHoras > 0) {
      const fimMin = chegadaMin + qtdHoras * 60;
      const fh = Math.floor(fimMin / 60);
      const fm = Math.round(fimMin % 60);
      setHoraFimExec(`${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`);
    }
  }, [horaInicioExec, qtdHoras, estimativa]);

  // diasExecucao agora só tem datas, sem horários

  // Sync: qtdHoras manual
  const handleQtdHorasChange = useCallback((novaQtd: number) => {
    setQtdHoras(novaQtd);
  }, []);

  // Buscar agenda do técnico quando muda técnico + data de execução
  useEffect(() => {
    if (!tecnico1 || !previsaoExecucao) { setAgendaTecnico([]); return; }
    fetch(`/api/pos/agenda-visao?data=${previsaoExecucao}&tecnico=${encodeURIComponent(tecnico1)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const outros = rows
          .filter((r: any) => r.id_ordem && String(r.id_ordem) !== String(osId))
          .map((r: any) => ({ id_ordem: r.id_ordem, cliente: r.cliente || '', hora_inicio: r.hora_inicio || '', hora_fim: r.hora_fim || '', qtd_horas: r.qtd_horas || 0 }));
        setAgendaTecnico(outros);
      })
      .catch(() => setAgendaTecnico([]));
  }, [tecnico1, previsaoExecucao, osId]);

  // Verificar quantos serviços em execução o técnico tem
  useEffect(() => {
    if (!tecnico1) { setServicoNumero(0); return; }
    fetch(`/api/pos/tecnicos?contarServicos=${encodeURIComponent(tecnico1)}&osAtual=${osId || ''}`)
      .then(r => r.ok ? r.json() : { servicosEmExecucao: 0 })
      .then((data: any) => {
        setServicoNumero((data.servicosEmExecucao || 0) + 1);
      })
      .catch(() => setServicoNumero(0));
  }, [tecnico1, osId]);


  // Carregar listas para dropdown de substituto
  useEffect(() => {
    if (!temSubstituto) return;
    if (substitutoTipo === "POS" && listaOSAbertas.length === 0) {
      // /api/pos/ordens devolve KanbanCard[] (campos minúsculos: id/cliente/status)
      fetch("/api/pos/ordens").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaOSAbertas(data.filter((o: any) => o.status !== "Cancelada" && o.status !== "Concluída" && String(o.id) !== osId).map((o: any) => ({ id: String(o.id), cliente: o.cliente || "", status: o.status || "" })));
      }).catch(() => {});
    }
    if (substitutoTipo === "PPV" && listaPPVAbertos.length === 0) {
      fetch("/api/ppv/pedidos").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaPPVAbertos(data.filter((p: any) => p.status !== "Cancelado" && p.status !== "Fechado").map((p: any) => ({ id: p.id, cliente: p.cliente || "", status: p.status || "" })));
      }).catch(() => {});
    }
  }, [temSubstituto, substitutoTipo]);

  // ── Derived values (useMemo) ──
  const subtotalHoras = qtdHoras * VH;
  const subtotalKm = qtdKm * VK;
  const subtotalBruto = subtotalHoras + subtotalKm + totalPecas;

  const totalRequisicoes = useMemo(() => requisicoes.reduce((s, r) => s + (r.valor || 0), 0), [requisicoes]);

  // Passos da criação (barra de progresso no topo da Nova OS)
  const solicitacaoPreenchida = useMemo(() => {
    const linha = servSolicitado.split("\n").find((l) => /^solicita[çc][ãa]o do cliente:/i.test(l.trim()));
    if (linha) return linha.split(":").slice(1).join(":").trim().length > 0;
    return !!servSolicitado.trim() && servSolicitado !== TEXT_TEMPLATE;
  }, [servSolicitado]);
  const faltaOmie = useMemo(() => faltaParaEnviarOmie(servSolicitado), [servSolicitado]);
  const passosCriacao = [
    { n: 1, rotulo: "Cliente", icone: "fa-user", ok: !!clienteChave, alvo: "osc-cliente" },
    { n: 2, rotulo: "Máquina", icone: "fa-tractor", ok: !!projeto.trim(), alvo: "osc-cliente" },
    { n: 3, rotulo: "Técnico", icone: "fa-user-gear", ok: !!tecnico1, alvo: "osc-equipe" },
    { n: 4, rotulo: "Serviço", icone: "fa-wrench", ok: solicitacaoPreenchida, alvo: "osc-servico" },
  ];
  const passosFeitos = passosCriacao.filter((p) => p.ok).length;
  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // "Não cobrar" hora/km (aba Lista de Serviços) = desconto do valor cheio da linha
  const descHoraEf = esp.naoCobrar.hr ? subtotalHoras : descHoraValor;
  const descKmEf = esp.naoCobrar.km ? subtotalKm : descKmValor;
  const valorExtras = totalExtras(esp);
  const total = useMemo(() => {
    const sub = (subtotalHoras - descHoraEf) + (subtotalKm - descKmEf) + totalPecas + totalRequisicoes + valorExtras;
    return Math.max(0, sub - descValor);
  }, [subtotalHoras, subtotalKm, totalPecas, totalRequisicoes, descValor, descHoraEf, descKmEf, valorExtras]);

  const bombaAlerta = useMemo(
    () => tipoServico === "Revisão" && !!revisao && BOMBA_HORAS.some((h) => revisao.includes(h)),
    [tipoServico, revisao]
  );

  const totalDescontos = descHoraEf + descKmEf + descValor;

  // Auto-calcular estimativa quando clienteInfo e qtdHoras mudam
  const estimativaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Limpar timer anterior
    if (estimativaTimerRef.current) clearTimeout(estimativaTimerRef.current);

    if (!clienteInfo?.cpf && !clienteInfo?.endereco) {
      setEstimativa(null);
      return;
    }
    if (!qtdHoras || qtdHoras <= 0) {
      setEstimativa(null);
      return;
    }

    setLoadingEstimativa(true);
    // Debounce de 600ms para não fazer chamadas demais
    estimativaTimerRef.current = setTimeout(async () => {
      setErroEstimativa("");
      try {
        const res = await fetch("/api/pos/estimativa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cnpj: clienteInfo?.cpf || "",
            endereco: clienteInfo?.endereco || "",
            cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "",
            qtdHoras,
          }),
        });
        const data = await res.json();
        if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
        if (!res.ok || data.erro) {
          setErroEstimativa(data.erro || "Erro ao calcular estimativa");
          setEstimativa(null);
        } else {
          setEstimativa(data);
          setEnderecoEstimativa(data.enderecoUsado || "");
        }
      } catch {
        setErroEstimativa("Erro de conexão");
        setEstimativa(null);
      }
      setLoadingEstimativa(false);
    }, 600);

    return () => { if (estimativaTimerRef.current) clearTimeout(estimativaTimerRef.current); };
  }, [clienteInfo, qtdHoras]);

  const filteredClientes = useMemo(() => {
    if (!clienteFilter) return [];
    const terms = clienteFilter.toLowerCase().split(/\s+/).filter(Boolean);
    return clientes.filter((c) => {
      const d = c.display.toLowerCase();
      return terms.every((t) => d.includes(t));
    }).slice(0, 30);
  }, [clienteFilter, clientes]);

  // ── Callbacks ──
  const loadPPV = useCallback(async (ppvId: string) => {
    if (!ppvId) { setProdutos([]); setTotalPecas(0); return; }
    try {
      const res = await fetch(`/api/pos/financeiro?ppv=${encodeURIComponent(ppvId)}`);
      if (!res.ok) return;
      const data = await res.json();
      // formato novo { produtos, desconto_ppv }; aceita o array antigo no meio do deploy
      const list: Produto[] = Array.isArray(data) ? data : (data.produtos || []);
      const descPpv = Array.isArray(data) ? 0 : Number(data.desconto_ppv) || 0;
      setProdutos(list);
      // total de peças COM o desconto do PPV — é a mesma conta do Valor_Total salvo
      setTotalPecas(Math.max(0, list.reduce((s, p) => s + p.valor * p.qtde, 0) - descPpv));
    } catch {
      console.error("Erro ao carregar PPV");
    }
  }, []);

  // Abre a busca de produto pra adicionar no PPV vinculado. Se houver mais de um
  // PPV, exige escolher pra qual antes de abrir.
  const abrirAddProduto = useCallback(() => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) { alert("Não há PPV vinculado. Informe o PPV acima antes de adicionar peças."); return; }
    if (ids.length > 1 && !addProdTarget) { alert("Escolha para qual PPV você quer adicionar a peça."); return; }
    setShowAddProdModal(true);
  }, [ppv, addProdTarget]);

  // OS sem PPV (ex.: garantia com peças chegando DEPOIS do serviço): cria um
  // PPV já vinculado — funciona em qualquer etapa da OS
  const [criandoPPV, setCriandoPPV] = useState(false);
  const criarPPVVinculado = useCallback(async () => {
    if (!osId) return;
    if (!confirm(`Criar um PPV de peças vinculado à ${osId}?\n\nEle nasce na fase acompanhando a OS e libera o "Adicionar peça".`)) return;
    setCriandoPPV(true);
    try {
      const res = await fetch(`/api/pos/ordens/${osId}/criar-ppv`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error || "Falha ao criar o PPV."); }
      else {
        setPpv(j.idPpv);
        await loadPPV(j.idPpv);
      }
    } catch {
      alert("Falha ao criar o PPV.");
    }
    setCriandoPPV(false);
  }, [osId, userName, loadPPV]);

  const adicionarProdutoPPV = useCallback(async (item: { codigo?: string; descricao?: string; preco?: number }, qtd?: number) => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    const target = ids.length === 1 ? ids[0] : addProdTarget;
    if (!target || !item?.codigo) return;
    setAddingProduto(true);
    try {
      const res = await fetch("/api/ppv/movimentacoes", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          id: target, tecnico: tecnico1 || "", tipoMovimento: "Saída",
          codigo: item.codigo, descricao: item.descricao || item.codigo,
          quantidade: (qtd && qtd > 0 ? qtd : addProdQtd) || 1, preco: Number(item.preco) || 0, userName,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error || "Erro ao adicionar a peça ao PPV.");
      } else {
        await loadPPV(ppv);
        setAddProdQtd(1);
      }
    } catch {
      alert("Erro ao adicionar a peça ao PPV.");
    }
    setAddingProduto(false);
  }, [ppv, addProdTarget, addProdQtd, tecnico1, userName, loadPPV]);

  // Kit de revisão direto na OS: mesmo modal do PPV (kit inteiro ou só
  // algumas peças) — os itens entram no PPV vinculado marcados com o rótulo.
  const [kitOSOpen, setKitOSOpen] = useState(false);
  const [importandoKitOS, setImportandoKitOS] = useState(false);
  const abrirKitOS = useCallback(() => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) { alert("Não há PPV vinculado. Informe o PPV acima antes de importar o kit."); return; }
    if (ids.length > 1 && !addProdTarget) { alert("Escolha para qual PPV você quer importar o kit."); return; }
    setKitOSOpen(true);
  }, [ppv, addProdTarget]);
  const importarKitNaOS = useCallback(async (produtos: { codigo: string; descricao: string; quantidade: number; preco: number }[], rotulo?: string) => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    const target = ids.length === 1 ? ids[0] : addProdTarget;
    if (!target || produtos.length === 0) return;
    setImportandoKitOS(true);
    try {
      const res = await fetch("/api/ppv/movimentacoes", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ id: target, kit: rotulo || "Kit", tecnico: tecnico1 || "", userName, itens: produtos }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error || "Erro ao importar o kit no PPV.");
      } else {
        await loadPPV(ppv);
        alert(`Kit importado: ${produtos.length} ${produtos.length === 1 ? "item" : "itens"} no PPV ${target}.`);
      }
    } catch {
      alert("Erro ao importar o kit no PPV.");
    }
    setImportandoKitOS(false);
  }, [ppv, addProdTarget, tecnico1, userName, loadPPV]);

  const fetchLembretes = useCallback(async (chave: string) => {
    if (!chave) { setLembretes([]); return; }
    try {
      const res = await fetch(`/api/pos/lembretes?cliente=${encodeURIComponent(chave)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setLembretes(data);
    } catch {
      console.error("Erro ao buscar lembretes");
    }
  }, []);

  // Editar/concluir lembrete agora fica no LembretesDaOS (confere a resposta do servidor) (José, 26/10/2026)

  const selectCliente = useCallback(async (chave: string) => {
    setClienteChave(chave);
    if (!chave) return;
    try {
      const res = await fetch(`/api/pos/clientes?id=${encodeURIComponent(chave)}`);
      if (!res.ok) return;
      const c: ClienteDados = await res.json();
      setClienteInfo(c);
    } catch {
      console.error("Erro ao buscar cliente");
    }
    // Cliente juntado (mesmo CNPJ nas duas contas Omie): lembretes de todas as chaves
    const outras = clientes.find((c) => c.chave === chave)?.outrasChaves || [];
    fetchLembretes([chave, ...outras].join(","));
  }, [fetchLembretes, clientes]);

  // Equipamento escolhido (busca ou "Nova máquina"): grava o projeto e completa
  // Modelo/Chassis da descrição sem apagar o que já foi escrito.
  const aplicarEquipamentoRef = useRef<null | ((nome: string, modelo: string, chassis: string) => void)>(null);
  const aplicarEquipamento = (nome: string, modelo: string, chassis: string) => {
    setProjeto(nome);
    if (!servSolicitado || servSolicitado.trim() === "" || servSolicitado === TEXT_TEMPLATE) {
      setServSolicitado(`Modelo: ${modelo}\nChassis: ${chassis}\nHorimetro: \n\nSolicitação do cliente: \nServiço Realizado: `);
    } else {
      // Troca de máquina também atualiza (antes só preenchia se estava vazio)
      const lines = servSolicitado.split("\n");
      if (/^Modelo:/i.test(lines[0]?.trim() || "")) lines[0] = "Modelo: " + modelo;
      if (/^Chassis:/i.test(lines[1]?.trim() || "")) lines[1] = "Chassis: " + chassis;
      setServSolicitado(lines.join("\n"));
    }
  };
  useEffect(() => { aplicarEquipamentoRef.current = aplicarEquipamento; });

  const syncDiscount = useCallback((type: "P" | "V", value: number) => {
    if (type === "P") {
      setDescPorc(value);
      setDescValor(subtotalBruto > 0 ? parseFloat(((value / 100) * subtotalBruto).toFixed(2)) : 0);
    } else {
      setDescValor(value);
      setDescPorc(subtotalBruto > 0 ? parseFloat(((value / subtotalBruto) * 100).toFixed(2)) : 0);
    }
  }, [subtotalBruto]);

  const salvarRef = useRef<null | ((ajuste?: unknown) => Promise<boolean>)>(null);
  // janela do envio ao Omie: confirmar → enviando (passos + estimativa) → resultado
  const [envioOmie, setEnvioOmie] = useState<FaseEnvioOmie | null>(null);
  const enviarParaOmie = useCallback(() => {
    if (!osId) return;
    if (!podeOmie) { alert("Você não tem permissão para enviar ao Omie."); return; }
    setEnvioOmie({ fase: "confirmar" });
  }, [osId, podeOmie]);
  const executarEnvioOmie = useCallback(async () => {
    if (!osId) return;
    setEnvioOmie({ fase: "enviando" });
    // salva antes: a rota lê a OS GRAVADA — texto digitado e não salvo dava
    // "Falta preencher Solicitação do cliente…" (OS-0826, 15/10/2026)
    if (mode === "edit" && podeEditar) {
      const salvou = await salvarRef.current?.();
      if (salvou === false) { setEnvioOmie({ fase: "erro", mensagem: "A OS não foi salva — corrija o que o aviso pediu e tente de novo." }); return; }
    }
    setEnviandoOmie(true);
    try {
      const res = await fetch(`/api/pos/ordens/${osId}/omie`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ userName }) });
      const result = await res.json().catch(() => ({} as Record<string, never>));
      // Resposta sem os campos esperados = a conexão caiu no meio (ex.: timeout
      // do proxy do Railway enquanto o Omie processava). O envio pode TER dado certo.
      if (typeof result.sucesso === "undefined" && !result.erro) {
        setEnvioOmie({ fase: "incerto" });
        setLogRefreshKey((k) => k + 1);
        onSaved?.();
      } else if (result.sucesso) {
        setEnvioOmie({ fase: "ok", numeroOS: String(result.cNumOS || ""), pedidos: result.pedidoVenda || undefined, erroPecas: result.pedidoVendaErro || undefined });
        if (result.cNumOS) setOrdemOmie(String(result.cNumOS));
        // Interna conclui; externa vai COBRAR o cliente antes de concluir
        setStatusDoServidor(servicoInterno ? "Concluída" : "Cobrando Cliente");
        setLogRefreshKey((k) => k + 1);
        onSaved?.();
      } else {
        setEnvioOmie({ fase: "erro", mensagem: String(result.erro || "Erro desconhecido.") });
      }
    } catch (err) {
      console.error(err);
      setEnvioOmie({ fase: "erro", mensagem: "Erro de conexão ao enviar para o Omie." });
    }
    setEnviandoOmie(false);
  }, [osId, onSaved, servicoInterno, userName, mode, podeEditar]);

  // Passo final: dev confirma que o envio ao Omie ficou certo e move a OS
  // (que está em "Enviado Para Omie") para "Concluída".
  const confirmarConcluir = useCallback(async () => {
    if (!osId) return;
    if (!podeConcluir) { alert("Você não tem permissão para concluir ordens."); return; }
    if (!confirm(`Confirmar que a OS ${osId} foi enviada ao Omie corretamente e movê-la para "Concluída"?`)) return;
    setConcluindo(true);
    try {
      const res = await fetch(`/api/pos/ordens/${osId}/fase`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Concluída", userName }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setStatusDoServidor("Concluída");
        setLogRefreshKey((k) => k + 1);
        onSaved?.();
      } else {
        alert(`Não foi possível concluir:\n${result.erro || "erro desconhecido"}`);
      }
    } catch {
      alert("Erro de conexão ao concluir a OS.");
    } finally {
      setConcluindo(false);
    }
  }, [osId, podeConcluir, userName, onSaved]);

  const duplicarOS = async () => {
    if (!osId || duplicando) return;
    if (!confirm(`Duplicar a OS ${osId}?\n\nCria uma OS NOVA em Orçamento com o mesmo cliente, técnicos, tipo de serviço, descrição, horas e km.\nNão copia: envio ao Omie, faturamento, peças (PPV), alimentação, datas de execução e relatório.`)) return;
    setDuplicando(true);
    try {
      const dados = {
        nomeCliente: clienteInfo?.nome, cpfCliente: clienteInfo?.cpf,
        enderecoCliente: servicoOficina ? 'Nova Tratores - Av. São Sebastião, 1065 - Vila Campos, Piraju - SP' : clienteInfo?.endereco,
        cidadeCliente: servicoOficina ? 'Piraju' : (clienteInfo?.cidade || ''), tecnicoResponsavel: tecnico1, tecnico2,
        tipoServico, revisao, projeto, servicoSolicitado: servSolicitado, observacoes,
        qtdHoras, qtdKm, ppv: "", status: "Orçamento", ordemOmie: "", motivoCancelamento: "",
        substitutoTipo: null, substitutoId: null,
        descontoValor: descValor, descontoHora: descHoraValor, descontoKm: descKmValor,
        relatorioTecnico: "", diasExecucao: "", previsaoExecucao: "", previsaoFaturamento: hojeSP(), dataFimServico: "",
        horaInicioServico: "", servicoNumero: 0, horaInicioExec: "", horaFimExec: "", horaChegada: "",
        gerarPPV: false, servicoOficina, servicoInterno, alimentacoes: [], userName,
      };
      const res = await fetch("/api/pos/ordens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r.erro) { alert(r.erro || "Não foi possível duplicar a OS."); return; }
      onSaved();
      if (r.novaOsId && confirm(`OS ${r.novaOsId} criada (cópia da ${osId}). Abrir a nova agora?`)) window.location.href = `/pos?id=${encodeURIComponent(r.novaOsId)}`;
    } catch { alert("Erro de conexão ao duplicar a OS."); }
    finally { setDuplicando(false); }
  };

  const salvar = useCallback(async (ajuste?: unknown): Promise<boolean> => {
    const aj = (ajuste && typeof ajuste === "object" && !("nativeEvent" in ajuste) ? ajuste : {}) as { previsaoFaturamento?: string; projeto?: string };
    if (mode === "edit" && !podeEditar) { alert("Você não tem permissão para editar esta OS."); return false; }
    if (status === "Cancelada" && !podeCancelar) { alert("Você não tem permissão para cancelar OS."); return false; }
    if (mode === "create" && !clienteChave) { alert("Selecione o Cliente"); return false; }
    if (status === "Cancelada" && !motivoCancel.trim()) { alert("Informe o motivo do cancelamento"); return false; }
    if (status === "Cancelada" && temSubstituto && !substitutoId.trim()) { alert("Informe o ID do substituto"); return false; }
    // desconto novo ou mudado sem motivo → pede o motivo antes de salvar (José, 27/10/2026)
    if (descValor > 0.004 && Math.abs(descValor - descExplicadoRef.current) > 0.004) { setPedirMotivo(true); return false; }
    // Aberta AGORA (ainda no clique) pra o navegador não bloquear o pop-up;
    // recebe o endereço do formulário depois que a OS existir
    const janelaReq = mode === "create" && abrirReqDepois ? window.open("about:blank", "_blank") : null;
    setSaving(true);
    const dados = {
      id: osId, nomeCliente: clienteInfo?.nome, cpfCliente: clienteInfo?.cpf,
      enderecoCliente: servicoOficina ? 'Nova Tratores - Av. São Sebastião, 1065 - Vila Campos, Piraju - SP' : clienteInfo?.endereco,
      cidadeCliente: servicoOficina ? 'Piraju' : (clienteInfo?.cidade || ''), tecnicoResponsavel: tecnico1, tecnico2,
      tipoServico, revisao, projeto: typeof aj.projeto === "string" ? aj.projeto : projeto, servicoSolicitado: servSolicitado, observacoes,
      qtdHoras, qtdKm, valorHora: VH, valorKm: VK, ppv, status: mode === "create" ? "Orçamento" : status,
      statusAoAbrir: mode === "create" ? null : statusDoBanco.current,
      ordemOmie, motivoCancelamento: motivoCancel,
      substitutoTipo: temSubstituto ? substitutoTipo : null,
      substitutoId: temSubstituto ? substitutoId : null,
      descontoValor: descValor, descontoHora: descHoraEf, descontoKm: descKmEf,
      omieEspelho: esp,
      relatorioTecnico,
      diasExecucao: diasExecucao.sort().join(','),
      previsaoExecucao,
      previsaoFaturamento: (typeof aj.previsaoFaturamento === "string" && aj.previsaoFaturamento) || previsaoFaturamento || hojeSP(),
      dataFimServico,
      horaInicioServico,
      servicoNumero,
      horaInicioExec,
      horaFimExec,
      horaChegada,
      gerarPPV: mode === "create" && ((tipoServico === "Revisão" && gerarPPV) || pecasPendentes.length > 0),
      servicoOficina,
      servicoInterno,
      // item com NOTA anexada mas valor ainda não lançado não pode sumir no save
      alimentacoes: alimentacoes.filter(a => (a.valor || 0) > 0 || a.foto),
      userName,
    };
    try {
      const url = mode === "create" ? "/api/pos/ordens" : `/api/pos/ordens/${osId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      const result = await res.json();
      if (!res.ok || result.erro) {
        janelaReq?.close();
        alert(result.erro || "Erro ao salvar a OS.");
        setSaving(false);
        return false;
      }
      // Peças escolhidas na criação → PPV gerado junto com a OS
      if (mode === "create" && pecasPendentes.length > 0) {
        const idPpv = String(result.ppvGerado || "");
        if (!idPpv) {
          alert(`A OS ${result.novaOsId || ""} foi criada, mas o PPV não — as ${pecasPendentes.length} peça(s) escolhidas NÃO entraram. Abra a OS e use "Criar PPV de peças".`);
        } else {
          const falhas: string[] = [];
          const soltas = pecasPendentes.filter((p) => !p.kit);
          const kits = [...new Set(pecasPendentes.filter((p) => p.kit).map((p) => p.kit as string))];
          for (const p of soltas) {
            const r = await fetch("/api/ppv/movimentacoes", {
              method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
              body: JSON.stringify({ id: idPpv, tecnico: tecnico1 || "", tipoMovimento: "Saída", codigo: p.codigo, descricao: p.descricao || p.codigo, quantidade: p.quantidade || 1, preco: p.preco || 0, userName }),
            }).catch(() => null);
            if (!r?.ok) falhas.push(p.codigo);
          }
          for (const kit of kits) {
            const itens = pecasPendentes.filter((p) => p.kit === kit);
            const r = await fetch("/api/ppv/movimentacoes", {
              method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
              body: JSON.stringify({ id: idPpv, kit, tecnico: tecnico1 || "", userName, itens }),
            }).catch(() => null);
            if (!r?.ok) falhas.push(`kit "${kit}"`);
          }
          if (falhas.length) alert(`A OS e o ${idPpv} foram criados, mas estas peças não entraram: ${falhas.join(", ")}. Confira no PPV.`);
        }
      }
      if (janelaReq) {
        if (result.novaOsId) janelaReq.location.href = `/requisicoes?aba=form&os=${encodeURIComponent(result.novaOsId)}`;
        else janelaReq.close();
      }
      if (!previsaoFaturamento) setPrevisaoFaturamento(hojeSP());
      // lembretes com valor aplicados nesta OS: concluem agora que a OS foi gravada
      const aConcluir = concluirAoSalvarRef.current.splice(0);
      for (const c of aConcluir) {
        const corpo = c.resto && c.resto > 0
          ? { valor: c.resto, conclusao_nota: c.nota }
          : { concluido: true, concluido_por: userName || "Sistema", conclusao_nota: c.nota, concluido_em_ordem: String(result.novaOsId || osId || "") || null };
        await fetch(`/api/pos/lembretes/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(corpo) }).catch(() => null);
      }
      if (aConcluir.length) setLembretes((prev) => prev.filter((x) => !aConcluir.some((c) => c.id === x.id && !(c.resto && c.resto > 0))));
      setSaving(false);
      setLogRefreshKey((k) => k + 1);
      // Avisa quando a ordem muda de externa↔interna (muda só o destino das peças)
      if (mode === "edit" && servicoInterno !== internoOriginalRef.current) {
        alert(servicoInterno
          ? "Ordem marcada como INTERNA — vai normal pro Omie, mas as peças vinculadas sairão como REMESSA."
          : "Ordem voltou a ser EXTERNA — as peças vinculadas saem como Pedido de Venda.");
      }
      // PPV automático pedido mas não criado → avisa (antes falhava calado e a OS
      // ficava com um PPV inexistente vinculado).
      if (result.avisoPPV) alert(result.avisoPPV);
      // Ao EDITAR, mantém o modal aberto (só atualiza os dados no fundo); ao CRIAR,
      // fecha porque a OS já foi gerada e o formulário de criação não deve continuar.
      if (mode === "create") onClose();
      onSaved();
      return true;
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar a OS.");
      setSaving(false);
      return false;
    }
  }, [mode, osId, clienteChave, clienteInfo, tecnico1, tecnico2, tipoServico, revisao, projeto,
      servSolicitado, qtdHoras, qtdKm, ppv, status, ordemOmie, motivoCancel, descValor,
      descHoraValor, descKmValor, relatorioTecnico, previsaoExecucao, previsaoFaturamento, dataFimServico, servicoNumero,
      gerarPPV, servicoOficina, servicoInterno, alimentacoes, horaInicioExec, horaChegada, horaFimExec, onClose, onSaved, podeEditar, podeCancelar,
      pecasPendentes, abrirReqDepois, esp, descHoraEf, descKmEf, userName]);

  // Aplicou valor de lembrete: salva a OS assim que o estado novo (espelho/desconto) estiver no salvar
  useEffect(() => {
    if (!salvarPendente) return;
    setSalvarPendente(false);
    salvar().finally(() => setAplicandoLembrete(false));
  }, [salvarPendente, salvar]);

  const lembreteComValor = useMemo(
    () => (mode === "edit" && podeEditar && !faturadaEm && status !== "Cancelada" && status !== "Concluída")
      ? lembretes.find((l) => temValorPendente(l) && !lembretesAdiados.includes(l.id)) || null
      : null,
    [mode, podeEditar, faturadaEm, status, lembretes, lembretesAdiados]);

  const aplicarLembreteValor = (l: LembreteValor) => {
    const valor = valorDoLembrete(l);
    const titulo = tituloLembrete(l.lembrete);
    setAplicandoLembrete(true);
    if (l.valor_tipo === "credito") {
      const cabe = Math.max(0, Math.min(valor, Math.round(total * 100) / 100));
      const novo = Math.round((descValor + cabe) * 100) / 100;
      const anterior = esp.descontoMotivo?.texto && descValor > 0 ? `${esp.descontoMotivo.texto} + ` : "";
      syncDiscount("V", novo);
      setShowDescontos(true);
      setEsp((x) => ({ ...x, descontoMotivo: { texto: `${anterior}${titulo}`, valor: novo, por: userName || "Sistema", em: new Date().toISOString() } }));
      descExplicadoRef.current = novo;
      const resto = Math.round((valor - cabe) * 100) / 100;
      concluirAoSalvarRef.current.push({ id: l.id, nota: `Crédito de R$ ${fmtBR(cabe)} aplicado como desconto na OS ${osId}`, resto: resto > 0 ? resto : undefined });
    } else {
      setEsp((x) => ({ ...x, extras: [...x.extras, { id: `lb-${l.id}`, codigo: "div.", nome: "Diversos", descricao: titulo, qtde: 1, unit: valor, cobrar: true }] }));
      concluirAoSalvarRef.current.push({ id: l.id, nota: `Incluído na OS ${osId} como Diversos de R$ ${fmtBR(valor)}` });
    }
    setLembretesAdiados((p) => [...p, l.id]);
    setSalvarPendente(true);
  };

  const salvarMotivoDesconto = (texto: string) => {
    setEsp((x) => ({ ...x, descontoMotivo: { texto, valor: descValor, por: userName || "Sistema", em: new Date().toISOString() } }));
    descExplicadoRef.current = descValor;
    setPedirMotivo(false);
  };
  const cancelarMotivoDesconto = () => {
    // sem motivo o desconto volta ao que já estava explicado
    syncDiscount("V", descExplicadoRef.current);
    setPedirMotivo(false);
  };
  const conferirMotivoDesconto = () => {
    if (descValor > 0.004 && Math.abs(descValor - descExplicadoRef.current) > 0.004) setPedirMotivo(true);
  };
  useEffect(() => { salvarRef.current = salvar; }, [salvar]);
  // travas antes de faturar (previsão = hoje, projeto): a tela muda junto, senão o próximo Salvar desfaria
  const ajustarParaFaturar = useCallback(async (c: { previsaoFaturamento?: string; projeto?: string }): Promise<boolean> => {
    if (c.previsaoFaturamento) setPrevisaoFaturamento(c.previsaoFaturamento);
    if (c.projeto) { const partes = c.projeto.trim().split(/\s+/); aplicarEquipamentoRef.current?.(c.projeto, partes[0] || "", partes.slice(1).join(" ") || ""); }
    return (await salvarRef.current?.(c)) ?? false;
  }, []);

  // ── Reset form to defaults ──
  const resetForm = useCallback(() => {
    setClienteChave(""); setClienteInfo(null); setStatus("Orçamento");
    setTecnico1(""); setTecnico2(""); setTipoServico("Manutenção");
    setProjeto(""); setRevisao(""); setServSolicitado(TEXT_TEMPLATE);
    setPecasPendentes([]); setAbrirReqDepois(false);
    setPpv(""); setQtdHoras(1); setQtdKm(0); setUnitHr(null); setUnitKm(null); setNotasEsperaDesde(null); setDescPorc(0); setDescValor(0); setDescHoraValor(0); setDescKmValor(0); setEspRaw(espelhoPadrao()); descExplicadoRef.current = 0; concluirAoSalvarRef.current = []; setLembretesAdiados([]); setPedirMotivo(false);
    setOrdemOmie(""); setPedidoVenda(""); setOmieLog(""); setMotivoCancel(""); setTemSubstituto(false); setSubstitutoTipo("POS"); setSubstitutoId("");
    setRelatorioTecnico("");
    const agora = new Date()
    const hojeStr = agora.toISOString().slice(0, 10)
    const horaStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    setPrevisaoExecucao(hojeStr)
    setPrevisaoFaturamento(""); setDataFimServico(""); setDiasExecucao([]); setServicoNumero(0); setHoraInicioExec(horaStr); setHoraChegada(""); setHoraFimExec(""); setAgendaTecnico([]);
    setEstimativa(null); setErroEstimativa(""); setLoadingEstimativa(false); setEnderecoEstimativa(""); setEnderecosDisponiveis([]);
    setProdutos([]); setTotalPecas(0); setShowLogs(false); setRequisicoes([]); setReqsOcultasPrint(new Set()); setOmieAnteriores([]);
    setGerarPPV(false); setShowDescontos(false); setLoadingData(false);
    setLembretes([]); setEditingLembreteId(null);
    setServicoOficina(false);
    setServicoInterno(false);
    setAlimentacoes([]);
    setAba("os");
  }, []);

  // ── Effects ──
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Abort previous fetch if re-opening quickly
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (mode === "create") {
      resetForm();
      return;
    }

    if (mode === "edit" && osId) {
      setAba("os");
      setLoadingData(true);
      fetch(`/api/pos/ordens/${osId}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
          if (!d || ac.signal.aborted) return;
          setClienteInfo({ nome: d.nomeCliente, cpf: d.cpfCliente || "", email: "", telefone: "", endereco: d.enderecoCliente || "", cidade: d.cidadeCliente || "" });
          setStatusDoServidor(d.status || "Orçamento");
          setTecnico1(d.tecnicoResponsavel || ""); setTecnico2(d.tecnico2 || "");
          setTipoServico(d.tipoServico || "Manutenção"); setRevisao(d.revisao || "");
          setProjeto(d.projeto || "");
          setServSolicitado(d.servicoSolicitado || TEXT_TEMPLATE);
          setObservacoes(d.observacoes || "");
          setPpv(d.ppv || ""); setQtdHoras(d.qtdHoras || 0); setQtdKm(d.qtdKm || 0);
          const dv = parseFloat(d.descontoSalvo || 0);
          const dh = parseFloat(d.descontoHora || 0);
          const dk = parseFloat(d.descontoKm || 0);
          setDescValor(dv); descExplicadoRef.current = dv; setLembretesAdiados([]); concluirAoSalvarRef.current = [];
          setDescHoraValor(dh);
          setDescKmValor(dk);
          setEspRaw(normalizarEspelho(d.omieEspelho, espelhoPadrao({ interna: !!d.servicoInterno, garantia: /garantia/i.test(String(d.tipoServico || "")) })));
          const uH = Number(d.valorHora) > 0 ? Number(d.valorHora) : null, uK = Number(d.valorKm) > 0 ? Number(d.valorKm) : null;
          setUnitHr(uH); setUnitKm(uK); setNotasEsperaDesde(null);
          const sub = (d.qtdHoras || 0) * (uH ?? VH) + (d.qtdKm || 0) * (uK ?? VK);
          setDescPorc(sub > 0 ? parseFloat(((dv / sub) * 100).toFixed(2)) : 0);
          setOrdemOmie(d.ordemOmie || ""); setMotivoCancel(d.motivoCancelamento || "");
          setFaturadaEm(d.faturadoOmieEm || null);
          setPendenciaMahindra(Array.isArray(d.pendenciaMahindra?.detalhes) ? d.pendenciaMahindra!.detalhes! : []);
          setPedidoVenda(d.pedidoVenda || ""); setOmieLog(d.omieEnvioLog || "");
          setTemSubstituto(!!(d.substitutoTipo && d.substitutoId));
          setSubstitutoTipo(d.substitutoTipo || "POS");
          setSubstitutoId(d.substitutoId || "");
          setRelatorioTecnico(d.relatorioTecnico || "");
          setPrevisaoExecucao(d.previsaoExecucao || "");
          setPrevisaoFaturamento(d.previsaoFaturamento || hojeSP());
          setDataFimServico(d.dataFimServico || "");
          setHoraInicioServico(d.horaInicioServico || d.horaInicioExec || ""); // vazia = hora em que a OS foi aberta
          setDiasExecucao(d.diasExecucao ? d.diasExecucao.split(',').filter(Boolean) : []);
          setHoraInicioExec(d.horaInicioExec || horaAtualBR());
          setHoraChegada(d.horaChegada || "");
          setHoraFimExec(d.horaFimExec || "");
          setRequisicoes(d.infoRequisicoes || []);
          setOmieAnteriores(Array.isArray(d.omieAnteriores) ? d.omieAnteriores : []);
          setServicoOficina(!!d.servicoOficina);
          setServicoInterno(!!d.servicoInterno);
          internoOriginalRef.current = !!d.servicoInterno;
          // Alimentações: usa o array novo; se vazio mas houver valor antigo, migra p/ 1 linha
          if (Array.isArray(d.alimentacoes) && d.alimentacoes.length > 0) {
            setAlimentacoes(d.alimentacoes.map((a: any) => ({
              data: typeof a?.data === 'string' ? a.data.slice(0, 10) : '',
              valor: parseFloat(a?.valor) || 0,
              tecnicos: Array.isArray(a?.tecnicos) ? a.tecnicos.filter(Boolean).slice(0, 2) : [],
              no_pdf: !!a?.no_pdf,
              foto: typeof a?.foto === 'string' && a.foto ? a.foto : null, // nota do admin
            })));
          } else if (d.alimentacaoTecnico && parseFloat(d.alimentacaoValor || 0) > 0) {
            setAlimentacoes([{ data: (d.Data || '').slice(0, 10), valor: parseFloat(d.alimentacaoValor || 0), tecnicos: [d.tecnicoResponsavel || ''].filter(Boolean), no_pdf: !!d.alimentacaoNoPdf }]);
          } else {
            setAlimentacoes([]);
          }
          // Fotos das notas de almoço que o técnico anexou (casadas por dia)
          const _fad: Record<string, string> = {};
          for (const _x of (Array.isArray(d.almocosFotos) ? d.almocosFotos : [])) {
            if (_x?.data && _x?.foto) _fad[String(_x.data).slice(0, 10)] = String(_x.foto);
          }
          setFotosAlmocoDia(_fad);
          setDadosTecnico(d.dadosTecnico || null);
          setShowDescontos(dv > 0 || dh > 0 || dk > 0);
          if (d.ppv) loadPPV(d.ppv);
          if (d.nomeCliente) {
            fetch(`/api/pos/lembretes?nome=${encodeURIComponent(d.nomeCliente)}`, { signal: ac.signal })
              .then((r) => r.json())
              .then((lbs) => { if (Array.isArray(lbs) && !ac.signal.aborted) setLembretes(lbs); })
              .catch(() => {});
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Erro ao carregar OS:", err);
          alert("Erro ao carregar dados da OS.");
        })
        .finally(() => { if (!ac.signal.aborted) setLoadingData(false); });
    }

    return () => ac.abort();
  }, [visible, mode, osId, loadPPV, resetForm, reloadKey]);

  // ── Early return ──
  // Monitor de uso: avisa a jornada qual OS está aberta (só hashes ficam no navegador).
  useMarcarCaso(visible && mode === "edit" && osId ? { os: osId, ppv: ppv.split(","), doc: clienteInfo?.cpf, textoChassi: `${projeto} ${dadosTecnico?.chassis || ""}` } : null);
  if (!visible) return null;

  // PPVs vinculados (o campo aceita vários separados por vírgula)
  const fmtBR = (n: unknown) => (Number(n) || 0).toFixed(2).replace(".", ",");
  // estilos do cabeçalho Omie — copiados do PPVDrawer pra ficar IGUAL
  const L_OMIE: React.CSSProperties = { textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "#64748b", fontSize: 12.5, display: "block", marginBottom: 5 };
  const R_OMIE: React.CSSProperties = { fontSize: 12, color: "#6b6259", marginBottom: 4 };
  const B_OMIE: React.CSSProperties = { background: "var(--surface, #fefefe)", border: "1px solid var(--border)", borderRadius: 8, height: 40, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 12px", fontSize: 14, color: "inherit", fontVariantNumeric: "tabular-nums" };
  // versão discreta (linha compacta dentro do card Descrição do Serviço)
  const L_DISC: React.CSSProperties = { display: "block", fontSize: 11, color: "#94a3b8", fontWeight: 500, marginBottom: 3, textTransform: "none", letterSpacing: 0 };
  const I_DISC: React.CSSProperties = { marginBottom: 0, height: 30, fontSize: 12.5, padding: "0 8px" };
  const ppvIds = ppv.split(",").map((s) => s.trim()).filter(Boolean);

  // Card Alimentação & Dias do Serviço — vive na aba "Requisições & Alimentação"
  // (edit) e solto no painel da OS (create).
  const cardAlimentacao = (oculto: boolean, ordem?: number) => (
    <div id={mode === "create" ? "osc-almoco" : undefined} className="os-card" style={{ display: oculto ? "none" : undefined, order: ordem }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="os-card-title" style={{ margin: 0, padding: 0, border: 'none', flex: 1 }}>
          <i className="fas fa-utensils" /> Alimentação &amp; Dias do Serviço
          {alimentacoes.length > 0 && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 800, padding: '2px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', textTransform: 'none', letterSpacing: 0 }}>{alimentacoes.length} {alimentacoes.length === 1 ? 'dia' : 'dias'} · R$ {fmtBR(alimentacoes.reduce((s, a) => s + (a.valor || 0), 0))}</span>}
        </div>
        <button type="button" onClick={() => setAlimentacoes(prev => [...prev, { data: new Date().toISOString().slice(0, 10), valor: 0, tecnicos: [tecnico1].filter(Boolean), no_pdf: false }])}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: '#D97706', color: '#fefefe', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 6px rgba(217,119,6,.25)' }}>
          <i className="fas fa-plus" /> Adicionar dia
        </button>
      </div>
      {/* despesas que a alimentação já gerou (antes apareciam também na lista de Requisições) */}
      {mode === 'edit' && requisicoes.some((r) => /^\s*alimenta/i.test(r.material || '')) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--portal-text-muted)' }}>
          <i className="fas fa-receipt" /> Despesa gerada:
          {requisicoes.filter((r) => /^\s*alimenta/i.test(r.material || '')).map((r) => (
            <a key={r.id} href={`/requisicoes?req=${r.id}`} target="_blank" rel="noreferrer" title={r.material}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999, border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit', fontWeight: 700 }}>
              #{r.id} <span style={{ fontSize: 10.5, padding: '0 6px', borderRadius: 999, background: r.atualizada ? '#dcfce7' : '#fef3c7', color: r.atualizada ? '#15803d' : '#92400e' }}>{r.atualizada ? 'OK' : 'Pendente'}</span>
            </a>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>

        {/* input escondido — o botão "anexar nota" de cada linha aponta pra cá */}
        <input
          ref={notaFileRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const idx = notaIdxRef.current;
            if (idx >= 0) anexarNota(idx, e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
        {alimentacoes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '18px 12px', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--portal-text-muted)', fontSize: 13 }}>
            Nenhuma alimentação lançada. Use <b>Adicionar dia</b>.
          </div>
        )}

        {alimentacoes.map((a, i) => {
          const upd = (patch: Partial<AlimentacaoItem>) => setAlimentacoes(prev => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x))
          const sel = a.tecnicos.length >= 2 ? 'ambos' : (a.tecnicos[0] && a.tecnicos[0] === tecnico2 ? 'tec2' : 'tec1')
          const opts: { k: 'tec1' | 'tec2' | 'ambos'; label: string; on: boolean }[] = [
            { k: 'tec1', label: 'Téc 1', on: !!tecnico1 },
            { k: 'tec2', label: 'Téc 2', on: !!tecnico2 },
            { k: 'ambos', label: 'Ambos', on: !!tecnico2 },
          ]
          return (
            <div key={i} style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface, #fefefe)', border: '1px solid var(--border)', borderLeft: '3px solid #F59E0B', borderRadius: 10, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ width: 130 }}>
                <label style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', display: 'block', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Data</label>
                <input type="date" value={a.data} onChange={(e) => upd({ data: e.target.value })} style={{ height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, width: '100%', marginBottom: 0 }} />
              </div>
              <div style={{ width: 96 }}>
                <label style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', display: 'block', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Valor (R$)</label>
                <input type="number" min={0} step={0.01} value={a.valor || ''} onChange={(e) => upd({ valor: parseFloat(e.target.value) || 0 })} placeholder="0,00" style={{ height: 34, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, width: '100%', textAlign: 'right', marginBottom: 0 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', display: 'block', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Técnico(s)</label>
                <div style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 9, background: 'var(--portal-bg-secondary, #f1f5f9)', border: '1px solid var(--border)' }}>
                  {opts.map(opt => (
                    <button key={opt.k} type="button" disabled={!opt.on}
                      onClick={() => upd({ tecnicos: opt.k === 'ambos' ? [tecnico1, tecnico2].filter(Boolean) : opt.k === 'tec2' ? [tecnico2].filter(Boolean) : [tecnico1].filter(Boolean) })}
                      title={opt.k === 'tec1' ? tecnico1 : opt.k === 'tec2' ? tecnico2 : `${tecnico1} e ${tecnico2}`}
                      style={{ height: 26, padding: '0 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: opt.on ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                        border: 'none', background: sel === opt.k ? '#D97706' : 'transparent', color: sel === opt.k ? '#fefefe' : '#64748b', opacity: opt.on ? 1 : 0.4 }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ paddingBottom: 6 }}><Chave ligada={a.no_pdf} onChange={(v) => upd({ no_pdf: v })} rotulo="Mostrar no PDF" /></div>
              {a.data && (() => {
                const fotoNota = a.foto || fotosAlmocoDia[a.data];
                if (fotoNota) {
                  return (
                    <a href={fotoNota} target="_blank" rel="noreferrer" title={a.foto ? 'Nota anexada pelo portal' : 'Nota anexada pelo técnico'} style={{ display: 'block', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', border: '1px solid #86EFAC', flexShrink: 0 }}>
                      <img src={fotoNota} alt="Nota do almoço" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </a>
                  );
                }
                // sem nota: em OS já salva, o admin anexa AQUI — e a
                // despesa de alimentação abre automaticamente
                return mode === 'edit' && osId ? (
                  <button type="button" disabled={enviandoNota === i}
                    onClick={() => { notaIdxRef.current = i; notaFileRef.current?.click(); }}
                    title="Anexar a nota deste dia (abre a despesa de alimentação automaticamente, em nome do técnico, direto no financeiro)"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 6, border: '1px dashed #F59E0B', background: '#FFFBEB', color: '#B45309', fontSize: 8.5, textAlign: 'center', lineHeight: 1.15, flexShrink: 0, cursor: 'pointer', fontWeight: 700 }}>
                    {enviandoNota === i ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 12 }} /> : <><i className="fas fa-paperclip" style={{ fontSize: 10, marginBottom: 2 }} />anexar<br />nota</>}
                  </button>
                ) : (
                  <span title="O técnico ainda não anexou a nota deste dia" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 6, border: '1px dashed #FCA5A5', color: '#DC2626', fontSize: 9, textAlign: 'center', lineHeight: 1.1, flexShrink: 0 }}>
                    sem<br />nota
                  </span>
                );
              })()}
              <button type="button" onClick={() => setAlimentacoes(prev => prev.filter((_, idx) => idx !== i))} title="Remover este dia" style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #fefefe)', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }}>
                <i className="fas fa-trash" style={{ fontSize: 12 }} />
              </button>
            </div>
          )
        })}
      </div>

      {diasExecucao.length > 0 && (() => {
        return (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', fontWeight: 600, marginBottom: 2 }}>Confirme os dias:</div>
          {diasExecucao.map((entry) => {
            const dia = entry.split(' ')[0]
            const diaDate = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(dia + 'T12:00:00') : null
            const diaLabel = diaDate && !isNaN(diaDate.getTime()) ? diaDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : dia
            return (
              <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--portal-bg-secondary)', borderRadius: 6, border: '1px solid var(--portal-border)', fontSize: 13 }}>
                <input type="checkbox" checked style={{ accentColor: '#1E3A5F', width: 16, height: 16, cursor: 'pointer' }} onChange={(e) => {
                  if (!e.target.checked) setDiasExecucao(prev => prev.filter(d => !d.startsWith(dia)))
                }} />
                <span style={{ fontWeight: 600, color: '#1E3A5F' }}>{diaLabel}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, padding: '4px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>
              <i className="fas fa-calendar-check" style={{ fontSize: 11, marginRight: 4 }} />
              {diasExecucao.length} dia{diasExecucao.length > 1 ? 's' : ''} selecionado{diasExecucao.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>)
      })()}
    </div>
  );

  return (
    <>
      <div className={`drawer-overlay active fs pos-osd${mode === "create" ? " criando" : ""}`}>
        {/* Responsivo (tablet/celular): abas roláveis, cabeçalho empilha, trilho de ações vira barra embaixo até 900px */}
        <style>{`
          /* Abas: NUNCA encolhem (a coluna tem altura limitada; com overflow
             diferente de visible o min-height vira 0 e a faixa sumia). No PC
             ficam como sempre; a rolagem de lado só entra abaixo de 1024px. */
          .pos-osd .os-tabs { flex-shrink: 0; }
          .pos-osd .os-tab { flex-shrink: 0; white-space: nowrap; }
          @media (max-width: 1023px) {
            .pos-osd .os-tabs { overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
            .pos-osd .pos-osd-grid5 { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important; }
            .pos-osd .pos-osd-checks { flex-wrap: wrap; height: auto !important; min-height: 34px; row-gap: 6px !important; }
            .pos-osd .os-summary .os-omie-totais { flex: 1 1 100%; }
          }
          /* ── Nova OS: visual da criação ── */
          .pos-osd.criando .os-body { background: linear-gradient(180deg, rgba(56,189,248,.07), transparent 260px); }
          .pos-osd.criando .os-card { border-radius: 16px; box-shadow: 0 2px 10px rgba(15,23,42,.05); transition: box-shadow .2s, border-color .2s; scroll-margin-top: 150px; }
          .pos-osd.criando .os-card:focus-within { border-color: #38BDF8; box-shadow: 0 0 0 3px rgba(56,189,248,.18), 0 8px 24px rgba(3,105,161,.10); }
          .pos-osd.criando .os-card-title { font-size: 13.5px; font-weight: 800; color: var(--portal-text); letter-spacing: .4px; }
          .pos-osd.criando .os-card-title i { color: #0369A1; }
          .pos-osd.criando input:focus, .pos-osd.criando select:focus, .pos-osd.criando textarea:focus { border-color: #38BDF8 !important; box-shadow: 0 0 0 3px rgba(56,189,248,.18); outline: none; }
          .pos-osd .osc-num { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800;
            background: var(--portal-bg-secondary); color: var(--portal-text-secondary); border: 1.5px solid var(--portal-border); flex-shrink: 0; transition: all .2s; }
          .pos-osd .osc-num.ok { background: #16A34A; border-color: #16A34A; color: #fefefe; }
          .pos-osd .osc-num.ok i { color: #fefefe !important; font-size: 11px; }
          .pos-osd .osc-passos { position: sticky; top: -20px; z-index: 5; display: flex; flex-direction: column; gap: 10px; padding: 14px 18px; border-radius: 16px;
            background: linear-gradient(135deg, #38BDF8, #0369A1); color: #fefefe; box-shadow: 0 10px 28px rgba(3,105,161,.25); }
          .pos-osd .osc-passos-topo { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
          .pos-osd .osc-passos-titulo { font-size: 16px; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; }
          .pos-osd .osc-passos-conta { font-size: 12.5px; font-weight: 700; background: rgba(255,255,255,.18); border-radius: 20px; padding: 3px 11px; }
          .pos-osd .osc-barra { height: 6px; border-radius: 6px; background: rgba(255,255,255,.25); overflow: hidden; }
          .pos-osd .osc-barra > div { height: 100%; border-radius: 6px; background: #A6FF3B; transition: width .35s ease; }
          .pos-osd .osc-passos-lista { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .pos-osd .osc-passo { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 11px; border: 1.5px solid rgba(255,255,255,.35);
            background: rgba(255,255,255,.10); color: #fefefe; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s, transform .15s; }
          .pos-osd .osc-passo:hover { background: rgba(255,255,255,.22); transform: translateY(-1px); }
          .pos-osd .osc-passo.ok { background: #fefefe; color: #0369A1; border-color: #fefefe; }
          .pos-osd .osc-passo-bola { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(255,255,255,.22); flex-shrink: 0; }
          .pos-osd .osc-passo.ok .osc-passo-bola { background: #16A34A; color: #fefefe; }
          /* Fontes da criação: Inter em tudo, rótulos legíveis (sem caixa-alta miúda), campos maiores */
          .pos-osd.criando .os-drawer, .pos-osd.criando .os-drawer input, .pos-osd.criando .os-drawer select,
          .pos-osd.criando .os-drawer textarea, .pos-osd.criando .os-drawer button { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
          .pos-osd.criando .os-header-title { font-size: 20px; font-weight: 800; letter-spacing: -.2px; }
          .pos-osd.criando .os-card-title { font-size: 15.5px; font-weight: 700; text-transform: none; letter-spacing: -.1px; }
          .pos-osd.criando .os-drawer label { font-size: 13px; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--portal-text-secondary); }
          .pos-osd.criando .os-drawer input, .pos-osd.criando .os-drawer select { font-size: 15px; }
          .pos-osd.criando .os-drawer textarea { font-family: 'Inter', system-ui, sans-serif !important; font-size: 14.5px; line-height: 1.65; }
          .pos-osd.criando .os-field-hint { font-size: 12.5px; }
          .pos-osd .osc-extras { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; border-radius: 14px; border: 1.5px dashed rgba(3,105,161,.35); background: var(--surface); }
          .pos-osd .osc-extras-titulo { font-size: 14px; font-weight: 700; color: var(--portal-text); margin-right: 4px; }
          .pos-osd .osc-extra { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 20px; border: 1.5px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
          .pos-osd .osc-extra:hover { border-color: #38BDF8; transform: translateY(-1px); }
          .pos-osd .osc-extra.on { border-color: #0369A1; background: rgba(56,189,248,.14); color: #0369A1; }
          .pos-osd .osc-vazio { font-size: 13.5px; color: var(--portal-text-secondary); line-height: 1.5; }
          .pos-osd .osc-pecas-lista { display: flex; flex-direction: column; gap: 6px; }
          .pos-osd .osc-peca { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); }
          .pos-osd .osc-peca-cod { font-weight: 700; font-size: 13px; color: #0369A1; white-space: nowrap; }
          .pos-osd .osc-peca-desc { flex: 1; min-width: 0; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .pos-osd .osc-peca-desc em { color: var(--portal-text-secondary); font-style: normal; font-size: 12px; }
          .pos-osd .osc-peca input { width: 64px !important; margin: 0 !important; padding: 4px 6px !important; text-align: center; font-size: 14px !important; }
          .pos-osd .osc-peca-valor { font-weight: 700; font-size: 13.5px; white-space: nowrap; }
          .pos-osd .osc-peca button { border: none; background: transparent; color: #DC2626; cursor: pointer; font-size: 14px; padding: 4px; }
          .pos-osd .osc-pecas-total { text-align: right; font-size: 14px; margin-top: 4px; }
          .pos-osd .osc-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 10px; border: none; background: #0369A1; color: #fefefe; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform .15s, box-shadow .15s; }
          .pos-osd .osc-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(3,105,161,.25); }
          .pos-osd .osc-btn.contorno { background: transparent; color: #0369A1; border: 1.5px solid #0369A1; }
          .pos-osd .osc-toggle { display: flex !important; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1.5px solid var(--portal-border); cursor: pointer; transition: border-color .15s, background .15s; margin: 0 !important; }
          .pos-osd .osc-toggle.on { border-color: #0369A1; background: rgba(56,189,248,.10); }
          .pos-osd .osc-toggle input { width: 18px; height: 18px; margin-top: 2px; accent-color: #0369A1; flex-shrink: 0; }
          .pos-osd .osc-toggle b { display: block; font-size: 14px; color: var(--portal-text); }
          .pos-osd .osc-toggle small { display: block; font-size: 12.5px; color: var(--portal-text-secondary); margin-top: 3px; font-weight: 400; }
          @media (max-width: 640px) {
            .pos-osd .osc-passos { position: static; padding: 12px; }
            .pos-osd .osc-passos-lista { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 900px) {
            .pos-osd .os-header { flex-wrap: wrap; gap: 8px; }
            .pos-osd .os-header-left { flex-wrap: wrap; min-width: 0; }
            .pos-osd .modal-container { flex-direction: column; }
            .pos-osd .os-action-rail { width: 100%; align-self: auto; border-left: none; border-top: 1px solid var(--border); border-radius: 0; max-height: none; flex-direction: row; flex-wrap: wrap; gap: 8px; padding: 10px 12px; position: sticky; bottom: 0; box-shadow: 0 -6px 18px rgba(0,0,0,0.08); }
            .pos-osd .os-rail-btn { width: auto; flex: 1 1 30%; justify-content: center; padding: 10px 12px; min-height: 40px; }
            .pos-osd .os-action-rail > div { flex: 1 1 30%; }
            .pos-osd .os-action-rail > div > .os-rail-btn { width: 100%; }
            .pos-osd .os-rail-btn.primary { order: -1; flex: 1 1 100%; margin-bottom: 0; }
            .pos-osd .os-rail-sep, .pos-osd .os-rail-hint { flex: 1 1 100%; }
          }
          @media (max-width: 640px) {
            .pos-osd .pos-osd-grid2 { grid-template-columns: 1fr !important; gap: 10px !important; }
            .pos-osd .os-summary { padding: 10px !important; }
            .pos-osd .os-tab { padding: 10px 14px; font-size: 14px; }
            .pos-osd .os-rail-btn, .pos-osd .os-action-rail > div { flex-basis: 45%; }
            .pos-osd .os-rail-btn.primary { flex-basis: 100%; }
          }
        `}</style>
        <div className="modal-container">
          <div className="drawer os-drawer">
            {/* Header */}
            <div className="os-header">
              <div className="os-header-left">
                <span className="os-header-title" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                  {mode === "create" ? "Nova Ordem de Serviço" : `Ordem de Serviço Nº ${String(osId || "").replace(/^OS-?/i, "")}`}
                </span>
                {mode === "edit" && (
                  <select
                    value={status}
                    onChange={(e) => mudarStatus(e.target.value)}
                    disabled={!podeEditar || (!!faturadaEm && status === "Concluída")}
                    title={faturadaEm ? "OS faturada: a fase fica travada (só pode ir para Concluída)" : "Alterar status da OS"}
                    style={{ ...STATUS_BADGE_STYLE(status), border: "none", outline: "none", cursor: podeEditar && !(faturadaEm && status === "Concluída") ? "pointer" : "not-allowed", maxWidth: 340, minWidth: 0, ...(faturadaEm && status === "Concluída" ? { appearance: "none" as const, opacity: 1 } : {}) }}
                  >
                    {(faturadaEm ? PHASES.filter((p) => p === status || p === "Concluída") : PHASES).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                {mode === "edit" && faturadaEm && (
                  <span title="OS faturada no Omie (NFS-e ou recibo): a fase não muda mais" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", whiteSpace: "nowrap", flexShrink: 0 }}>
                    <i className="fas fa-lock" style={{ fontSize: 10 }} /> Faturada
                  </span>
                )}
              </div>
              <div className="os-header-actions">
                {/* Sino: lembretes do cliente + os ligados a esta OS, com cobrança em destaque (José, 26/10/2026) */}
                {mode === "edit" && (
                  <LembretesDaOS osId={osId} userName={userName || ""} lembretesCliente={lembretes} onLembretesCliente={setLembretes} />
                )}
                <button className="os-btn-close" onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "auto", padding: "6px 12px" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Fechar</span>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {/* Modal de ocorrência rápida (categoria OS, técnico pré-selecionado) */}
            <OcorrenciaFormModal
              aberto={showOcorrencia}
              onFechar={() => setShowOcorrencia(false)}
              tecnicos={Array.from(new Set([tecnico1, tecnico2, ...tecnicos].filter(Boolean)))}
              categoriaInicial="os"
              tecnicoInicial={tecnico1 || ""}
              idOrdemInicial={osId || ""}
              criadoPor={userName || userProfile?.nome || undefined}
            />

            {loadingData ? (
              <div className="os-loading">
                <div className="spinner-inner" style={S_SPINNER_LOADING} />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                <div className="os-body">

                  {/* ── Nova OS: passos com progresso (clicar rola até o bloco) ── */}
                  {mode === "create" && (
                    <div className="osc-passos" style={{ order: -6 }}>
                      <div className="osc-passos-topo">
                        <span className="osc-passos-titulo"><i className="fas fa-clipboard-list" /> Abrindo uma nova ordem</span>
                        <span className="osc-passos-conta">{passosFeitos === passosCriacao.length ? "Tudo pronto — é só criar" : `${passosFeitos} de ${passosCriacao.length} preenchidos`}</span>
                      </div>
                      <div className="osc-barra"><div style={{ width: `${(passosFeitos / passosCriacao.length) * 100}%` }} /></div>
                      <div className="osc-passos-lista">
                        {passosCriacao.map((p) => (
                          <button type="button" key={p.n} className={`osc-passo${p.ok ? " ok" : ""}`} onClick={() => irPara(p.alvo)}>
                            <span className="osc-passo-bola"><i className={`fas ${p.ok ? "fa-check" : p.icone}`} /></span>
                            <span className="osc-passo-rotulo">{p.rotulo}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Cabeçalho estilo Omie (clone do PPVDrawer, dados da OS) ── */}
                  {mode === "edit" && clienteInfo && (
                    <div className="os-summary" style={{ order: -6, background: "#fff", borderRadius: 4, padding: "12px 14px" }}>
                     <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
                     <div style={{ flex: "1 1 520px", minWidth: 0 }}>
                      {/* Cliente + Previsão de Faturamento */}
                      <div className="pos-osd-grid2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 18, alignItems: "start" }}>
                        <div>
                          <label style={L_OMIE}>Cliente</label>
                          <div className="osh-cli">
                            <span className="osh-selo" title={clienteInfo.nome}>
                              {(clienteInfo.nome || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?"}
                            </span>
                            <div className="osh-caixa">
                              <button type="button" className="osh-nome" onClick={() => setVerClienteOmie(true)} title="Ver as informações do cliente">
                                <span className="osh-nome-txt">{clienteInfo.nome || "Sem cliente"}</span>
                                {clienteInfo.cpf && <span className="osh-doc">{clienteInfo.cpf}</span>}
                              </button>
                              <button type="button" className="osh-ico" onClick={() => setVerClienteOmie(true)} title="Informações do cliente (cadastro no Omie)"><i className="fas fa-paperclip" /></button>
                              <MaquinasClienteIcone doc={clienteInfo.cpf} className="osh-ico" botaoStyle={{ width: 42, height: "100%", border: "none", borderLeft: "1px solid var(--border)", borderRadius: 0, fontSize: 13 }} />
                              {mode === "edit" && osId && clienteInfo.cpf && <button type="button" className="osh-ico" onClick={() => setVerLocalizacao(true)} title="Localização do cliente (GPS do carro do técnico)"><i className="fas fa-location-dot" /></button>}
                              {podeEditar && <button type="button" className="osh-ico" onClick={() => setMostrarTrocaCliente((o) => !o)} title="Trocar o cliente"><i className="fas fa-magnifying-glass" /></button>}
                            </div>
                          </div>
                          <style>{`
                            .osh-cli { display: flex; gap: 10px; align-items: stretch; }
                            .osh-selo { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; letter-spacing: .5px;
                              color: #fefefe; background: linear-gradient(135deg, #F7B23B, #E8890C); box-shadow: 0 2px 6px rgba(232,137,12,.3); }
                            .osh-caixa { flex: 1; min-width: 0; display: flex; align-items: stretch; height: 44px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface, #fefefe); transition: border-color .15s, box-shadow .15s; }
                            .osh-caixa > :first-child { border-radius: 10px 0 0 10px; }
                            .osh-caixa > :last-child, .osh-caixa > :last-child > button { border-radius: 0 10px 10px 0 !important; }
                            .osh-caixa > div { align-self: stretch !important; }
                            .osh-caixa:hover { border-color: #0F8B8D; box-shadow: 0 0 0 3px rgba(15,139,141,.08); }
                            .osh-nome { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 1px; padding: 0 12px; border: none; background: transparent; cursor: pointer; text-align: left; font: inherit; color: inherit; }
                            .osh-nome-txt { font-size: 13.5px; font-weight: 700; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                            .osh-doc { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
                            .osh-ico { width: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: none; border-left: 1px solid var(--border); background: transparent; color: #475569; cursor: pointer; font-size: 13px; transition: background .15s, color .15s; }
                            .osh-ico:hover { background: color-mix(in srgb, #0F8B8D 10%, transparent) !important; color: #0B6E70 !important; }
                          `}</style>
                        </div>
                        <div>
                          <label style={L_OMIE}>Previsão de Faturamento</label>
                          <input type="date" value={previsaoFaturamento} disabled={!podeEditar} onChange={(e) => { setPrevisaoFaturamento(e.target.value); setEsp((x) => ({ ...x, parcelas: [] })); }} style={{ marginBottom: 0 }} />
                        </div>
                        <div>
                          <label style={L_OMIE}>Número de Parcelas</label>
                          <SeletorCondicao esp={esp} setEsp={setEsp} podeEditar={podeEditar} listas={listasOmie.listas} />
                        </div>
                      </div>

                      {/* Técnicos · Desconto (estilo PPV) · Alimentação · marcações discretas */}
                      <div className="pos-osd-grid5" style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr 1.3fr", gap: 14, marginTop: 12, alignItems: "end" }}>
                        <div>
                          <label style={L_OMIE}>Técnico(s)</label>
                          <SeletorTecnicos tecnicos={tecnicos} t1={tecnico1} t2={tecnico2} podeEditar={podeEditar} onChange={(a, b) => { setTecnico1(a); setTecnico2(b); }} />
                        </div>
                        <div>
                          <div style={R_OMIE}>
                            Valor do Desconto{" "}
                            <button type="button" onClick={() => setDescontoModoOS((m) => (m === "pct" ? "valor" : "pct"))} title="Alternar entre % e R$"
                              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#a79f92", fontSize: 10, padding: 0, marginLeft: 2 }}>
                              <i className="fas fa-pen" />
                            </button>{" "}
                            <span style={{ fontSize: 10.5, color: "#b7b0a3" }}>({descontoModoOS === "pct" ? "%" : "R$"})</span>
                            {descValor > 0 && esp.descontoMotivo?.texto && (
                              <IconeMotivoDesconto motivo={esp.descontoMotivo.texto} por={esp.descontoMotivo.por} onClick={() => setPedirMotivo(true)} />
                            )}
                          </div>
                          <div style={{ ...B_OMIE, padding: "0 8px", gap: 4 }} onBlur={conferirMotivoDesconto}>
                            {descontoModoOS === "pct" ? (
                              <>
                                <input type="number" value={descPorc || ""} min={0} max={100} step={0.5} placeholder="0" disabled={!podeEditar} title="Desconto em %"
                                  onChange={(e) => { const v = parseFloat(e.target.value); syncDiscount("P", isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                  style={{ width: "100%", border: "none", background: "transparent", textAlign: "right", fontSize: 14, color: "#4a453d", outline: "none", padding: 0, margin: 0, fontFamily: "inherit" }} />
                                <span style={{ fontSize: 12, color: "#8a8378" }}>%</span>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: 12, color: "#8a8378" }}>R$</span>
                                <input type="number" value={descValor ? Number(Number(descValor).toFixed(2)) : ""} min={0} step={1} placeholder="0,00" disabled={!podeEditar} title="Desconto em R$"
                                  onChange={(e) => { const v = parseFloat(e.target.value); syncDiscount("V", isNaN(v) ? 0 : Math.max(0, v)); }}
                                  style={{ width: "100%", border: "none", background: "transparent", textAlign: "right", fontSize: 14, color: "#4a453d", outline: "none", padding: 0, margin: 0, fontFamily: "inherit" }} />
                              </>
                            )}
                          </div>
                        </div>
                        <div className="pos-osd-checks" style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", minHeight: 40 }}>
                          <Chave ligada={servicoOficina} desab={!podeEditar} onChange={(v) => setServicoOficina(v)} rotulo="Serviço na oficina" />
                          <Chave ligada={servicoInterno} desab={!podeEditar} onChange={(v) => { setServicoInterno(v); setEsp((x) => aplicarInterna(x, v)); }} rotulo={servicoInterno ? "Ordem interna — conta INTERNO" : "Ordem interna"} />
                        </div>
                      </div>
                     </div>{/* fim coluna esquerda do cabeçalho */}

                     {/* Caixa de totais (igual ao modelo) */}
                     <div className="os-omie-totais" style={{ alignSelf: "stretch", justifyContent: "center" }}>
                       <div className="os-omie-totais-linha"><span>Serviços:</span><b>R$ {fmtBR(subtotalHoras)}</b></div>
                       <div className="os-omie-totais-linha"><span>Deslocamento:</span><b>R$ {fmtBR(subtotalKm)}</b></div>
                       <div className="os-omie-totais-linha"><span>Descontos:</span><b style={{ color: totalDescontos > 0 ? "#0d9488" : "#b7b0a3" }}>R$ {fmtBR(totalDescontos)}</b></div>
                       <div className="os-omie-totais-linha"><span>Produtos (PPV):</span><b>R$ {fmtBR(totalPecas + totalRequisicoes)}</b></div>
                       <div className="os-omie-totais-total"><span>Valor Total:</span><span>R$ {fmtBR(total)}</span></div>
                     </div>
                     </div>{/* fim flex do cabeçalho */}
                    </div>
                  )}

                  {/* ── Abas (edit): Ordem de Serviço / Peças (PPV) ── */}
                  {mode === "edit" && (
                    <div className="os-tabs">
                      <button type="button" className={`os-tab ${aba === "os" && abaOmie === "servicos" ? "active" : ""}`} onClick={() => { setAba("os"); setAbaOmie("servicos"); }}>
                        Lista de Serviços
                      </button>
                      <button type="button" className={`os-tab ${aba === "ppv" && abaOmie === "produtos" ? "active" : ""}`} onClick={() => { setAba("ppv"); setAbaOmie("produtos"); }}>
                        PPV vinculado
                        {produtos.length > 0 && <span className="os-tab-badge">{produtos.length}</span>}
                      </button>
                      <button type="button" className={`os-tab ${aba === "ppv" && abaOmie === "requisicoes" ? "active" : ""}`} onClick={() => { setAba("ppv"); setAbaOmie("requisicoes"); }}>
                        Requisições &amp; Alimentação
                        {(() => { const n = requisicoes.filter((r) => !/^\s*alimenta/i.test(r.material || "")).length + alimentacoes.length; return n > 0 ? <span className="os-tab-badge">{n}</span> : null; })()}
                      </button>
                      {([["deptos", "Departamentos"], ["info", "Informações Adicionais"], ["parcelas", "Parcelas"], ["email", "E-mail para o Cliente"]] as const).map(([k, t]) => (
                        <button key={k} type="button" className={`os-tab ${aba === "os" && abaOmie === k ? "active" : ""}`} onClick={() => { setAba("os"); setAbaOmie(k); }}>{t}</button>
                      ))}
                      {/* Relatório Técnico e Garantia agora ficam dentro de Informações Adicionais (José, 14/10/2026) */}
                      <button type="button" className={`os-tab ${aba === "os" && abaOmie === "obs" ? "active" : ""}`} onClick={() => { setAba("os"); setAbaOmie("obs"); }}>
                        Observações
                      </button>
                    </div>
                  )}

                  {/* ── Painel: Ordem de Serviço ── */}
                  <div className="os-tab-panel" data-aba={mode === "edit" ? abaOmie : undefined} style={{ display: aba === "os" ? "flex" : "none" }}>

                  {/* abas do formato Omie: os cartões das outras abas somem (regra aqui p/ não depender do CSS global) */}
                  <style>{`.os-tab-panel[data-aba="servicos"] .os-aba:not(.os-aba-servicos), .os-tab-panel[data-aba="dados"] .os-aba:not(.os-aba-dados), .os-tab-panel[data-aba="relatorio"] .os-aba:not(.os-aba-relatorio), .os-tab-panel[data-aba="alimentacao"] .os-aba:not(.os-aba-alimentacao), .os-tab-panel[data-aba="garantia"] .os-aba:not(.os-aba-garantia), .os-tab-panel[data-aba="obs"] .os-aba:not(.os-aba-obs), .os-tab-panel[data-aba="produtos"] .os-aba, .os-tab-panel[data-aba="requisicoes"] .os-aba, .os-tab-panel[data-aba="deptos"] .os-aba, .os-tab-panel[data-aba="info"] .os-aba:not(.os-aba-relatorio):not(.os-aba-garantia), .os-tab-panel[data-aba="parcelas"] .os-aba, .os-tab-panel[data-aba="email"] .os-aba { display: none !important; }`}</style>
                  {/* ── Formato Omie (13/10/2026): grade de serviços + abas novas ── */}
                  {mode === "edit" && abaOmie === "servicos" && (() => {
                    // dias de execução (sem domingos) entre início e fim — mesma regra do cartão da criação
                    const diasEntreDatas = (ini: string, fim: string) => {
                      if (!ini || !fim) return;
                      const a = new Date(ini + "T12:00:00"), b = new Date(fim + "T12:00:00");
                      if (a > b) return;
                      const dias: string[] = [];
                      for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) if (cur.getDay() !== 0) dias.push(cur.toISOString().slice(0, 10));
                      setDiasExecucao(dias);
                    };
                    return (
                      <div className="os-card os-aba os-aba-servicos">
                        <div className="os-card-title"><i className="fas fa-calendar-check" /> Execução e assinatura</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                          <div style={{ width: 135 }}>
                            <label style={L_DISC}>Data Início</label>
                            <input type="date" value={previsaoExecucao} disabled={!podeEditar} onChange={(e) => { setPrevisaoExecucao(e.target.value); diasEntreDatas(e.target.value, dataFimServico); }} style={I_DISC} />
                          </div>
                          <div style={{ width: 135 }}>
                            <label style={L_DISC}>Data Fim</label>
                            <input type="date" value={dataFimServico} disabled={!podeEditar} onChange={(e) => { setDataFimServico(e.target.value); diasEntreDatas(previsaoExecucao, e.target.value); }} style={I_DISC} />
                          </div>
                          <div style={{ width: 105 }}>
                            <label style={L_DISC}>Hora Início</label>
                            <input type="time" value={horaInicioServico} disabled={!podeEditar} onChange={(e) => setHoraInicioServico(e.target.value)} style={I_DISC} />
                          </div>
                        </div>
                        {tipoServico === "Revisão" && osId && <ChequeRevisaoBloco osId={osId} podeEditar={podeEditar} />}
                        {osId && <AssinaturaClienteBloco osId={osId} podeEditar={podeEditar} />}
                        {osId && <ResservicoBloco key={osId} osId={osId} podeEditar={podeEditar} tecnicos={tecnicos} tecnicoAtual={tecnico1} />}
                        {osId && <ComissaoOSBloco osId={osId} podeEditar={podeEditar} />}
                      </div>
                    );
                  })()}
                  {mode === "edit" && abaOmie === "servicos" && (
                    <div className="os-card os-aba os-aba-servicos" style={{ order: -4.6 }}>
                      <div className="os-card-title"><i className="fas fa-list" /> Lista de Serviços</div>
                      <GradeServicosOmie listas={listasOmie.listas} osOmie={listasOmie.os} interna={servicoInterno} podeEditar={podeEditar}
                        servSolicitado={servSolicitado} setServSolicitado={setServSolicitado}
                        qtdHoras={qtdHoras} setQtdHoras={handleQtdHorasChange} valorHora={VH} setValorHora={(v) => setUnitHr(v > 0 ? v : null)} descHora={descHoraEf}
                        qtdKm={qtdKm} setQtdKm={setQtdKm} valorKm={VK} setValorKm={(v) => setUnitKm(v > 0 ? v : null)} descKm={descKmEf}
                        requisicoes={requisicoes} tipoServico={tipoServico} revisao={revisao} projeto={projeto} esp={esp} setEsp={setEsp} />
                    </div>
                  )}
                  {mode === "edit" && abaOmie === "deptos" && <div className="os-card" style={{ order: -4.6 }}><AbaDepartamentos esp={esp} setEsp={setEsp} listas={listasOmie.listas} total={total} podeEditar={podeEditar} /></div>}
                  {mode === "edit" && abaOmie === "info" && <div className="os-card" style={{ order: -4.6 }}><AbaInfoAdicionais esp={esp} setEsp={setEsp} listas={listasOmie.listas} interna={servicoInterno} projeto={projeto} onTrocarProjeto={podeEditar ? () => setShowProjModal(true) : undefined} onNovaMaquina={podeEditar ? () => setShowNovaMaquina(true) : undefined} numOmie={ordemOmie} ppv={ppv} oficina={servicoOficina} cnpj={clienteInfo?.cpf || ""} pedidoCliente={String(pedidoVenda || "").split(",").map((x) => x.split(":").pop()?.trim().replace(/^0+(?=\d)/, "")).filter(Boolean).join(", ")} podeEditar={podeEditar} /></div>}
                  {mode === "edit" && abaOmie === "parcelas" && <div className="os-card" style={{ order: -4.6 }}><AbaParcelas esp={esp} setEsp={setEsp} previsao={previsaoFaturamento} total={total} interna={servicoInterno} faturada={!!listasOmie.os && (listasOmie.os.InfoCadastro as { cFaturada?: string } | undefined)?.cFaturada === "S"} podeEditar={podeEditar} /></div>}
                  {mode === "edit" && abaOmie === "email" && <div className="os-card" style={{ order: -4.6 }}><AbaEmail esp={esp} setEsp={setEsp} interna={servicoInterno} podeEditar={podeEditar} emailCliente={String(listasOmie.cliente?.email || "")} /></div>}
                  {verClienteOmie && <ClienteOmieModal cliente={listasOmie.cliente} cnpj={clienteInfo?.cpf || ""} fechar={() => setVerClienteOmie(false)} />}

                  {mode === "edit" && pendenciaMahindra.length > 0 && (
                    <div style={{ order: -5.95, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626" }}
                      title="Marcado pelo Vigia de revisões. Some sozinho quando o cheque for enviado na tela de Revisões.">
                      <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fee2e2", color: "#dc2626", fontSize: 16 }}><i className="fas fa-file-signature" /></span>
                      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#991b1b" }}>Pendência com a Mahindra</div>
                        <div style={{ fontSize: 12.5, color: "#b91c1c" }}>{pendenciaMahindra.join(" · ")}</div>
                      </div>
                      <a href="/revisoes" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 9, background: "#dc2626", color: "#fefefe", fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                        <i className="fas fa-paper-plane" /> Enviar cheque
                      </a>
                    </div>
                  )}
                  {mode === "edit" && bombaAlerta && (
                    <div className="os-alert" style={{ order: -5.9 }}>
                      <i className="fas fa-exclamation-triangle" /> Lembrete: Oferecer limpeza na bomba injetora.
                    </div>
                  )}

                  {/* ── Faixa amarela estilo Omie: faturamento atrasado ── */}
                  {mode === "edit" && previsaoFaturamento && !["Concluída", "Cancelada"].includes(status) &&
                    new Date(`${previsaoFaturamento}T23:59:59`) < new Date() && (
                    <div className="os-aviso-atraso" style={{ order: -5.8 }}>
                      Faturamento atrasado — previsão era {previsaoFaturamento.split("-").reverse().join("/")}{tecnico1 ? `, cobrar ${tecnico1}` : ""}
                    </div>
                  )}




                  {/* ── Omie: números enviados + log (edit mode) ── */}
                  {mode === "edit" && (ordemOmie || pedidoVenda || omieLog) && (
                    <div className="os-card os-aba os-aba-servicos" style={{ order: -5.5, borderLeft: "3px solid #0EA5E9" }}>
                      <div className="os-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/marcas/omie.png" alt="Omie" style={{ height: 16, width: "auto" }} /> Enviado ao Omie
                        {podeSubstituir && ordemOmie && (
                          <button type="button" onClick={() => setSubstituindo(true)} title="Trocar a OS ou um pedido de venda no Omie (o antigo é cancelado)"
                            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fefefe)", color: "#0369A1", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "none", letterSpacing: 0 }}>
                            <i className="fas fa-right-left" /> Substituir OS ou pedido
                          </button>
                        )}
                      </div>
                      {substituindo && osId && (
                        <SubstituirOmieModal osId={osId} ordemOmie={ordemOmie}
                          pedidos={Object.entries(ppvOmieMap).map(([ppvId, numero]) => ({ ppvId, numero }))}
                          onClose={() => setSubstituindo(false)}
                          onFeito={async () => {
                            try {
                              const d = await fetch(`/api/pos/ordens/${osId}`).then((r) => r.json());
                              if (d?.ordemOmie !== undefined) setOrdemOmie(d.ordemOmie || "");
                              if (d?.pedidoVenda !== undefined) setPedidoVenda(d.pedidoVenda || "");
                            } catch { /* a lista recarrega */ }
                            setOmieRefresh((k) => k + 1);
                            setLogRefreshKey((k) => k + 1);
                            onSaved?.();
                          }} />
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: omieLog ? 8 : 0 }}>
                        {ordemOmie && (
                          <div style={{ flex: "1 1 180px", padding: "8px 12px", borderRadius: 10, background: "var(--portal-bg-secondary, #f8fafc)" }}>
                            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Ordem de serviço</div>
                            <div style={{ fontWeight: 800, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>nº {ordemOmie.replace(/^0+/, "") || ordemOmie}</div>
                          </div>
                        )}
                        {pedidoVenda && (
                          <div style={{ flex: "1 1 180px", padding: "8px 12px", borderRadius: 10, background: "var(--portal-bg-secondary, #f8fafc)" }}>
                            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Pedido de venda</div>
                            {/* "PPV-0446:000000000007739" → "nº 7739 (PPV-0446)" — sem zeros à esquerda */}
                            <div style={{ fontWeight: 800, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>nº {pedidoVenda.split(",").map((x) => { const [a, b] = x.includes(":") ? x.split(":") : ["", x]; const num = String(b).trim().replace(/^0+(?=\d)/, ""); return a.trim() ? `${num} (${a.trim()})` : num; }).filter(Boolean).join(", ") || pedidoVenda}</div>
                          </div>
                        )}
                      </div>
                      {ordemOmie && (
                        <div style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)", marginTop: 8 }}>
                          <i className="fas fa-arrow-right" style={{ marginRight: 5 }} />PDFs e <b>Faturar</b> ficam no bloco <b>Omie</b> da coluna da direita (o PDF é gerado na hora pelo Omie).
                          {omieAlteradaEm ? ` Última alteração no Omie: ${omieAlteradaEm}.` : ""}
                        </div>
                      )}
                      {omieLog && (
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0, padding: 8, background: "var(--portal-bg-secondary, #f8fafc)", borderRadius: 6, fontFamily: "inherit", lineHeight: 1.5 }}>{omieLog.replace(/\b0{3,}(?=\d)/g, "")}</pre>
                      )}
                      {status === "Enviado Para Omie" && (
                        <button
                          onClick={confirmarConcluir}
                          disabled={concluindo || !podeConcluir}
                          title={!podeConcluir ? MSG_SEM_PERMISSAO : undefined}
                          style={{
                            marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            padding: "11px 14px", borderRadius: 8, border: "none",
                            background: podeConcluir ? "#10B981" : "#94A3B8", color: "#fff", fontWeight: 700, fontSize: 14,
                            cursor: concluindo || !podeConcluir ? "default" : "pointer",
                          }}
                        >
                          {concluindo
                            ? <><i className="fas fa-spinner fa-spin" /> Concluindo...</>
                            : <><i className="fas fa-check-circle" /> Confirmar e mover para Concluída</>}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Cliente (create + edit) ── */}
                  {(mode !== "edit" || mostrarTrocaCliente) && (
                  <div
                    onClick={mode === "edit" ? () => setMostrarTrocaCliente(false) : undefined}
                    style={mode === "edit"
                      ? { position: "fixed", inset: 0, zIndex: 80000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "7vh 16px", overflowY: "auto" }
                      : { display: "contents" }}
                  >
                  <div id="osc-cliente" className="os-card" onClick={(e) => e.stopPropagation()} style={mode === "edit" ? { width: "100%", maxWidth: 720, maxHeight: "84vh", overflowY: "auto", margin: 0, boxShadow: "0 24px 60px rgba(0,0,0,.35)" } : { order: -5 }}>
                    <div className="os-card-title" style={{ display: "flex", alignItems: "center" }}>
                      {mode === "create" && <span className={`osc-num${clienteChave && projeto.trim() ? " ok" : ""}`}>{clienteChave && projeto.trim() ? <i className="fas fa-check" /> : 1}</span>}
                      <i className="fas fa-user" /> {mode === "edit" ? "Alterar Cliente" : "Cliente e máquina"}
                      {mode === "edit" && (
                        <button type="button" onClick={() => setMostrarTrocaCliente(false)} title="Fechar"
                          style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: 4, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-light)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                    <div style={S_RELATIVE}>
                      <i className="fas fa-search" style={S_SEARCH_ICON} />
                      <input type="text" placeholder="Buscar por nome, razão social ou CNPJ/CPF..." value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)} style={S_SEARCH_INPUT} />
                    </div>
                    {podeEditar && (
                      <button type="button" onClick={() => setShowNovoCliente(true)}
                        title="Cadastrar cliente novo no Omie e já usar nesta OS"
                        style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, padding: "6px 12px", borderRadius: 7, border: "1px dashed #DC2626", background: "#FEF2F2", color: "#B91C1C", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        <i className="fas fa-user-plus" /> Cliente novo? Cadastrar
                      </button>
                    )}
                    {clienteFilter && (
                      <div className="client-search-results">
                        {filteredClientes.length === 0 ? (
                          <div style={S_EMPTY_RESULT}>
                            Nenhum cliente encontrado
                            {podeEditar && (
                              <button type="button" onClick={() => setShowNovoCliente(true)}
                                style={{ display: "block", margin: "8px auto 0", padding: "6px 12px", borderRadius: 7, border: "none", background: "#DC2626", color: "#fefefe", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                <i className="fas fa-user-plus" /> Cadastrar &quot;{clienteFilter}&quot;
                              </button>
                            )}
                          </div>
                        ) : filteredClientes.map((c) => (
                          <div key={c.chave} className="client-search-item" onClick={() => { selectCliente(c.chave); setClienteFilter(""); if (mode === "edit") setMostrarTrocaCliente(false); }}>
                            <i className="fas fa-user-circle" style={S_SEARCH_ICON} />
                            <div style={S_CLIENT_ITEM_WRAP}>
                              <div style={S_CLIENT_ITEM_NAME}>{c.fantasia || c.razao || c.display.split("[")[0].trim()}</div>
                              {c.razao && c.fantasia && c.razao.trim().toLowerCase() !== c.fantasia.trim().toLowerCase() && (
                                <div style={S_CLIENT_ITEM_SUB}>{c.razao}</div>
                              )}
                              <div style={S_CLIENT_ITEM_SUB}>
                                {c.cnpj || "sem CNPJ"}{c.endereco ? ` · ${c.endereco}` : ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {clienteInfo && !clienteFilter && (
                      <div className="os-client-badge">
                        {/* Cliente: nome + CPF/CNPJ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <i className="fas fa-check-circle" style={{ color: '#16A34A', fontSize: 16, flexShrink: 0 }} />
                          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text)' }}>{clienteInfo.nome}</span>
                          {clienteInfo.cpf && (
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 6, padding: '2px 9px', letterSpacing: '0.2px' }}>{clienteInfo.cpf}</span>
                          )}
                        </div>

                        {/* Máquinas do CPF/CNPJ em destaque — clicar já põe na OS */}
                        {mode === "create" && (
                          <MaquinasClienteDestaque
                            doc={clienteInfo.cpf}
                            selecionado={projeto}
                            onEscolher={(m) => aplicarEquipamento(m.projeto, m.modelo, m.chassis)}
                            onBuscarOutra={() => setShowProjModal(true)}
                            onNova={podeEditar ? () => setShowNovaMaquina(true) : undefined}
                          />
                        )}

                        {/* Endereço + cidade */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '0 10px' }}>
                            <i className="fas fa-map-marker-alt" style={{ color: 'var(--portal-text-secondary)', fontSize: 12, flexShrink: 0 }} />
                            <input
                              type="text"
                              value={clienteInfo.endereco || ''}
                              onChange={(e) => setClienteInfo(prev => prev ? { ...prev, endereco: e.target.value } : prev)}
                              placeholder="Endereço do cliente..."
                              style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '8px 0', border: 'none', background: 'transparent', color: 'var(--portal-text)', outline: 'none' }}
                            />
                          </div>
                          <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '0 10px' }}>
                            <i className="fas fa-city" style={{ color: 'var(--portal-text-secondary)', fontSize: 12, flexShrink: 0 }} />
                            <input
                              type="text"
                              value={clienteInfo.cidade || ''}
                              onChange={(e) => setClienteInfo(prev => prev ? { ...prev, cidade: e.target.value } : prev)}
                              placeholder="Cidade..."
                              style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '8px 0', border: 'none', background: 'transparent', color: 'var(--portal-text)', outline: 'none' }}
                            />
                          </div>
                        </div>

                        {/* Opções: oficina / interna */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '11px 13px', borderRadius: 10, boxSizing: 'border-box', height: '100%', border: `1px solid ${servicoOficina ? '#10B981' : 'var(--portal-border)'}`, background: 'var(--portal-bg-card)', transition: 'border-color .15s' }}>
                            <input
                              type="checkbox"
                              checked={servicoOficina}
                              onChange={(e) => setServicoOficina(e.target.checked)}
                              style={{ width: 17, height: 17, accentColor: '#10B981', flexShrink: 0, marginTop: 1 }}
                            />
                            <i className="fas fa-warehouse" style={{ fontSize: 15, color: servicoOficina ? '#059669' : 'var(--portal-text-secondary)', flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', lineHeight: 1.3 }}>
                              Serviço realizado na oficina
                              <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--portal-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                                {servicoOficina
                                  ? 'Endereço salvo como Nova Tratores – Piraju (SP) e registrado no Omie.'
                                  : 'Marque se o serviço foi feito na oficina (não no endereço do cliente).'}
                              </span>
                            </span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '11px 13px', borderRadius: 10, boxSizing: 'border-box', height: '100%', border: `1px solid ${servicoInterno ? '#7C3AED' : 'var(--portal-border)'}`, background: 'var(--portal-bg-card)', transition: 'border-color .15s' }}>
                            <input
                              type="checkbox"
                              checked={servicoInterno}
                              onChange={(e) => setServicoInterno(e.target.checked)}
                              style={{ width: 17, height: 17, accentColor: '#7C3AED', flexShrink: 0, marginTop: 1 }}
                            />
                            <i className="fas fa-tools" style={{ fontSize: 15, color: servicoInterno ? '#7C3AED' : 'var(--portal-text-secondary)', flexShrink: 0, marginTop: 1 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', lineHeight: 1.3 }}>
                              Ordem interna
                              <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--portal-text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                                {servicoInterno
                                  ? 'Vai normal pro Omie — só as peças vinculadas saem como REMESSA.'
                                  : 'Marque pra tratar como interna (as peças vinculadas viram remessa no Omie).'}
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                  )}


                  {/* ── Status ── */}
                  {/* Cancelamento MUDOU DE LUGAR: fica na aba Observações (embaixo
                      do bloco de observações), e o motivo entra pelo MODAL central. */}

                  {/* (13/10/2026) o card "Enviado para Omie (ID …)" saiu: repetia o card
                      "Enviado ao Omie" do topo e o bloco Omie da coluna da direita */}
                  {mode === "edit" && !ordemOmie && servicoInterno && status === "Concluída" && (
                    <div className="os-card os-aba os-aba-servicos" style={{ order: 20 }}>
                      <div className="os-card-title"><i className="fas fa-cloud-upload-alt" /> Concluir ordem interna</div>
                      <div className="os-omie-badge" style={{ background: '#F3E8FF', color: '#6D28D9', borderColor: '#C4B5FD' }}>
                        <i className="fas fa-check-circle" /> Ordem interna concluída (sem peças)
                      </div>
                    </div>
                  )}

                  {/* ── Garantia vinculada ── */}
                  {mode === "edit" && osId && <OSGarantiaInfo osId={osId} cartao="os-card os-aba os-aba-garantia" />}

                  {/* ── Unidades rastreadas (QR) retiradas pra esta OS ── */}
                  {mode === "edit" && osId && <div className="os-aba os-aba-servicos" style={{ display: "contents" }}><OSUnidadesInfo osId={osId} /></div>}


                  {/* ── Relatório do técnico (14/10/2026): situação no app + PDF + correção + dados, num cartão só ── */}
                  {mode === "edit" && (() => {
                    const dt = dadosTecnico;
                    const enviado = String(dt?.status || "").toLowerCase() === "enviado";
                    const dpRaw = String(dt?.dataPreenchimento || "");
                    const dp = /^\d{4}-\d{2}-\d{2}/.test(dpRaw) ? dpRaw.slice(0, 10).split("-").reverse().join("/") : dpRaw;
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const prev = previsaoExecucao ? new Date(previsaoExecucao + "T00:00:00") : null;
                    const diasAtraso = !enviado && prev && prev < hoje ? Math.floor((hoje.getTime() - prev.getTime()) / 86400000) : 0;
                    const tiles = [
                      { ic: "fa-barcode", rot: "Chassis", v: dt?.chassis },
                      { ic: "fa-gauge-high", rot: "Horímetro", v: dt?.horimetro },
                      { ic: "fa-clock", rot: "Horas do técnico", v: dt?.totalHora },
                      { ic: "fa-route", rot: "KM do técnico", v: dt?.totalKm ? `${dt.totalKm} km` : "" },
                    ].filter((t) => t.v);
                    return (
                    <div className="os-card os-aba os-aba-relatorio rt-card">
                      <style>{`
                        .rt-topo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
                        .rt-ico { width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #0B6E70; background: color-mix(in srgb, #0F8B8D 12%, transparent); }
                        .rt-nome { flex: 1; min-width: 180px; display: flex; flex-direction: column; line-height: 1.25; }
                        .rt-nome b { font-size: 14.5px; font-weight: 800; color: var(--portal-text, #1f2d3d); }
                        .rt-nome span { font-size: 12px; color: #64748b; }
                        .rt-selo { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 999px; font-size: 12px; font-weight: 800; }
                        .rt-selo.ok { background: #dcfce7; color: #15803d; }
                        .rt-selo.espera { background: var(--portal-bg-secondary, #f1f5f9); color: #64748b; }
                        .rt-selo.atraso { background: #fee2e2; color: #b91c1c; }
                        .rt-pdf { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 9px; font-size: 13px; font-weight: 700; text-decoration: none; color: #b91c1c; border: 1px solid #fecaca; background: #fff5f5; }
                        .rt-pdf:hover { background: #fee2e2; }
                        .rt-aviso { margin-top: 12px; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; line-height: 1.55; }
                        .rt-aviso.vermelho { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
                        .rt-aviso.amarelo { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
                        .rt-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 16px; }
                        .rt-tile { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); }
                        .rt-tile i { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #0891A8; background: color-mix(in srgb, #0891A8 10%, transparent); flex-shrink: 0; }
                        .rt-tile span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #94a3b8; }
                        .rt-tile b { display: block; font-size: 14px; font-weight: 800; color: var(--portal-text, #1f2d3d); font-variant-numeric: tabular-nums; }
                        .rt-bloco { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: var(--portal-bg-secondary, #f6f8f9); }
                        .rt-bloco > span { display: block; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 4px; }
                        .rt-bloco > p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--portal-text, #334155); white-space: pre-wrap; }
                        .rt-sec { margin: 16px 0 8px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #64748b; }
                        .rt-assin { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                        .rt-assin > div { cursor: zoom-in; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fefefe); padding: 8px 10px 10px; display: flex; flex-direction: column; align-items: center; }
                        .rt-assin img { width: 100%; height: 84px; object-fit: contain; border-bottom: 1px dashed var(--border, #cbd5e1); margin-bottom: 6px; }
                        .rt-assin b { font-size: 12.5px; color: var(--portal-text, #1f2d3d); }
                        .rt-assin span { font-size: 11px; color: #94a3b8; }
                      `}</style>
                      <div className="rt-topo">
                        <span className="rt-ico"><i className="fas fa-clipboard-check" /></span>
                        <div className="rt-nome">
                          <b>Relatório do técnico</b>
                          <span>{enviado ? `Preenchido no app${dp ? ` em ${dp}` : ""}` : dt ? "Rascunho iniciado no app do técnico" : "O técnico ainda não preencheu no app"}</span>
                        </div>
                        <span className={`rt-selo ${enviado ? "ok" : diasAtraso > 0 ? "atraso" : "espera"}`}>
                          {enviado ? <><i className="fas fa-check" /> Preenchido</> : diasAtraso > 0 ? <><i className="fas fa-triangle-exclamation" /> Atrasado {diasAtraso} dia{diasAtraso > 1 ? "s" : ""}</> : <><i className="fas fa-hourglass-half" /> Aguardando</>}
                        </span>
                        {relatorioTecnico && <a className="rt-pdf" href={relatorioTecnico} target="_blank" rel="noopener noreferrer" title="PDF do relatório enviado pelo técnico"><i className="fas fa-file-pdf" /> Abrir PDF</a>}
                      </div>
                      {diasAtraso > 0 && <div className="rt-aviso vermelho"><i className="fas fa-triangle-exclamation" /> A previsão de execução era {previsaoExecucao.split("-").reverse().join("/")} e o relatório ainda não chegou.</div>}
                      {dt?.justificativaAtraso && <div className="rt-aviso amarelo"><b>Preenchido com atraso — justificativa:</b> {dt.justificativaAtraso}</div>}
                      {dt?.cartaCorrecao && <div className="rt-aviso amarelo"><b><i className="fas fa-pen-to-square" /> Carta de correção do técnico:</b><div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{dt.cartaCorrecao}</div></div>}
                      {enviado && osId && <TemparioOSBloco osId={osId} />}
                      {dt && (<>
                      {tiles.length > 0 && (
                        <div className="rt-tiles">
                          {tiles.map((t) => <div key={t.rot} className="rt-tile"><i className={`fas ${t.ic}`} /><div style={{ minWidth: 0 }}><span>{t.rot}</span><b>{t.v}</b></div></div>)}
                        </div>
                      )}
                      {dt.diagnostico && <div className="rt-bloco"><span>Diagnóstico</span><p>{dt.diagnostico}</p></div>}
                      {dt.servicoRealizado && <div className="rt-bloco"><span>Serviço realizado</span><p>{dt.servicoRealizado}</p></div>}
                      <div style={{ height: 12 }} />
                      {/* Peças extras */}
                      {dadosTecnico.pecasExtras?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", marginBottom: 6 }}>
                            <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />
                            Peças/Serviços Extras ({dadosTecnico.pecasExtras.length})
                          </div>
                          {dadosTecnico.pecasExtras.map((p: any, i: number) => (
                            <div key={i} style={{
                              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
                              padding: "6px 10px", marginBottom: 4, fontSize: 12, color: "#92400E",
                            }}>
                              {p.descricao || "Sem descrição"} — Qtd: {p.qtdUsada || 1}
                            </div>
                          ))}
                          {dadosTecnico.justificativaPecaExtra && (
                            <div style={{
                              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
                              padding: "8px 10px", marginTop: 4, fontSize: 12, color: "#991B1B",
                            }}>
                              <strong>Justificativa:</strong> {dadosTecnico.justificativaPecaExtra}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fotos organizadas por categoria */}
                      {(() => {
                        const fotos = dadosTecnico.fotos || {};
                        const categorias = [
                          { titulo: "Identificação", cor: "#1E3A5F", items: [
                            { label: "Horímetro", url: fotos.horimetro },
                            { label: "Chassis", url: fotos.chassis },
                          ]},
                          { titulo: "Equipamento", cor: "#1E3A5F", items: [
                            { label: "Frente", url: fotos.frente },
                            { label: "Direita", url: fotos.direita },
                            { label: "Esquerda", url: fotos.esquerda },
                            { label: "Traseira", url: fotos.traseira },
                            { label: "Volante", url: fotos.volante },
                          ]},
                          { titulo: "Falha / Defeito", cor: "#DC2626", items: [
                            { label: "Falha 1", url: fotos.falha1 },
                            { label: "Falha 2", url: fotos.falha2 },
                            { label: "Falha 3", url: fotos.falha3 },
                            { label: "Falha 4", url: fotos.falha4 },
                          ]},
                          { titulo: "Peças", cor: "#D97706", items: [
                            { label: "Peça Nova 1", url: fotos.pecaNova1 },
                            { label: "Peça Nova 2", url: fotos.pecaNova2 },
                            { label: "Instalada 1", url: fotos.pecaInstalada1 },
                            { label: "Instalada 2", url: fotos.pecaInstalada2 },
                          ]},
                        ];

                        return categorias.map((cat) => {
                          const comFoto = cat.items.filter(f => f.url);
                          if (comFoto.length === 0) return null;
                          return (
                            <div key={cat.titulo} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: cat.cor, textTransform: "uppercase", marginBottom: 6 }}>
                                {cat.titulo} ({comFoto.length})
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
                                {comFoto.map((f) => (
                                  <div key={f.label} style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(f.url)}>
                                    <img
                                      src={f.url}
                                      alt={f.label}
                                      style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8, border: "1.5px solid var(--portal-border)" }}
                                    />
                                    <div style={{ fontSize: 9, color: "var(--portal-text-secondary)", textAlign: "center", marginTop: 2, fontWeight: 600 }}>{f.label}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })()}

                      {(dt.assinaturas?.cliente || dt.assinaturas?.tecnico) && (
                        <>
                          <div className="rt-sec">Assinaturas</div>
                          <div className="rt-assin">
                            {dt.assinaturas.cliente && (
                              <div onClick={() => setFotoExpandida(dt.assinaturas.cliente)} title="Ampliar">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={dt.assinaturas.cliente} alt="Assinatura do cliente" />
                                <b>{dt.nomResponsavel || "Cliente"}</b><span>cliente</span>
                              </div>
                            )}
                            {dt.assinaturas.tecnico && (
                              <div onClick={() => setFotoExpandida(dt.assinaturas.tecnico)} title="Ampliar">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={dt.assinaturas.tecnico} alt="Assinatura do técnico" />
                                <b>{tecnico1 || "Técnico"}</b><span>técnico</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      </>)}
                    </div>
                    );
                  })()}

                  {/* ── Modal foto expandida ── */}
                  {fotoExpandida && (
                    <div
                      onClick={() => setFotoExpandida(null)}
                      style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
                        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "zoom-out",
                      }}
                    >
                      <img src={fotoExpandida} alt="Foto expandida"
                        style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} />
                    </div>
                  )}

                  {/* ── Equipe & Atendimento ── */}
                  <div id="osc-equipe" className="os-card" style={{ order: mode === "create" ? -4.7 : -3, display: mode === "edit" ? "none" : undefined }}>
                    <div className="os-card-title">
                      {mode === "create" && <span className={`osc-num${tecnico1 ? " ok" : ""}`}>{tecnico1 ? <i className="fas fa-check" /> : 2}</span>}
                      <i className="fas fa-users" /> Equipe &amp; Atendimento
                    </div>
                    <div className="os-row">
                      <div style={S_FLEX1}>
                        <label>Técnico Responsável</label>
                        <select value={tecnico1} onChange={(e) => setTecnico1(e.target.value)}>
                          <option value="">Selecione...</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={S_FLEX1}>
                        <label>Segundo Técnico</label>
                        <select value={tecnico2} onChange={(e) => setTecnico2(e.target.value)}>
                          <option value="">Nenhum</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="os-row">
                      <div style={S_FLEX1}>
                        <label>Tipo de Atendimento</label>
                        <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value)}>
                          <option value="Manutenção">Manutenção</option>
                          <option value="Revisão">Revisão</option>
                        </select>
                      </div>
                      <div style={S_FLEX2}>
                        <label>Projeto / Equipamento</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="text" value={projeto} readOnly placeholder="Clique para pesquisar..." onClick={() => setShowProjModal(true)} style={{ ...S_POINTER_BOLD, flex: 1 }} />
                          <button type="button" onClick={() => setShowNovaMaquina(true)} title="Cadastrar máquina nova no Omie"
                            style={{ flexShrink: 0, padding: "0 12px", borderRadius: 6, border: "1px dashed #059669", background: "#ECFDF5", color: "#047857", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                            <i className="fas fa-plus" /> Nova
                          </button>
                        </div>
                      </div>
                    </div>
                    {tipoServico === "Revisão" && (
                      <>
                        <div>
                          <label>Plano de Revisão</label>
                          <input type="text" value={revisao} readOnly placeholder="Clique para pesquisar revisão..." onClick={() => setShowRevModal(true)} style={S_POINTER_BOLD_MB0} />
                        </div>
                        {mode === "create" && (
                          <div className="os-ppv-toggle" onClick={() => setGerarPPV(!gerarPPV)}>
                            <div className={`os-toggle ${gerarPPV ? "active" : ""}`}>
                              <div className="os-toggle-knob" />
                            </div>
                            <div className="os-ppv-toggle-info">
                              <span className="os-ppv-toggle-label">
                                <i className="fas fa-boxes" /> Gerar PPV automaticamente
                              </span>
                              <span className="os-ppv-toggle-desc">
                                Cria um PPV vinculado à OS com mesmo técnico e cliente
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {bombaAlerta && (
                      <div className="os-alert">
                        <i className="fas fa-exclamation-triangle" /> Lembrete: Oferecer limpeza na bomba injetora.
                      </div>
                    )}
                  </div>

                  {/* Criação: faixa de atalhos (almoço · peças · requisição) — leva até o bloco */}
                  {mode === "create" && (
                    <div className="osc-extras" style={{ order: -4.45 }}>
                      <span className="osc-extras-titulo">Já quer lançar?</span>
                      <button type="button" className={`osc-extra${alimentacoes.length ? " on" : ""}`} onClick={() => irPara("osc-almoco")}>
                        <i className="fas fa-utensils" /> Almoço{alimentacoes.length ? ` (${alimentacoes.length})` : ""}
                      </button>
                      <button type="button" className={`osc-extra${pecasPendentes.length ? " on" : ""}`} onClick={() => irPara("osc-pecas")}>
                        <i className="fas fa-boxes" /> Peças{pecasPendentes.length ? ` (${pecasPendentes.length})` : ""}
                      </button>
                      <button type="button" className={`osc-extra${abrirReqDepois ? " on" : ""}`} onClick={() => irPara("osc-req")}>
                        <i className="fas fa-shopping-cart" /> Requisição{abrirReqDepois ? " ✓" : ""}
                      </button>
                    </div>
                  )}

                  {/* Alimentação: em edição mora na aba Requisições & Alimentação */}
                  {mode === "create" && cardAlimentacao(false, -4.4)}

                  {/* ── Criação: peças (vão pro PPV que nasce junto com a OS) ── */}
                  {mode === "create" && (
                    <div id="osc-pecas" className="os-card" style={{ order: -4.3 }}>
                      <div className="os-card-title"><i className="fas fa-boxes" /> Peças</div>
                      {pecasPendentes.length === 0 ? (
                        <div className="osc-vazio">Nenhuma peça ainda. Ao criar a OS, um PPV é aberto junto e as peças escolhidas aqui entram nele.</div>
                      ) : (
                        <div className="osc-pecas-lista">
                          {pecasPendentes.map((p, i) => (
                            <div key={`${p.codigo}-${i}`} className="osc-peca">
                              <span className="osc-peca-cod">{p.codigo}</span>
                              <span className="osc-peca-desc">{p.descricao}{p.kit ? <em> · {p.kit}</em> : null}</span>
                              <input type="number" min={1} value={p.quantidade} title="Quantidade"
                                onChange={(e) => { const q = Math.max(1, parseInt(e.target.value || "1", 10) || 1); setPecasPendentes((prev) => prev.map((x, k) => k === i ? { ...x, quantidade: q } : x)); }} />
                              <span className="osc-peca-valor">R$ {fmtBR(p.preco * p.quantidade)}</span>
                              <button type="button" title="Tirar" onClick={() => setPecasPendentes((prev) => prev.filter((_, k) => k !== i))}><i className="fas fa-times" /></button>
                            </div>
                          ))}
                          <div className="osc-pecas-total">Total das peças: <b>R$ {fmtBR(pecasPendentes.reduce((s, p) => s + p.preco * p.quantidade, 0))}</b></div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button type="button" className="osc-btn" onClick={() => setShowAddProdModal(true)}><i className="fas fa-plus" /> Adicionar peça</button>
                        <button type="button" className="osc-btn contorno" onClick={() => setKitOSOpen(true)}><i className="fas fa-box-open" /> Kit de revisão</button>
                      </div>
                    </div>
                  )}

                  {/* ── Criação: requisição (abre o formulário já ligado à OS nova) ── */}
                  {mode === "create" && (
                    <div id="osc-req" className="os-card" style={{ order: -4.2 }}>
                      <div className="os-card-title"><i className="fas fa-shopping-cart" /> Requisição</div>
                      <label className={`osc-toggle${abrirReqDepois ? " on" : ""}`}>
                        <input type="checkbox" checked={abrirReqDepois} onChange={(e) => setAbrirReqDepois(e.target.checked)} />
                        <span>
                          <b>Abrir uma requisição para esta OS assim que eu criar</b>
                          <small>O formulário abre em outra aba já com a OS, o cliente e o chassi preenchidos — é só completar.</small>
                        </span>
                      </label>
                    </div>
                  )}


                  {/* ── Descrição (aba Lista de Serviços, no lugar da antiga tabela) ── */}
                  <div id="osc-servico" className="os-card os-aba os-aba-servicos" style={{ order: -4.5, display: mode === "edit" ? "none" : undefined }}>
                    <div className="os-card-title">
                      {mode === "create" && <span className={`osc-num${solicitacaoPreenchida ? " ok" : ""}`}>{solicitacaoPreenchida ? <i className="fas fa-check" /> : 3}</span>}
                      <i className={mode === "edit" ? "fas fa-calendar-check" : "fas fa-align-left"} /> {mode === "edit" ? "Execução e assinatura" : "Descrição do Serviço"}
                    </div>
                    {/* Linha discreta: atendimento, projeto, datas e hora
                        (na criação, atendimento e projeto já estão nos blocos de cima) */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                      {false && <>
                      <div style={{ width: 130 }}>
                        <label style={L_DISC}>Atendimento</label>
                        <select value={tipoServico} disabled={!podeEditar} onChange={(e) => setTipoServico(e.target.value)} style={I_DISC}>
                          <option value="Manutenção">Manutenção</option>
                          <option value="Revisão">Revisão</option>
                        </select>
                      </div>
                      <div style={{ width: 300, maxWidth: "100%" }}>
                        <label style={L_DISC}>Projeto / Equipamento</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="text" value={projeto} readOnly onClick={() => podeEditar && setShowProjModal(true)} placeholder="Clique na lupa..." style={{ ...I_DISC, flex: 1, cursor: "pointer" }} />
                          <button type="button" onClick={() => podeEditar && setShowProjModal(true)} title="Pesquisar equipamento" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 3, border: "1px solid var(--border)", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 11 }}>
                            <i className="fas fa-search" />
                          </button>
                          {podeEditar && (
                            <button type="button" onClick={() => setShowNovaMaquina(true)} title="Cadastrar máquina nova no Omie" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 3, border: "1px dashed #059669", background: "#ECFDF5", color: "#047857", cursor: "pointer", fontSize: 11 }}>
                              <i className="fas fa-plus" />
                            </button>
                          )}
                        </div>
                      </div>
                      </>}
                      <div style={{ width: 135 }}>
                        <label style={L_DISC}>Data Início</label>
                        <input type="date" value={previsaoExecucao} disabled={!podeEditar} onChange={(e) => {
                          setPrevisaoExecucao(e.target.value);
                          if (!e.target.value || !dataFimServico) return;
                          const start = new Date(e.target.value + "T12:00:00");
                          const end = new Date(dataFimServico + "T12:00:00");
                          if (start > end) return;
                          const days: string[] = [];
                          const cur = new Date(start);
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1); }
                          setDiasExecucao(days);
                        }} style={I_DISC} />
                      </div>
                      <div style={{ width: 135 }}>
                        <label style={L_DISC}>Data Fim</label>
                        <input type="date" value={dataFimServico} disabled={!podeEditar} onChange={(e) => {
                          setDataFimServico(e.target.value);
                          if (!e.target.value || !previsaoExecucao) return;
                          const start = new Date(previsaoExecucao + "T12:00:00");
                          const end = new Date(e.target.value + "T12:00:00");
                          if (start > end) return;
                          const days: string[] = [];
                          const cur = new Date(start);
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1); }
                          setDiasExecucao(days);
                        }} style={I_DISC} />
                      </div>
                      <div style={{ width: 105 }}>
                        <label style={L_DISC}>Hora Início</label>
                        <input type="time" value={horaInicioServico} disabled={!podeEditar} onChange={(e) => setHoraInicioServico(e.target.value)} style={I_DISC} />
                      </div>
                    </div>
                    {tipoServico === "Revisão" && mode === "create" && (
                      <div style={{ width: 320, maxWidth: "100%", marginBottom: 12 }}>
                        <label style={L_DISC}>Plano de Revisão</label>
                        <input type="text" value={revisao} readOnly onClick={() => podeEditar && setShowRevModal(true)} placeholder="Escolher plano..." style={{ ...I_DISC, cursor: "pointer" }} />
                      </div>
                    )}
                    {tipoServico === "Revisão" && mode === "edit" && osId && (
                      <ChequeRevisaoBloco osId={osId} podeEditar={podeEditar} />
                    )}
                    {mode === "edit" && osId && (
                      <AssinaturaClienteBloco osId={osId} podeEditar={podeEditar} />
                    )}
                    {mode === "edit" && osId && (
                      <ResservicoBloco key={osId} osId={osId} podeEditar={podeEditar} tecnicos={tecnicos} tecnicoAtual={tecnico1} />
                    )}
                    {mode === "edit" && osId && (
                      <ComissaoOSBloco osId={osId} podeEditar={podeEditar} />
                    )}
                    {/* na edição o texto e horas/km ficam na Lista de Serviços (formato Omie) */}
                    {mode === "create" && <textarea rows={10} value={servSolicitado} onChange={(e) => setServSolicitado(e.target.value)} style={S_MONO_MB0} />}
                    {mode === "create" && <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                      <div style={{ width: 160 }}>
                        <label>Qtd. Horas</label>
                        <input type="number" value={qtdHoras} onChange={(e) => handleQtdHorasChange(parseFloat(e.target.value || "0"))} style={{ marginBottom: 0 }} />
                        <div className="os-field-hint">x R$ {Number(VH).toFixed(2)} = R$ {Number(subtotalHoras).toFixed(2)}</div>
                      </div>
                      <div style={{ width: 160 }}>
                        <label>Qtd. KM</label>
                        <input type="number" value={qtdKm} onChange={(e) => setQtdKm(parseFloat(e.target.value || "0"))} style={{ marginBottom: 0 }} />
                        <div className="os-field-hint">x R$ {Number(VK).toFixed(2)} = R$ {Number(subtotalKm).toFixed(2)}</div>
                      </div>
                    </div>}
                  </div>

                  {/* ── Observações (campo próprio, aba Observações) ── */}
                  <div className="os-card os-aba os-aba-obs">
                    <div className="os-card-title"><i className="fas fa-comment-dots" /> Observações</div>
                    <textarea rows={8} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações internas da OS..." style={S_MONO_MB0} />
                    {/* no PDF da OS só se marcar (começa desmarcado); grifar = fundo amarelo no texto todo (José, 23/10/2026) */}
                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", margin: 0, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                        <input type="checkbox" checked={!!esp.obsPdf?.mostrar} style={{ width: 16, height: 16, margin: 0 }}
                          onChange={(e) => { const v = e.target.checked; setEsp((x) => ({ ...x, obsPdf: { mostrar: v, grifar: v ? !!x.obsPdf?.grifar : false } })); }} />
                        Sair no PDF da ordem de serviço
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: esp.obsPdf?.mostrar ? "pointer" : "not-allowed", margin: 0, textTransform: "none", letterSpacing: 0, fontWeight: 600, opacity: esp.obsPdf?.mostrar ? 1 : .45 }}>
                        <input type="checkbox" disabled={!esp.obsPdf?.mostrar} checked={!!esp.obsPdf?.grifar} style={{ width: 16, height: 16, margin: 0 }}
                          onChange={(e) => { const v = e.target.checked; setEsp((x) => ({ ...x, obsPdf: { mostrar: !!x.obsPdf?.mostrar, grifar: v } })); }} />
                        <span style={{ background: "#fde047", color: "#111111", padding: "0 5px", borderRadius: 3 }}>Grifar em amarelo</span> no PDF
                      </label>
                    </div>
                  </div>

                  {/* ── Cancelamento — logo abaixo das Observações ── */}
                  {mode === "edit" && status === "Cancelada" && (
                    <div className="os-card os-aba os-aba-obs" style={{ borderLeft: "3px solid #C62828" }}>
                      <div className="os-card-title"><i className="fas fa-ban" style={{ color: "#C62828" }} /> Cancelamento</div>
                      <label>Motivo do Cancelamento *</label>
                      <textarea rows={2} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Descreva o motivo do cancelamento..." style={{ marginBottom: 12 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: temSubstituto ? 10 : 0 }}>
                        <input type="checkbox" id="temSubstituto" checked={temSubstituto} onChange={(e) => { setTemSubstituto(e.target.checked); if (!e.target.checked) { setSubstitutoId(""); } }} />
                        <label htmlFor="temSubstituto" style={{ margin: 0, fontWeight: 600, cursor: "pointer" }}>Tem substituto?</label>
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

                  </div>{/* fim painel Ordem de Serviço (parte 1) */}

                  {/* ── Painel: Peças / PPV ── */}
                  <div className="os-tab-panel" style={{ display: aba === "ppv" ? "flex" : "none" }}>
                  {/* ── PPV & Requisições (edit) ── */}
                  {mode === "edit" && (
                    <div className="os-card" style={{ display: abaOmie === "requisicoes" ? "none" : undefined }}>
                      <div className="os-card-title"><i className="fas fa-boxes" /> Materiais &amp; Requisições</div>
                      {/* Peças da OS refeitas (José, 21/10/2026: "melhora isso aqui"): PPVs em cima, peças em colunas com
                          R$ no formato BR, quantidade em etiqueta, total destacado e botões no rodapé */}
                      <style>{ESTILO_PECAS_OS}</style>
                      <div className="pc-topo">
                        <span className="pc-rot">PPV{ppvIds.length > 1 ? "s" : ""}</span>
                        {ppvIds.length ? ppvIds.map((pid) => <a key={pid} className="pc-ppv" href={`/ppv?id=${encodeURIComponent(pid)}`} target="_blank" rel="noreferrer" title="Abrir o PPV em outra aba">{pid}<i className="fas fa-arrow-up-right-from-square" /></a>) : <span className="pc-rot">nenhum</span>}
                        {podeEditar && osId && (
                          <button type="button" className="pc-editar" onClick={() => setEditarPPVs(true)}>
                            <i className="fas fa-pen" /> Trocar PPVs
                          </button>
                        )}
                      </div>
                      {editarPPVs && osId && (
                        <EditarPPVsModal osId={osId} cliente={clienteInfo?.nome || ""} vinculados={ppvIds} onClose={() => setEditarPPVs(false)}
                          onSalvo={(nova) => { setPpv(nova); loadPPV(nova); setLogRefreshKey((k) => k + 1); onSaved?.(); }} />
                      )}

                      {/* OS sem PPV: cria um vinculado na hora (qualquer etapa) —
                          garantia recebe as peças DEPOIS do serviço */}
                      {ppvIds.length === 0 && (
                        <div style={{ marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--portal-border)", background: "var(--portal-bg-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "var(--portal-text-secondary)", lineHeight: 1.5 }}>
                            Esta OS não tem PPV — crie um pra lançar as peças (funciona em qualquer etapa, inclusive Executada/Garantia/Concluída).
                          </span>
                          <button type="button" onClick={criarPPVVinculado} disabled={criandoPPV || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : undefined}
                            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none", background: criandoPPV || !podeEditar ? "var(--portal-text-faint)" : "#0d9488", color: "#fff", fontSize: 13, fontWeight: 600, cursor: criandoPPV || !podeEditar ? "not-allowed" : "pointer" }}>
                            {criandoPPV ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus-circle" /> Criar PPV de peças pra esta OS</>}
                          </button>
                        </div>
                      )}
                      {produtos.length > 0 && (
                        <div className="pc-lista">
                          <div className="pc-l cab"><span>Código</span><span>Peça</span><span className="d">Qtd.</span><span className="d">Unitário</span><span className="d">Total</span><span /></div>
                          {produtos.map((p, i) => (
                            <div key={`${p.ppvId}-${p.codigo}-${i}`} className="pc-l">
                              <span>
                                {p.codigo ? (
                                  <button type="button" className="pc-cod" onClick={() => setDetalheProd(p)} title="Item de Orçamento — dados do produto + impostos">
                                    {p.codigo}<i className="fas fa-circle-info" />
                                  </button>
                                ) : <span className="pc-sem">—</span>}
                              </span>
                              <span className="pc-desc">
                                {p.descricao}
                                {ppvIds.length > 1 && p.ppvId && <small>PPV {p.ppvId}</small>}
                              </span>
                              <span className="d"><em className="pc-qt">{p.qtde} un</em></span>
                              <span className="d pc-un">{brlPeca(p.valor)}</span>
                              <span className="d pc-tot">{brlPeca(p.valor * p.qtde)}</span>
                              <span className="d">
                                {p.codigo && p.ppvId && (
                                  <button type="button" className="pc-lapis" onClick={() => setEditandoProd(p)} disabled={!podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Editar quantidade, valor ou remover"}>
                                    <i className="fas fa-pen" />
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Total de peças + adicionar peça direto no PPV vinculado */}
                      {ppvIds.length > 0 && (
                        <div className="pc-rodape">
                          <div className="pc-total">
                            <small>Total de peças{produtos.length > 0 ? ` · ${produtos.length} ite${produtos.length > 1 ? "ns" : "m"}` : ""}</small>
                            <b>{brlPeca(totalPecas)}</b>
                          </div>
                          <div className="pc-acoes">
                            {ppvIds.length > 1 && (
                              <select value={addProdTarget} onChange={(e) => setAddProdTarget(e.target.value)} style={{ marginBottom: 0, width: "auto" }} title="Escolha o PPV">
                                <option value="">Em qual PPV?</option>
                                {ppvIds.map((id) => <option key={id} value={id}>PPV {id}</option>)}
                              </select>
                            )}
                            <button type="button" className="pc-kit" onClick={abrirKitOS} disabled={importandoKitOS || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Importar kit de revisão (inteiro ou só algumas peças)"}>
                              {importandoKitOS ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-box-open" /> Kit de revisão</>}
                            </button>
                            <button type="button" className="pc-add" onClick={abrirAddProduto} disabled={addingProduto || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Busca com mais usados, catálogo e kit — pergunta a quantidade"}>
                              {addingProduto ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Adicionar peça</>}
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                  {/* ── Requisições da OS (aba própria). As de ALIMENTAÇÃO (automáticas) ficam no cartão
                      de Alimentação — antes apareciam nos dois (José, 14/10/2026) ── */}
                  {mode === "edit" && (() => {
                    const ehAlim = (r: { material: string }) => /^\s*alimenta/i.test(r.material || "");
                    const reqs = requisicoes.filter((r) => !ehAlim(r));
                    const totalReqs = reqs.reduce((t, r) => t + (r.valor || 0), 0);
                    const thR: React.CSSProperties = { padding: "9px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, color: "#64748b", textAlign: "left", background: "var(--portal-bg-secondary, #f6f8f9)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
                    const tdR: React.CSSProperties = { padding: "10px 12px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "middle" };
                    const icoBtn = (cor: string): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fefefe)", color: cor, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 });
                    // Cobrança: só requisições da tabela nova (vêm com tipo); legado fica sem selo (José, 26/10/2026)
                    const cobrDe = (r: (typeof reqs)[number]): ReqCobranca | null => r.tipo === undefined ? null : {
                      id: r.id, tipo: r.tipo, status: r.status, ordem_servico: osId, valor_cobrado_cliente: r.valor > 0 ? r.valor : null,
                      cobranca_status: r.cobranca_status, cobranca_motivo: r.cobranca_motivo, cobranca_por: r.cobranca_por, cobranca_em: r.cobranca_em,
                    };
                    const aCobrar = reqs.filter((r) => { const c = cobrDe(r); return !!c && temCobranca(c) && statusCobranca(c) === "a_cobrar"; }).length;
                    const mudouCobr = (id: string, c: Partial<ReqCobranca>) => setRequisicoes((prev) => prev.map((x) => x.id !== id ? x : {
                      ...x, cobranca_status: c.cobranca_status !== undefined ? c.cobranca_status : x.cobranca_status,
                      cobranca_motivo: c.cobranca_motivo !== undefined ? c.cobranca_motivo : x.cobranca_motivo,
                      cobranca_por: c.cobranca_por !== undefined ? c.cobranca_por : (c.cobranca_status === "nao_cobrada" ? userName : x.cobranca_por),
                      cobranca_em: c.cobranca_em !== undefined ? c.cobranca_em : x.cobranca_em,
                      valor: c.valor_cobrado_cliente != null ? Number(c.valor_cobrado_cliente) || x.valor : x.valor,
                    }));
                    return (
                    <div className="os-card" style={{ display: abaOmie === "requisicoes" ? undefined : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div className="os-card-title" style={{ margin: 0, padding: 0, border: "none", flex: 1 }}><i className="fas fa-shopping-cart" /> Requisições da OS {reqs.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "var(--portal-bg-secondary)", color: "#475569" }}>{reqs.length}</span>}</div>
                        <button type="button" onClick={() => setNovaReqOS(true)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 9, border: "none", background: "#0F8B8D", color: "#fefefe", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 6px rgba(15,139,141,.25)" }}>
                          <i className="fas fa-plus" /> Nova requisição
                        </button>
                      </div>
                      {reqs.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "22px 12px", border: "1px dashed var(--border)", borderRadius: 12, color: "var(--portal-text-muted)", fontSize: 13 }}>
                          <i className="fas fa-cart-plus" style={{ fontSize: 22, opacity: .5, display: "block", marginBottom: 6 }} />
                          Nenhuma requisição nesta OS. Use <b>Nova requisição</b> — ela já sai preenchida com a OS.
                        </div>
                      ) : (<>
                        <AvisoCobrancaOS qtd={aCobrar} />
                        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              <th style={thR}>Nº</th><th style={thR}>Situação</th><th style={thR}>Descrição</th><th style={thR}>Solicitante</th><th style={thR}>Cobrança</th>
                              <th style={{ ...thR, textAlign: "right" }}>Valor</th><th style={{ ...thR, textAlign: "center" }} title="Desligado = fora da folha e do total impresso (só nesta impressão)">No PDF</th><th style={thR} />
                            </tr></thead>
                            <tbody>
                              {reqs.map((r) => (
                                <Fragment key={r.id}>
                                  <tr>
                                    <td style={{ ...tdR, fontWeight: 800 }}><a href={`/requisicoes?req=${r.id}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>#{r.id}</a></td>
                                    <td style={tdR}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: r.atualizada ? "#dcfce7" : "#fef3c7", color: r.atualizada ? "#15803d" : "#92400e" }}>{r.atualizada ? "OK" : "Pendente"}</span></td>
                                    <td style={{ ...tdR, maxWidth: 360 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.material}>{r.material}</span></td>
                                    <td style={{ ...tdR, color: "var(--portal-text-muted)", whiteSpace: "nowrap" }}>{r.solicitante && r.solicitante !== "N/A" ? r.solicitante : "—"}</td>
                                    <td style={{ ...tdR, minWidth: 170 }}>{(() => { const c = cobrDe(r); if (!c || !temCobranca(c)) return <span style={{ color: "var(--portal-text-muted)" }}>—</span>; return (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                                        <SeloCobranca req={c} />
                                        <AcoesCobranca req={c} comValor pequeno onMudou={(m) => mudouCobr(r.id, m)} />
                                      </div>); })()}</td>
                                    <td style={{ ...tdR, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{r.valor > 0 ? `R$ ${fmtBR(r.valor)}` : "—"}</td>
                                    <td style={{ ...tdR, textAlign: "center" }}><Chave ligada={!reqsOcultasPrint.has(r.id)} onChange={() => toggleReqPrint(r.id)} rotulo="" /></td>
                                    <td style={{ ...tdR, whiteSpace: "nowrap", textAlign: "right" }}>
                                      <span style={{ display: "inline-flex", gap: 6 }}>
                                        <button type="button" onClick={() => window.open(`/requisicoes/imprimir/${r.id}`, "_blank")} title="Imprimir esta requisição" style={icoBtn("#0F8B8D")}><i className="fas fa-print" /></button>
                                        <button type="button" onClick={() => { setDesvinculandoReq(desvinculandoReq === r.id ? null : r.id); setJustificativaDesvinc(""); }} title="Desvincular da OS" style={icoBtn("#dc2626")}><i className="fas fa-link-slash" /></button>
                                      </span>
                                    </td>
                                  </tr>
                                  {desvinculandoReq === r.id && (
                                    <tr><td colSpan={8} style={{ ...tdR, background: "#fff7f7" }}>
                                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7f1d1d" }}>Desvincular a #{r.id}:</span>
                                        <input autoFocus type="text" placeholder="Justificativa (obrigatória)" value={justificativaDesvinc} onChange={(e) => setJustificativaDesvinc(e.target.value)}
                                          style={{ flex: 1, minWidth: 220, height: 34, padding: "0 10px", fontSize: 13, borderRadius: 8, border: "1px solid #fca5a5", marginBottom: 0 }} />
                                        <button type="button" disabled={!justificativaDesvinc.trim()}
                                          onClick={async () => {
                                            await fetch("/api/pos/requisicoes/desvincular", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ reqId: r.id, justificativa: justificativaDesvinc.trim(), usuario: userName || "Admin" }) });
                                            setRequisicoes((prev) => prev.filter((x) => x.id !== r.id)); setDesvinculandoReq(null); setJustificativaDesvinc("");
                                          }}
                                          style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: justificativaDesvinc.trim() ? "#dc2626" : "#fca5a5", color: "#fefefe", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Desvincular</button>
                                        <button type="button" onClick={() => { setDesvinculandoReq(null); setJustificativaDesvinc(""); }} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                                      </div>
                                    </td></tr>
                                  )}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", fontSize: 12, borderTop: "1px solid var(--border)", background: "var(--portal-bg-secondary, #f6f8f9)", color: "var(--portal-text-muted)" }}>
                            <span><i className="fas fa-print" /> “No PDF” desligado tira a requisição da folha impressa da OS</span>
                            <b style={{ color: "var(--portal-text)" }}>Total R$ {fmtBR(totalReqs)}</b>
                          </div>
                        </div>
                      </>)}
                      {novaReqOS && osId && (
                        <NovaRequisicaoOSModal osId={osId} tecnico={tecnico1} userName={userName || ""} onClose={() => setNovaReqOS(false)}
                          onCriada={async () => {
                            try { const d = await fetch(`/api/pos/ordens/${osId}`).then((r) => r.json()); setRequisicoes(d.infoRequisicoes || []); } catch { /* a lista recarrega ao reabrir */ }
                            setLogRefreshKey((k) => k + 1);
                          }} />
                      )}
                    </div>
                    );
                  })()}
                  {/* ── Alimentação & Dias do Serviço — mesma aba das requisições ── */}
                  {mode === "edit" && cardAlimentacao(abaOmie !== "requisicoes")}

                  </div>{/* fim painel Peças / PPV */}

                  {/* Histórico embaixo do conteúdo (toggle pela aba/botão Histórico) */}
                  {mode === "edit" && (
                    <div className="os-log-embaixo" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                      {showLogs && <EmailsPecasOS osId={osId} />}
                      <LogPanel osId={osId} visible={showLogs} refreshKey={logRefreshKey} />
                    </div>
                  )}

                </div>
              </>
            )}
          </div>

          {/* ── Coluna de ações à direita (estilo Omie) ── */}
          <div className="os-action-rail os-rail-nova">
            {/* visual da coluna (José, 14/10/2026) — aqui dentro p/ não depender do CSS global */}
            <style>{`
              .os-rail-nova { gap: 10px !important; padding: 14px 12px !important; background: var(--portal-bg-secondary, #f6f8f9) !important; }
              .os-rail-nova .os-rail-btn.primary { height: 46px; border-radius: 12px; font-size: 14.5px; font-weight: 800; letter-spacing: .2px;
                background: linear-gradient(135deg, #22d3ee, #0BB7CD 50%, #0891A8) !important; box-shadow: 0 6px 16px rgba(8,145,168,.3); margin-bottom: 2px; }
              .os-rail-nova .os-rail-btn.primary:hover { filter: brightness(1.05); }
              .os-rail-nova .os-rail-btn.primary i { width: auto; background: none; }
              .os-rail-acoes { background: var(--surface, #fefefe); border: 1px solid var(--border); border-radius: 12px; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
              .os-rail-acoes-titulo { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #94a3b8; padding: 6px 8px 4px; }
              .os-rail-nova .os-rail-acoes .os-rail-btn { gap: 10px; padding: 7px 8px; font-size: 13.5px; font-weight: 600; border-radius: 9px; color: var(--portal-text, #1f2d3d); }
              .os-rail-nova .os-rail-acoes .os-rail-btn i { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px;
                background: color-mix(in srgb, #0891A8 11%, transparent); color: #0891A8; }
              .os-rail-nova .os-rail-acoes .os-rail-btn:hover:not(:disabled) { background: color-mix(in srgb, #0891A8 7%, transparent); }
              .os-rail-nova .os-rail-perigo { background: var(--surface, #fefefe); border: 1px solid color-mix(in srgb, #C62828 25%, var(--border)); border-radius: 12px; padding: 6px; }
              .os-rail-nova .os-rail-perigo .os-rail-btn { gap: 10px; padding: 7px 8px; font-size: 13.5px; font-weight: 700; border-radius: 9px; color: #C62828 !important; }
              .os-rail-nova .os-rail-perigo .os-rail-btn i { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; background: #fee2e2; color: #C62828 !important; }
              .os-rail-nova .os-rail-perigo .os-rail-btn:hover { background: #fef2f2; }
            `}</style>
            <button
              className="os-rail-btn primary"
              onClick={salvar}
              disabled={saving || (mode === "edit" && loadingData) || (mode === "edit" && !podeEditar)}
              title={(mode === "edit" && !podeEditar) ? MSG_SEM_PERMISSAO : undefined}
            >
              <i className="fas fa-floppy-disk" />
              {saving ? "Salvando..." : (mode === "edit" && loadingData) ? "Carregando..." : mode === "create" ? "Criar Ordem" : (mode === "edit" && !podeEditar) ? "Somente leitura" : "Salvar"}
            </button>

            {mode === "edit" && (
              <>
                {/* ── Bloco Omie: PDFs da OS e do pedido de venda + Faturar (OS e pedido vinculado) ── */}
                {(() => {
                  const semZeros = (n: string) => String(n || "").split(",").map((x) => x.trim().replace(/^0+(?=\d)/, "")).filter(Boolean).join(", ");
                  const pedidosMapa = Object.entries(ppvOmieMap);
                  // nºs do pedido que vieram no envio da OS e ainda não estão no mapa (sem repetir)
                  const noMapa = new Set(pedidosMapa.map(([, n]) => semZeros(n)));
                  // vem como "PPV-0446:000000000007739" — compara só o nº do Omie (senão aparecia duplicado)
                  const pvSolto = String(pedidoVenda || "").split(",").map((x) => semZeros(String(x.split(":").pop() || "").trim())).filter((n) => n && !noMapa.has(n)).join(", ");
                  // "o que virou o quê": nº do portal → nº no Omie, com o PDF do Omie no fim da linha
                  const linhaDoc = (portal: string, omie: string, onPdf: (() => void) | null, carregando: boolean, chave: string, primeira: boolean) => (
                    <div key={chave} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 2px", borderTop: primeira ? "none" : "1px solid var(--border)" }}>
                      {void portal}
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, color: "var(--portal-text-muted, #94a3b8)" }}>{/^OS/.test(omie) ? "Ordem de serviço" : /^Remessa/.test(omie) ? "Remessa de peças" : "Pedido de venda"}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>nº {omie.replace(/^(OS|Pedido|Remessa)\s*/, "")}</span>
                      </span>
                      {onPdf && (
                        <button type="button" onClick={onPdf} disabled={carregando} title="Abrir o PDF oficial no Omie (gerado na hora)"
                          style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "#dc2626", cursor: carregando ? "wait" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5 }}>
                          <i className={`fas ${carregando ? "fa-spinner fa-spin" : "fa-file-pdf"}`} />
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <div style={{ margin: "6px 0 8px", padding: "10px 10px 8px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/marcas/omie.png" alt="Omie" style={{ height: 16, width: "auto", display: "block" }} />
                      </div>
                      {!ordemOmie && (
                        <>
                          {/* Qualquer fase, desde que solicitação + serviço realizado estejam preenchidos (José, 13/10/2026) */}
                          {faltaOmie.length === 0 ? (
                            <>
                              <div style={{ fontSize: 11.5, color: "var(--portal-text-muted)", padding: "0 2px", lineHeight: 1.4 }}>
                                A OS está pronta para ir ao Omie. Ao enviar, ela vira uma OS no Omie e o pedido de peças vai junto.
                              </div>
                              {envioOmie && osId && <EnviarOmieModal estado={envioOmie} osId={osId} cliente={clienteInfo?.nome || ""} interna={servicoInterno}
                                ppvIds={ppvIds} onConfirmar={() => { void executarEnvioOmie(); }} onFechar={() => setEnvioOmie(null)} />}
                              <button type="button" onClick={enviarParaOmie} disabled={enviandoOmie || !podeOmie}
                                title={!podeOmie ? MSG_SEM_PERMISSAO : servicoInterno ? "OS interna: vai normal pro Omie; peças saem como remessa" : "Criar esta OS no Omie"}
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 40, padding: "0 12px", borderRadius: 10, border: "none",
                                  background: podeOmie ? "linear-gradient(135deg, #22d3ee, #0BB7CD 55%, #0891A8)" : "#94A3B8", color: "#fefefe", fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap",
                                  cursor: enviandoOmie ? "wait" : podeOmie ? "pointer" : "not-allowed", fontFamily: "inherit", boxShadow: podeOmie ? "0 4px 12px rgba(11,183,205,.35)" : "none" }}>
                                <i className={`fas ${enviandoOmie ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {enviandoOmie ? "Enviando ao Omie..." : "Enviar para o Omie"}
                              </button>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 9, background: "var(--surface)", border: "1px dashed color-mix(in srgb, #0BB7CD 50%, var(--border))" }}>
                              <i className="fas fa-lock" style={{ color: "#0891A8", fontSize: 12, marginTop: 2 }} />
                              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--portal-text-secondary, #475569)" }}>
                                <b style={{ color: "var(--portal-text)" }}>Ainda não está no Omie.</b> O envio libera quando a <b>Solicitação do cliente</b> e o <b>Serviço Realizado</b> estiverem preenchidos na descrição da OS.
                                <div style={{ marginTop: 3, color: "var(--portal-text-muted)" }}>Falta preencher: {faltaOmie.join(" e ")}</div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {(ordemOmie || pedidosMapa.length > 0 || pvSolto) && (
                        <div style={{ padding: "0 2px" }}>
                          {ordemOmie && linhaDoc(osId || "OS", `OS ${semZeros(ordemOmie)}`, abrirPdfOmie, baixandoPdfOmie, "os", true)}
                          {pedidosMapa.map(([pid, numOmie]) => linhaDoc(pid, `${servicoInterno ? "Remessa" : "Pedido"} ${semZeros(numOmie)}${/castro/i.test(ppvEmpresaMap[pid] || "") ? " · Castro" : ""}`, () => abrirPdfPecasOmie(pid), baixandoPdfPecas === pid, pid, false))}
                          {/* cancelados ao corrigir a nota: "OS 5185 → virou 5397" (José, 23/10/2026) */}
                          {omieAnteriores.map((a) => (
                            <div key={`ant-${a.tipo}-${a.numero}`} title={a.canceladaEm ? `Cancelado em ${new Date(a.canceladaEm).toLocaleDateString("pt-BR")}` : "Cancelado"}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderTop: "1px solid var(--border)", opacity: .75 }}>
                              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, color: "var(--portal-text-muted, #94a3b8)" }}>{a.tipo === "os" ? "Ordem de serviço" : "Pedido de venda"} anterior</span>
                                <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <s>nº {a.numero}</s>
                                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, color: "#b91c1c", background: "#fee2e2" }}>{a.tipo === "os" ? "cancelada" : "cancelado"}</span>
                                </span>
                                {a.novo && <span style={{ fontSize: 11, color: "var(--portal-text-muted)", marginTop: 2 }}>virou {a.tipo === "os" ? "a OS" : "o pedido"} nº {a.novo}</span>}
                              </span>
                            </div>
                          ))}
                          {pvSolto && linhaDoc(ppvOmieCarregando ? "peças" : "peças", ppvOmieCarregando ? "conferindo…" : `Pedido ${pvSolto}`, null, false, "pv-solto", false)}
                        </div>
                      )}
                      {/* peças que não foram ao Omie junto com a OS: reenviar */}
                      {ordemOmie && !ppvOmieCarregando && ppvIds.filter((pid) => !ppvOmieMap[pid]).map((pid) => {
                        const indo = enviandoPecas === pid;
                        const enviar = async () => {
                          if (!osId) return;
                          setEnviandoPecas(pid); setMsgPecas(null);
                          try {
                            const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/enviar-pecas`, { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ ppvId: pid }) });
                            const j = await r.json().catch(() => ({}));
                            if (r.ok && j.ok) { setMsgPecas({ ok: true, texto: `${servicoInterno ? "Remessa" : "Pedido"} nº ${String(j.numero || "").replace(/^0+(?=\d)/, "")} criado${j.aviso ? ` · ${j.aviso}` : ""}` }); setOmieRefresh((k) => k + 1); }
                            else setMsgPecas({ ok: false, texto: String(j.error || `Erro ${r.status}`) });
                          } catch { setMsgPecas({ ok: false, texto: "Sem conexão." }); }
                          setEnviandoPecas(null);
                        };
                        return (
                          <div key={`fora-${pid}`} style={{ marginTop: 8, padding: "10px 11px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: "#ffedd5", color: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}><i className="fas fa-box-open" /></span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#7c2d12", whiteSpace: "nowrap" }}>{pid}</div>
                                <div style={{ fontSize: 11, color: "#9a3412" }}>peças fora do Omie</div>
                              </div>
                            </div>
                            <button type="button" disabled={!!enviandoPecas || !podeOmie} onClick={enviar}
                              title={`Envia como ${servicoInterno ? "remessa" : "pedido de venda"}. Procura o produto na Nova e, se não achar, na Castro.`}
                              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 32, marginTop: 8, borderRadius: 8, border: "none", background: indo ? "#fdba74" : "#ea580c", color: "#fefefe", fontWeight: 800, fontSize: 12, cursor: enviandoPecas ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                              <i className={`fas ${indo ? "fa-spinner fa-spin" : "fa-paper-plane"}`} /> {indo ? "Enviando ao Omie…" : `Enviar ${servicoInterno ? "remessa" : "pedido"}`}
                            </button>
                          </div>
                        );
                      })}
                      {msgPecas && (
                        <div style={{ marginTop: 6, padding: "6px 9px", borderRadius: 8, fontSize: 11, fontWeight: 600, lineHeight: 1.4, background: msgPecas.ok ? "#f0fdf4" : "#fef2f2", color: msgPecas.ok ? "#15803d" : "#b91c1c" }}>
                          <i className={`fas ${msgPecas.ok ? "fa-check" : "fa-circle-exclamation"}`} /> {msgPecas.texto}
                        </div>
                      )}
                      {osId && ordemOmie && (
                        <FaturamentoOSBloco
                          osId={osId}
                          ordemOmie={ordemOmie}
                          ajustarOS={podeEditar ? ajustarParaFaturar : undefined}
                          documento={clienteInfo?.cpf || ""}
                          abrirAoCarregar={abrirFaturar}
                          onAtualizar={async () => {
                            try {
                              const d = await fetch(`/api/pos/ordens/${osId}`).then((r) => r.json());
                              if (d?.status) setStatusDoServidor(d.status); if (d && "faturadoOmieEm" in d) setFaturadaEm(d.faturadoOmieEm || null);
                              if (d?.ordemOmie !== undefined) setOrdemOmie(d.ordemOmie || "");
                              if (Array.isArray(d?.omieAnteriores)) setOmieAnteriores(d.omieAnteriores);
                            } catch { /* a lista recarrega */ }
                            setLogRefreshKey((k) => k + 1);
                            onSaved?.();
                          }}
                          onFaturado={async () => {
                            // bloco de notas já entra em "aguardando a nota" (José, 14/10/2026)
                            setNotasEsperaDesde(Date.now());
                            try {
                              const d = await fetch(`/api/pos/ordens/${osId}`).then((r) => r.json());
                              if (d?.status) setStatusDoServidor(d.status); if (d && "faturadoOmieEm" in d) setFaturadaEm(d.faturadoOmieEm || null);
                            } catch { /* a lista recarrega */ }
                            setLogRefreshKey((k) => k + 1);
                            onSaved?.();
                          }}
                        />
                      )}
                    </div>
                  );
                })()}

                {osId && ordemOmie && <NotasFiscaisBloco osId={osId} ordemOmie={ordemOmie} anteriores={omieAnteriores} ppvIds={ppvIds} ppvOmieMap={ppvOmieMap} esperandoDesde={notasEsperaDesde} clienteDoc={clienteInfo?.cpf || null} />}

                {/* ── Bloco Portal (logo da Nova): imprimir a OS, relatório técnico, PPVs e requisições ── */}
                {(() => {
                  const cartao = (cor: string): React.CSSProperties => ({ margin: "4px 0 6px", padding: 10, borderRadius: 12, border: `1px solid color-mix(in srgb, ${cor} 40%, var(--border))`, background: `color-mix(in srgb, ${cor} 6%, var(--surface))`, display: "flex", flexDirection: "column", gap: 6 });
                  const cabeca = (icone: string, cor: string, titulo: string, onAbrir: () => void) => (
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px" }}>
                      <i className={`fas ${icone}`} style={{ color: cor, fontSize: 13 }} />
                      <span style={{ flex: 1, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4 }}>{titulo}</span>
                      <button type="button" onClick={onAbrir} title="Abrir a aba" style={{ background: "none", border: "none", color: cor, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>abrir</button>
                    </div>
                  );
                  const botaoImprimir = (onClick: () => void, titulo: string) => (
                    <button type="button" onClick={onClick} title={titulo} aria-label={titulo}
                      style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "#64748b", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12 }}>
                      <i className="fas fa-print" />
                    </button>
                  );
                  const linha = (chave: string, titulo: string, sub: string | null, acao: React.ReactNode) => (
                    <div key={chave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
                        {sub && <div style={{ fontSize: 10.5, color: "var(--portal-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
                      </div>
                      {acao}
                    </div>
                  );
                  const MAX = 4;
                  const reqsVer = requisicoes.slice(0, MAX);
                  const sub = (titulo: string, onAbrir?: () => void) => (
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "var(--portal-text-muted)", margin: "4px 2px 0", display: "flex", alignItems: "center" }}>
                      <span style={{ flex: 1 }}>{titulo}</span>
                      {onAbrir && <button type="button" onClick={onAbrir} style={{ background: "none", border: "none", color: "#0369A1", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, textTransform: "none", letterSpacing: 0 }}>abrir</button>}
                    </div>
                  );
                  void cabeca;
                  return (
                    <div style={cartao("#DC2626")}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/Logo_Nova.png" alt="Nova Tratores" style={{ height: 17, width: "auto", display: "block" }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-muted)" }}>portal</span>
                      </div>
                      <div style={{ position: "relative" }}>
                        <button ref={printBtnRef} className="os-rail-btn" onClick={abrirPrintMenu}>
                          <i className="fas fa-print" /> {servicoInterno ? "Comprovante" : "Imprimir"}
                          <i className="fas fa-chevron-down" style={{ fontSize: 9, marginLeft: 4 }} />
                        </button>
                        {printMenu && printPos && (
                          <>
                            <div onClick={() => setPrintMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 5000 }} />
                            <div style={{ position: "fixed", top: printPos.top, left: printPos.left, zIndex: 5001, background: "var(--surface)", border: "1px solid var(--portal-border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.16)", padding: 6, minWidth: 232, display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: .5, padding: "6px 10px 2px" }}>{servicoInterno ? "Comprovante da OS" : "PDF da OS"}</div>
                              <button className="os-printmenu-item" onClick={() => imprimirOS(true)} style={printMenuItem}>
                                <i className="fas fa-list" style={{ width: 16, color: "#0d9488" }} /> Com as peças
                              </button>
                              <button className="os-printmenu-item" onClick={() => imprimirOS(false)} style={printMenuItem}>
                                <i className="fas fa-file-lines" style={{ width: 16, color: "#64748b" }} /> Sem as peças
                              </button>
                              {/* relatório do técnico entra no MESMO menu (antes era um 2º botão — redundante) */}
                              {relatorioTecnico && (
                                <button className="os-printmenu-item" onClick={() => { setPrintMenu(false); window.open(relatorioTecnico, "_blank", "noopener"); }} style={printMenuItem}
                                  title="Abre o relatório preenchido pelo técnico (PDF) numa aba nova">
                                  <i className="fas fa-file-pdf" style={{ width: 16, color: "#0369A1" }} /> Relatório técnico
                                </button>
                              )}
                              {reqsOcultasPrint.size > 0 && (
                                <div style={{ fontSize: 10.5, color: "#B45309", padding: "2px 10px 4px" }}>
                                  <i className="fas fa-eye-slash" style={{ marginRight: 4 }} />{reqsOcultasPrint.size} requisição(ões) fora da impressão (aba Requisições &amp; Alimentação)
                                </div>
                              )}
                              {ppvIds.length > 0 && (
                                <>
                                  <div style={{ height: 1, background: "var(--portal-border)", margin: "4px 6px" }} />
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: .5, padding: "2px 10px" }}>PDF do PPV vinculado</div>
                                  {ppvIds.map((pid) => (
                                    <button key={pid} className="os-printmenu-item" onClick={() => imprimirPPV(pid)} style={printMenuItem}>
                                      <i className="fas fa-boxes" style={{ width: 16, color: "#dc2626" }} /> Imprimir PPV {pid}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    <>
                      {osId && (
                        <>
                          {sub("Ordem de serviço")}
                          {linha(`os-${osId}`, osId, ordemOmie ? `no Omie: OS ${ordemOmie.replace(/^0+(?=\d)/, "")}` : "ainda não está no Omie", null)}
                        </>
                      )}
                      {ppvIds.length > 0 && (
                        <>
                          {sub("Peças (PPV)", () => { setAba("ppv"); setAbaOmie("produtos"); })}
                          {ppvIds.map((pid) => linha(pid, pid, ppvOmieMap[pid] ? `no Omie: pedido ${ppvOmieMap[pid].replace(/^0+(?=\d)/, "")}` : ppvOmieCarregando ? "conferindo no Omie…" : "ainda não está no Omie", botaoImprimir(() => imprimirPPV(pid), `Imprimir o PPV ${pid}`)))}
                        </>
                      )}
                      <>
                        {sub(`Requisições${(requisicoes.length + alimentacoes.length) ? ` (${requisicoes.length + alimentacoes.length})` : ""}`, () => { setAba("ppv"); setAbaOmie("requisicoes"); })}
                        {reqsVer.map((r) => linha(r.id, `Req. #${r.id}`, [r.material, r.valor > 0 ? `R$ ${r.valor.toFixed(2).replace(".", ",")}` : ""].filter(Boolean).join(" · ") || null,
                          botaoImprimir(() => window.open(`/requisicoes/imprimir/${r.id}`, "_blank"), `Imprimir a requisição #${r.id}`)))}
                        {requisicoes.length > MAX && (
                          <button type="button" onClick={() => { setAba("ppv"); setAbaOmie("requisicoes"); }} style={{ background: "none", border: "none", color: "#0D9488", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "2px 0" }}>
                            ver todas ({requisicoes.length})
                          </button>
                        )}
                        {!requisicoes.length && (
                          <div style={{ fontSize: 12, color: "var(--portal-text-muted)", padding: "2px 2px" }}>
                            {alimentacoes.length ? `${alimentacoes.length} alimentação(ões) — sem requisição de compra` : "Nenhuma requisição nesta OS."}
                          </div>
                        )}
                      </>
                    </>
                    </div>
                  );
                })()}
                <div className="os-rail-acoes">
                <div className="os-rail-acoes-titulo">Ações</div>
                <button className="os-rail-btn" onClick={() => setShowTarefas(true)} disabled={!osId} title="Tarefas desta OS (atribuir a alguém, lembrete, concluir)" style={{ position: "relative" }}>
                  <i className="fas fa-tasks" /> Tarefas
                  {tarefasPendentes > 0 && <span style={{ marginLeft: "auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "#c2570a", color: "#fefefe", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }} title={`${tarefasPendentes} tarefa(s) pendente(s)`}>{tarefasPendentes}</span>}
                </button>
                <button className="os-rail-btn" onClick={() => setShowAnexos(true)} disabled={!osId} title="Anexar foto/arquivo e comentários nesta OS">
                  <i className="fas fa-paperclip" /> Anexos
                  {anexosCount > 0 && <span style={{ marginLeft: "auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "var(--portal-bg-secondary, #f1f5f9)", color: "var(--portal-text)", fontSize: 11.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{anexosCount}</span>}
                </button>
                <button className="os-rail-btn" onClick={duplicarOS} disabled={duplicando || !podeCriarOS} title={!podeCriarOS ? MSG_SEM_PERMISSAO : "Criar uma OS nova igual a esta (cliente, técnicos, serviço, horas e km)"}>
                  <i className={`fas ${duplicando ? "fa-spinner fa-spin" : "fa-copy"}`} /> {duplicando ? "Duplicando..." : "Duplicar"}
                </button>

                <button className="os-rail-btn" onClick={abrirQR}>
                  <i className="fas fa-qrcode" /> Gerar QR Code
                </button>
                <AnexosModal open={showAnexos} ppvId={osId || null} autor={userName} onClose={() => setShowAnexos(false)} onChanged={recarregarAnexosCount} showToast={avisar} />
                <TarefasModal open={showTarefas} ppvId={osId || null} userName={userName} onClose={() => setShowTarefas(false)} onChanged={recarregarTarefasCount} showToast={avisar} />
                {qrOpen && (
                  <>
                    <div onClick={() => setQrOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 6000 }} />
                    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 6001, background: "var(--surface)", borderRadius: 18, padding: "26px 26px 22px", width: "min(92vw, 380px)", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", textAlign: "center" }}>
                      <button onClick={() => setQrOpen(false)} style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8" }}>Ordem de Serviço</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", marginTop: 2 }}>{osId}</div>
                      {clienteInfo?.nome && (
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#334155", marginTop: 2 }}>{clienteInfo.nome}</div>
                      )}
                      <div style={{ margin: "16px auto", width: "100%", maxWidth: 300, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {qrDataUrl
                          ? <img src={qrDataUrl} alt={`QR Code da OS ${osId}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          : <span style={{ color: "#94a3b8", fontSize: 13 }}>Gerando QR Code…</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>Aponte a câmera do celular para o QR Code para ver esta ordem de serviço — ela fica sempre atualizada.</div>
                      <textarea value={qrObs} onChange={(e) => setQrObs(e.target.value)} placeholder="Observações (aparecem na impressão) — opcional"
                        style={{ width: "100%", minHeight: 60, marginTop: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#111827", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => { navigator.clipboard?.writeText(qrLink); setQrCopiado(true); setTimeout(() => setQrCopiado(false), 1500); }}
                          style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "var(--surface)", color: qrCopiado ? "#16a34a" : "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          <i className={`fas ${qrCopiado ? "fa-check" : "fa-link"}`} style={{ marginRight: 6 }} />{qrCopiado ? "Copiado!" : "Copiar link"}
                        </button>
                        <button onClick={imprimirQR} disabled={!qrDataUrl}
                          style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 700, cursor: qrDataUrl ? "pointer" : "default", opacity: qrDataUrl ? 1 : 0.5 }}>
                          <i className="fas fa-print" style={{ marginRight: 6 }} />Imprimir
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {(garantiaVinculada || /garantia/i.test(tipoServico)) && (
                  <button className="os-rail-btn" onClick={() => { setAba("os"); setAbaOmie("info"); }}>
                    <i className="fas fa-shield-halved" /> Garantia
                  </button>
                )}

                <button className="os-rail-btn" onClick={() => setShowLogs(!showLogs)}>
                  <i className="fas fa-clock-rotate-left" /> Histórico
                </button>

                {podeOcorrencia && (
                  <button className="os-rail-btn" onClick={() => setShowOcorrencia(true)}>
                    <i className="fas fa-triangle-exclamation" /> Registrar Ocorrência
                  </button>
                )}
                </div>


              </>
            )}

            {mode === "edit" && podeCancelar && status !== "Cancelada" && (
              <>
                <div className="os-rail-perigo">
                  <button className="os-rail-btn" onClick={() => mudarStatus("Cancelada")}>
                    <i className="fas fa-ban" /> Cancelar OS
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Lembrete com valor ao abrir a OS e motivo do desconto (José, 27/10/2026) */}
      {visible && !loadingData && lembreteComValor && !pedirMotivo && typeof document !== "undefined" && createPortal(
        <ModalValorLembrete l={lembreteComValor} totalOS={total} ocupado={aplicandoLembrete || saving}
          onAplicar={() => aplicarLembreteValor(lembreteComValor)}
          onDepois={() => setLembretesAdiados((p) => [...p, lembreteComValor.id])} />,
        document.body)}
      {visible && pedirMotivo && typeof document !== "undefined" && createPortal(
        <ModalMotivoDesconto valor={descValor} motivoAtual={esp.descontoMotivo?.texto || ""}
          obrigatorio={Math.abs(descValor - descExplicadoRef.current) > 0.004}
          onSalvar={salvarMotivoDesconto} onCancelar={cancelarMotivoDesconto} />,
        document.body)}

      {/* MODAL central: cancelar exige MOTIVO (não deixa cancelar sem).
          PORTAL no body — o drawer tem transform e prenderia o fixed. */}
      {cancelModal && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100002, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--surface, #fff)", border: "2px solid #C62828", borderRadius: 16, width: 480, maxWidth: "94vw", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ padding: "14px 18px", background: "#C62828", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <i className="fas fa-ban" />
              <b style={{ fontSize: 15 }}>Cancelar a OS {String(osId || "").replace(/^OS-?/i, "")}</b>
            </div>
            <div style={{ padding: 18 }}>
              <label style={{ fontWeight: 700 }}>Motivo do Cancelamento *</label>
              <textarea rows={3} value={motivoTmp} onChange={(e) => setMotivoTmp(e.target.value)} placeholder="Por que esta OS está sendo cancelada?" autoFocus style={{ width: "100%", boxSizing: "border-box", marginTop: 6 }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => setCancelModal(false)}
                  style={{ border: "1px solid var(--border, #cbd5e1)", background: "transparent", color: "var(--texto, #334155)", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                  Voltar
                </button>
                <button
                  disabled={!motivoTmp.trim()}
                  onClick={() => { setMotivoCancel(motivoTmp.trim()); setStatus("Cancelada"); setCancelModal(false); }}
                  style={{ border: "none", background: "#C62828", color: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 700, cursor: motivoTmp.trim() ? "pointer" : "default", opacity: motivoTmp.trim() ? 1 : 0.5 }}>
                  Confirmar cancelamento
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {verLocalizacao && osId && <LocalizacaoClienteModal osId={osId} onClose={() => setVerLocalizacao(false)} />}
      <SearchModal title="Pesquisar Equipamento / Chassis" placeholder="Digite chassis, modelo ou número..." apiUrl="/api/pos/buscas/projetos" paramName="termo" visible={showProjModal} onClose={() => setShowProjModal(false)}
        onSelect={(item) => {
          const nome = item.nome || "";
          const partes = nome.trim().split(/\s+/);
          aplicarEquipamento(nome, partes[0] || "", partes.slice(1).join(" ") || "");
        }}
        renderItem={(item) => item.nome || ""}
        realtimeTabela="portal_nt_projetos_PRINCIPAL"
        rodape={podeEditar ? (
          <button type="button" onClick={() => { setShowProjModal(false); setShowNovaMaquina(true); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 40, borderRadius: 8, border: "1px dashed #059669", background: "#ECFDF5", color: "#047857", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <i className="fas fa-plus" /> Não achou? Cadastrar máquina nova
          </button>
        ) : undefined}
      />

      {/* Atalhos de cadastro (criam no Omie; aparecem ao vivo pra todos) */}
      <ModalNovoCliente aberto={showNovoCliente} onFechar={() => setShowNovoCliente(false)} zIndex={95000}
        onCriado={(c) => {
          setShowNovoCliente(false);
          onClienteCriado?.(c.cliente);
          selectCliente(c.cliente.chave);
          setClienteFilter("");
          if (mode === "edit") setMostrarTrocaCliente(false);
          if (c.aviso) alert(c.aviso);
          else if (c.ja_existia) alert(`Esse CNPJ/CPF já estava cadastrado no Omie — usei o cadastro existente (cód. ${c.cod_cli}).`);
        }} />
      <ModalNovaMaquina aberto={showNovaMaquina} onFechar={() => setShowNovaMaquina(false)} zIndex={95000}
        onCriada={(m) => {
          setShowNovaMaquina(false);
          aplicarEquipamento(m.nome, m.modelo, m.chassi);
          if (m.aviso) alert(m.aviso);
          else if (m.ja_existia) alert(`A máquina "${m.nome}" já existia — usei a cadastrada.`);
        }} />

      <SearchModal title="Pesquisar Revisão Pronta" placeholder="Digite termos da revisão..." apiUrl="/api/pos/buscas/revisoes" paramName="termo" visible={showRevModal} onClose={() => setShowRevModal(false)}
        onSelect={(item) => setRevisao(item.descricao || "")}
        renderItem={(item) => item.descricao || ""}
      />

      {/* Adicionar peça no PPV vinculado — MESMA experiência do "Novo Item" do
          PPV: mais usados, busca, catálogo, atalho de kit e pergunta de
          quantidade. Wrapper com z-index acima do drawer da OS. */}
      <div style={{ position: "relative", zIndex: 7000 }}>
        <PPVMiniProvider>
          <ModalBuscaProduto
            open={showAddProdModal}
            mode="modal"
            onClose={() => setShowAddProdModal(false)}
            onSelect={(codigo, descricao, preco, _empresa, qtd) => {
              // Criação: a OS ainda não existe — guarda e manda pro PPV ao criar
              if (mode === "create") {
                if (!codigo) return;
                setPecasPendentes((prev) => [...prev, { codigo, descricao: descricao || codigo, preco: Number(preco) || 0, quantidade: qtd && qtd > 0 ? qtd : 1 }]);
                return;
              }
              adicionarProdutoPPV({ codigo, descricao, preco }, qtd);
            }}
            onAbrirKit={() => { setShowAddProdModal(false); setKitOSOpen(true); }}
          />
        </PPVMiniProvider>
        <ModalImportarKit open={kitOSOpen} onClose={() => setKitOSOpen(false)} onImportar={(produtos, _horas, rotulo) => {
          setKitOSOpen(false);
          if (mode === "create") {
            const kit = rotulo || "Kit";
            setPecasPendentes((prev) => [...prev, ...produtos.filter((p) => p.codigo).map((p) => ({ codigo: p.codigo, descricao: p.descricao || p.codigo, preco: Number(p.preco) || 0, quantidade: p.quantidade || 1, kit }))]);
            return;
          }
          importarKitNaOS(produtos, rotulo);
        }} />
      </div>

      {/* Clicar no código da peça = mesmo modal do PPV (dados do produto + impostos) */}
      <ItemOrcamentoModal
        open={!!detalheProd}
        ppvId={detalheProd?.ppvId || null}
        pedidoOmie={detalheProd?.pedidoOmie}
        conta={detalheProd?.conta || "NOVA"}
        codigo={detalheProd?.codigo || null}
        descricao={detalheProd?.descricao}
        quantidade={detalheProd?.qtde}
        preco={detalheProd?.valor}
        userName={userName || ""}
        onClose={() => setDetalheProd(null)}
        showToast={(tipo, msg) => { if (tipo === "error") alert(msg); }}
        itens={produtos.filter((p) => p.codigo && p.ppvId === detalheProd?.ppvId).map((p) => ({ codigo: p.codigo!, descricao: p.descricao, conta: p.conta || "NOVA", quantidade: p.qtde, preco: p.valor }))}
        onIrPara={(it) => setDetalheProd(produtos.find((p) => p.ppvId === detalheProd?.ppvId && p.codigo === it.codigo) || null)}
      />
      <ModalEditarItemOS
        item={editandoProd && editandoProd.codigo && editandoProd.ppvId ? { ppvId: editandoProd.ppvId, codigo: editandoProd.codigo, descricao: editandoProd.descricao, qtde: editandoProd.qtde, valor: editandoProd.valor } : null}
        tecnico={tecnico1 || ""}
        userName={userName}
        podeEditar={podeEditar}
        onClose={() => setEditandoProd(null)}
        onSalvo={() => loadPPV(ppv)}
      />
    </>
  );
}

const brlPeca = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ESTILO_PECAS_OS = `
.pc-topo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px }
.pc-rot { font-size: 13px; color: var(--portal-text-secondary, #475569) }
.pc-ppv { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; padding: 3px 11px; border-radius: 999px; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #0369A1 20%, transparent); color: #0369A1; text-decoration: none }
.pc-ppv i { font-size: 10px; opacity: .7 } .pc-ppv:hover { background: color-mix(in srgb, #0369A1 14%, var(--surface, #fefefe)) }
.pc-editar { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer }
.pc-editar i { color: #0369A1; font-size: 11.5px } .pc-editar:hover { border-color: #93c5fd }
.pc-lista { border: 1px solid var(--border, #e2e8f0); border-radius: 14px; overflow: hidden; background: var(--surface, #fefefe) }
.pc-l { display: grid; grid-template-columns: minmax(120px, 170px) minmax(0, 1fr) 64px 104px 112px 34px; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--border, #f1f5f9); font-size: 13.5px; color: var(--portal-text, #0f172a) }
.pc-l:first-child { border-top: 0 } .pc-l:not(.cab):hover { background: color-mix(in srgb, #0369A1 4%, transparent) }
.pc-l.cab { padding: 8px 14px; font-size: 12.5px; color: var(--portal-text-secondary, #475569); background: var(--portal-bg-secondary, #f8fafc) }
.pc-l .d { text-align: right; justify-self: end }
.pc-cod { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; font-family: inherit; font-size: 13px; color: #2563eb; cursor: pointer; font-variant-numeric: tabular-nums; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pc-cod i { font-size: 10px; color: #93c5fd } .pc-cod:hover { text-decoration: underline }
.pc-sem { color: #94a3b8 }
.pc-desc { display: grid; min-width: 0; line-height: 1.35 } .pc-desc small { font-size: 12px; color: var(--portal-text-muted, #64748b) }
.pc-qt { font-style: normal; font-size: 12.5px; padding: 2px 9px; border-radius: 999px; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text, #0f172a); white-space: nowrap }
.pc-un { color: var(--portal-text-secondary, #475569); font-variant-numeric: tabular-nums; white-space: nowrap }
.pc-tot { font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap }
.pc-lapis { width: 30px; height: 30px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--portal-text-muted, #64748b); cursor: pointer; font-size: 12px }
.pc-lapis:hover:not(:disabled) { border-color: var(--border, #e2e8f0); color: #0369A1 } .pc-lapis:disabled { cursor: not-allowed; opacity: .5 }
.pc-rodape { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 12px; padding: 12px 14px; border-radius: 14px; background: var(--portal-bg-secondary, #f8fafc); border: 1px solid var(--border, #eef2f7) }
.pc-total { display: grid; line-height: 1.2 } .pc-total small { font-size: 13px; color: var(--portal-text-secondary, #475569) } .pc-total b { font-size: 24px; font-weight: 500; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; letter-spacing: -.01em }
.pc-acoes { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.pc-add, .pc-kit { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 18px; border-radius: 11px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap }
.pc-add { border: 0; background: #0d9488; color: #fefefe; box-shadow: 0 6px 14px -8px rgba(13,148,136,.7) } .pc-add:hover:not(:disabled) { filter: brightness(1.06) }
.pc-kit { border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a) } .pc-kit i { color: #0d9488 } .pc-kit:hover:not(:disabled) { border-color: #5eead4 }
.pc-add:disabled, .pc-kit:disabled { opacity: .55; cursor: not-allowed }
@media (max-width: 760px) { .pc-l { grid-template-columns: minmax(0, 1fr) auto 30px; } .pc-l.cab { display: none } .pc-l > span:nth-child(1) { grid-column: 1 / -1 } .pc-l > span:nth-child(3), .pc-l > span:nth-child(4) { display: none } }
`;
