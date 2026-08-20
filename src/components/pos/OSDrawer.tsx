"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import QRCode from "qrcode";
import { VALOR_HORA, VALOR_KM, TEXT_TEMPLATE, PHASES } from "@/lib/pos/constants";
import { authHeaders } from "@/lib/auth/client";
import type { ClienteOption, ClienteDados, Produto, AlimentacaoItem } from "@/lib/pos/types";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";
import SearchModal from "./SearchModal";
import LogPanel from "./LogPanel";
import ModalBuscaProduto from "@/components/ppv/ModalBuscaProduto";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import { PPVMiniProvider } from "@/lib/ppv/PPVContext";
import OSGarantiaInfo from "@/components/garantias/OSGarantiaInfo";
import OSUnidadesInfo from "@/components/ppv/OSUnidadesInfo";
import OcorrenciaFormModal from "@/components/ocorrencias/OcorrenciaFormModal";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";

interface OSDrawerProps {
  visible: boolean;
  mode: "create" | "edit";
  osId: string | null;
  clientes: ClienteOption[];
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

export default function OSDrawer({ visible, mode, osId, clientes, tecnicos, userName, onClose, onSaved, valorHora: propValorHora, valorKm: propValorKm, podeEditar = true, podeOmie = true, podeConcluir = true, podeCancelar = true }: OSDrawerProps) {
  const VH = propValorHora ?? VALOR_HORA;
  const VK = propValorKm ?? VALOR_KM;
  // Ocorrência rápida por OS (categoria OS pré-selecionada, técnico da OS)
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeOcorrencia = pode("painel-mecanicos", "criar_ocorrencia");
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [clienteChave, setClienteChave] = useState("");
  const [clienteInfo, setClienteInfo] = useState<ClienteDados | null>(null);
  const [status, setStatus] = useState("Orçamento");
  const [tecnico1, setTecnico1] = useState("");
  const [tecnico2, setTecnico2] = useState("");
  const [tipoServico, setTipoServico] = useState("Manutenção");
  const [projeto, setProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [servSolicitado, setServSolicitado] = useState(TEXT_TEMPLATE);
  const [ppv, setPpv] = useState("");
  const [qtdHoras, setQtdHoras] = useState(1);
  const [qtdKm, setQtdKm] = useState(0);
  const [descPorc, setDescPorc] = useState(0);
  const [descValor, setDescValor] = useState(0);
  const [descHoraValor, setDescHoraValor] = useState(0);
  const [descKmValor, setDescKmValor] = useState(0);
  const [ordemOmie, setOrdemOmie] = useState("");
  const [pedidoVenda, setPedidoVenda] = useState("");
  const [omieLog, setOmieLog] = useState("");
  // PDF da OS no Omie (osdocs · ObterOS) — aparece depois do "Enviar Omie"
  const [baixandoPdfOmie, setBaixandoPdfOmie] = useState(false);
  const abrirPdfOmie = useCallback(async () => {
    if (!osId || baixandoPdfOmie) return;
    setBaixandoPdfOmie(true);
    const win = window.open("", "_blank"); // abre no clique (evita bloqueio de pop-up)
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/pdf-omie`, { headers: await authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { win?.close(); alert(d.error || "Não consegui obter o PDF da ordem no Omie."); return; }
      if (win) win.location.href = d.url; else window.open(d.url, "_blank");
    } catch {
      win?.close(); alert("Erro de conexão ao buscar o PDF no Omie.");
    } finally { setBaixandoPdfOmie(false); }
  }, [osId, baixandoPdfOmie]);
  // PDF do pedido de PEÇAS vinculado (PPV) — atalho pela própria OS.
  // Só aparece quando o PPV JÁ virou pedido/remessa no Omie; o rótulo mostra
  // o número do Omie (não o id do PPV).
  const [ppvOmieMap, setPpvOmieMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = ppv.split(",").map((s) => s.trim()).filter(Boolean);
    if (!visible || ids.length === 0) { setPpvOmieMap({}); return; }
    let ativo = true;
    (async () => {
      const mapa: Record<string, string> = {};
      await Promise.all(ids.map(async (pid) => {
        try {
          const r = await fetch(`/api/ppv/pedidos?id=${encodeURIComponent(pid)}`);
          const j = r.ok ? await r.json() : null;
          if (j?.pedidoOmie) mapa[pid] = String(j.pedidoOmie);
        } catch { /* sem Omie ainda */ }
      }));
      if (ativo) setPpvOmieMap(mapa);
    })();
    return () => { ativo = false; };
  }, [ppv, visible, ordemOmie]);
  const [baixandoPdfPecas, setBaixandoPdfPecas] = useState<string | null>(null);
  const abrirPdfPecasOmie = useCallback(async (pid: string) => {
    if (!pid || baixandoPdfPecas) return;
    setBaixandoPdfPecas(pid);
    const win = window.open("", "_blank");
    try {
      const r = await fetch(`/api/ppv/pedidos/pdf-omie?id=${encodeURIComponent(pid)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) { win?.close(); alert(d.error || "Não consegui obter o PDF do pedido no Omie."); return; }
      if (win) win.location.href = d.url; else window.open(d.url, "_blank");
    } catch {
      win?.close(); alert("Erro de conexão ao buscar o PDF no Omie.");
    } finally { setBaixandoPdfPecas(null); }
  }, [baixandoPdfPecas]);
  const [motivoCancel, setMotivoCancel] = useState("");
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
  const [saving, setSaving] = useState(false);
  const [aba, setAba] = useState<"os" | "ppv">("os");
  const [loadingData, setLoadingData] = useState(false);
  // Incrementado após importar um orçamento → força recarregar os dados da OS
  const [reloadKey, setReloadKey] = useState(0);
  const [showProjModal, setShowProjModal] = useState(false);
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

  // Imprime a OS (com ou sem a lista de peças) ou o PDF do PPV vinculado.
  const imprimirOS = useCallback((comPecas: boolean) => {
    setPrintMenu(false);
    const w = window.open("", "_blank");
    if (!w) return;
    fetch(`/api/pos/ordens/${osId}/print?pecas=${comPecas ? 1 : 0}`)
      .then((r) => r.text()).then((html) => { w.document.write(html); w.document.close(); })
      .catch(() => w.close());
  }, [osId]);

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
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>QR OS ${osId}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:44px 24px;margin:0">
      <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#94a3b8">Ordem de Serviço</div>
      <div style="font-size:36px;font-weight:800;color:#111827;margin:4px 0 22px">${osId}</div>
      <img src="${qrDataUrl}" style="width:320px;max-width:80vw"/>
      <div style="font-size:15px;color:#475569;max-width:380px;margin:20px auto 0;line-height:1.6">Aponte a câmera do celular para o QR Code para acompanhar esta ordem de serviço — sempre atualizada.</div>
      <div style="text-align:left;max-width:400px;margin:26px auto 0;border-top:1px solid #e5e7eb;padding-top:14px">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px">Observações</div>
        ${obsHtml}
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script>
    </body></html>`);
    w.document.close();
  }, [qrDataUrl, osId, qrObs]);

  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [requisicoes, setRequisicoes] = useState<Array<{ id: string; atualizada: boolean; valor: number; material: string; solicitante: string }>>([]);
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
  const [lembretes, setLembretes] = useState<Array<{ id: number; lembrete: string }>>([]);
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

  const total = useMemo(() => {
    const sub = (subtotalHoras - descHoraValor) + (subtotalKm - descKmValor) + totalPecas + totalRequisicoes;
    return Math.max(0, sub - descValor);
  }, [subtotalHoras, subtotalKm, totalPecas, totalRequisicoes, descValor, descHoraValor, descKmValor]);

  const bombaAlerta = useMemo(
    () => tipoServico === "Revisão" && !!revisao && BOMBA_HORAS.some((h) => revisao.includes(h)),
    [tipoServico, revisao]
  );

  const totalDescontos = descHoraValor + descKmValor + descValor;

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
      const list: Produto[] = await res.json();
      setProdutos(list);
      setTotalPecas(list.reduce((s, p) => s + p.valor * p.qtde, 0));
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
        method: "POST", headers: { "Content-Type": "application/json" },
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
        method: "POST", headers: { "Content-Type": "application/json" },
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

  const salvarLembreteInline = useCallback(async (id: number, texto: string) => {
    try {
      await fetch(`/api/pos/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lembrete: texto }),
      });
      setLembretes((prev) => prev.map((l) => l.id === id ? { ...l, lembrete: texto } : l));
      setEditingLembreteId(null);
    } catch {
      alert("Erro ao salvar lembrete.");
    }
  }, []);

  const concluirLembrete = useCallback(async (id: number) => {
    if (!osId) { alert("Salve a OS antes de concluir o lembrete."); return; }
    if (!confirm(`Concluir este lembrete e registrar que foi resolvido na OS ${osId}?`)) return;
    try {
      await fetch(`/api/pos/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concluido: true, concluido_por: userName, concluido_em_ordem: String(osId) }),
      });
      setLembretes((prev) => prev.filter((l) => l.id !== id));
    } catch {
      alert("Erro ao concluir lembrete.");
    }
  }, [osId, userName]);

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
    fetchLembretes(chave);
  }, [fetchLembretes]);

  const syncDiscount = useCallback((type: "P" | "V", value: number) => {
    if (type === "P") {
      setDescPorc(value);
      setDescValor(subtotalBruto > 0 ? parseFloat(((value / 100) * subtotalBruto).toFixed(2)) : 0);
    } else {
      setDescValor(value);
      setDescPorc(subtotalBruto > 0 ? parseFloat(((value / subtotalBruto) * 100).toFixed(2)) : 0);
    }
  }, [subtotalBruto]);

  const enviarParaOmie = useCallback(async () => {
    if (!osId) return;
    if (!podeOmie) {
      alert("Você não tem permissão para enviar ao Omie.");
      return;
    }
    if (!confirm(servicoInterno
      ? "Deseja enviar esta OS para o Omie?\n\n• A OS é criada normalmente no Omie.\n• Por ser INTERNA, as peças vinculadas saem como REMESSA (não gera pedido de venda)."
      : "Deseja enviar esta OS para o Omie?")) return;
    setEnviandoOmie(true);
    try {
      const res = await fetch(`/api/pos/ordens/${osId}/omie`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName }) });
      const result = await res.json().catch(() => ({} as Record<string, never>));
      // Resposta sem os campos esperados = a conexão caiu no meio (ex.: timeout
      // do proxy do Railway enquanto o Omie processava). O envio pode TER dado
      // certo no servidor — reenviar às cegas assusta; melhor conferir.
      if (typeof result.sucesso === "undefined" && !result.erro) {
        alert(
          "A conexão caiu enquanto o Omie processava (demorou demais).\n\n" +
          "O envio pode ter sido concluído mesmo assim. Recarregue a página e confira se a OS recebeu o nº do Omie:\n" +
          "• Se recebeu, está tudo certo — não reenvie.\n" +
          "• Se não recebeu, tente enviar de novo (reenviar não duplica: o sistema recusa OS que já tem nº)."
        );
        setLogRefreshKey((k) => k + 1);
        onSaved?.();
        setEnviandoOmie(false);
        return;
      }
      if (result.sucesso) {
        let msg = `OS enviada para o Omie com sucesso!\nNº Omie: ${result.cNumOS}`;
        if (result.pedidoVenda) msg += `\n${servicoInterno ? "Remessa de peças" : "Pedido de Venda"} nº ${result.pedidoVenda}`;
        if (result.pedidoVendaErro) msg += `\nErro nas peças: ${result.pedidoVendaErro}`;
        alert(msg);
        if (result.cNumOS) setOrdemOmie(String(result.cNumOS));
        setStatus("Concluída");
        setLogRefreshKey((k) => k + 1);
        onSaved?.();
      } else {
        alert(`Erro ao enviar para o Omie:\n${result.erro}`);
      }
    } catch (err) {
      alert("Erro de conexão ao enviar para o Omie.");
      console.error(err);
    }
    setEnviandoOmie(false);
  }, [osId, onSaved, servicoInterno, userName, podeConcluir, podeOmie]);

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
        setStatus("Concluída");
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

  const salvar = useCallback(async () => {
    if (mode === "edit" && !podeEditar) { alert("Você não tem permissão para editar esta OS."); return; }
    if (status === "Cancelada" && !podeCancelar) { alert("Você não tem permissão para cancelar OS."); return; }
    if (mode === "create" && !clienteChave) { alert("Selecione o Cliente"); return; }
    if (status === "Cancelada" && !motivoCancel.trim()) { alert("Informe o motivo do cancelamento"); return; }
    if (status === "Cancelada" && temSubstituto && !substitutoId.trim()) { alert("Informe o ID do substituto"); return; }
    setSaving(true);
    const dados = {
      id: osId, nomeCliente: clienteInfo?.nome, cpfCliente: clienteInfo?.cpf,
      enderecoCliente: servicoOficina ? 'Nova Tratores - Av. São Sebastião, 1065 - Vila Campos, Piraju - SP' : clienteInfo?.endereco,
      cidadeCliente: servicoOficina ? 'Piraju' : (clienteInfo?.cidade || ''), tecnicoResponsavel: tecnico1, tecnico2,
      tipoServico, revisao, projeto, servicoSolicitado: servSolicitado,
      qtdHoras, qtdKm, ppv, status: mode === "create" ? "Orçamento" : status,
      ordemOmie, motivoCancelamento: motivoCancel,
      substitutoTipo: temSubstituto ? substitutoTipo : null,
      substitutoId: temSubstituto ? substitutoId : null,
      descontoValor: descValor, descontoHora: descHoraValor, descontoKm: descKmValor,
      relatorioTecnico,
      diasExecucao: diasExecucao.sort().join(','),
      previsaoExecucao,
      previsaoFaturamento,
      dataFimServico,
      horaInicioServico,
      servicoNumero,
      horaInicioExec,
      horaFimExec,
      horaChegada,
      gerarPPV: mode === "create" && tipoServico === "Revisão" && gerarPPV,
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
        alert(result.erro || "Erro ao salvar a OS.");
        setSaving(false);
        return;
      }
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
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar a OS.");
      setSaving(false);
    }
  }, [mode, osId, clienteChave, clienteInfo, tecnico1, tecnico2, tipoServico, revisao, projeto,
      servSolicitado, qtdHoras, qtdKm, ppv, status, ordemOmie, motivoCancel, descValor,
      descHoraValor, descKmValor, relatorioTecnico, previsaoExecucao, previsaoFaturamento, dataFimServico, servicoNumero,
      gerarPPV, servicoOficina, servicoInterno, alimentacoes, horaInicioExec, horaChegada, horaFimExec, onClose, onSaved, podeEditar, podeCancelar]);

  // ── Reset form to defaults ──
  const resetForm = useCallback(() => {
    setClienteChave(""); setClienteInfo(null); setStatus("Orçamento");
    setTecnico1(""); setTecnico2(""); setTipoServico("Manutenção");
    setProjeto(""); setRevisao(""); setServSolicitado(TEXT_TEMPLATE);
    setPpv(""); setQtdHoras(1); setQtdKm(0); setDescPorc(0); setDescValor(0); setDescHoraValor(0); setDescKmValor(0);
    setOrdemOmie(""); setPedidoVenda(""); setOmieLog(""); setMotivoCancel(""); setTemSubstituto(false); setSubstitutoTipo("POS"); setSubstitutoId("");
    setRelatorioTecnico("");
    const agora = new Date()
    const hojeStr = agora.toISOString().slice(0, 10)
    const horaStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    setPrevisaoExecucao(hojeStr)
    setPrevisaoFaturamento(""); setDataFimServico(""); setDiasExecucao([]); setServicoNumero(0); setHoraInicioExec(horaStr); setHoraChegada(""); setHoraFimExec(""); setAgendaTecnico([]);
    setEstimativa(null); setErroEstimativa(""); setLoadingEstimativa(false); setEnderecoEstimativa(""); setEnderecosDisponiveis([]);
    setProdutos([]); setTotalPecas(0); setShowLogs(false); setRequisicoes([]);
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
          setStatus(d.status || "Orçamento");
          setTecnico1(d.tecnicoResponsavel || ""); setTecnico2(d.tecnico2 || "");
          setTipoServico(d.tipoServico || "Manutenção"); setRevisao(d.revisao || "");
          setProjeto(d.projeto || "");
          setServSolicitado(d.servicoSolicitado || TEXT_TEMPLATE);
          setPpv(d.ppv || ""); setQtdHoras(d.qtdHoras || 0); setQtdKm(d.qtdKm || 0);
          const dv = parseFloat(d.descontoSalvo || 0);
          const dh = parseFloat(d.descontoHora || 0);
          const dk = parseFloat(d.descontoKm || 0);
          setDescValor(dv);
          setDescHoraValor(dh);
          setDescKmValor(dk);
          const sub = (d.qtdHoras || 0) * VH + (d.qtdKm || 0) * VK;
          setDescPorc(sub > 0 ? parseFloat(((dv / sub) * 100).toFixed(2)) : 0);
          setOrdemOmie(d.ordemOmie || ""); setMotivoCancel(d.motivoCancelamento || "");
          setPedidoVenda(d.pedidoVenda || ""); setOmieLog(d.omieEnvioLog || "");
          setTemSubstituto(!!(d.substitutoTipo && d.substitutoId));
          setSubstitutoTipo(d.substitutoTipo || "POS");
          setSubstitutoId(d.substitutoId || "");
          setRelatorioTecnico(d.relatorioTecnico || "");
          setPrevisaoExecucao(d.previsaoExecucao || "");
          setPrevisaoFaturamento(d.previsaoFaturamento || "");
          setDataFimServico(d.dataFimServico || "");
          setHoraInicioServico(d.horaInicioServico || "");
          setDiasExecucao(d.diasExecucao ? d.diasExecucao.split(',').filter(Boolean) : []);
          setHoraInicioExec(d.horaInicioExec || horaAtualBR());
          setHoraChegada(d.horaChegada || "");
          setHoraFimExec(d.horaFimExec || "");
          setRequisicoes(d.infoRequisicoes || []);
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
  if (!visible) return null;

  // PPVs vinculados (o campo aceita vários separados por vírgula)
  const ppvIds = ppv.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <div className="drawer-overlay active">
        <div className="modal-container">
          <div className="drawer os-drawer">
            {/* Header */}
            <div className="os-header">
              <div className="os-header-left">
                <span className="os-header-title">
                  {mode === "create" ? "Nova Ordem de Serviço" : `${osId}`}
                </span>
                {mode === "edit" && (
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={!podeEditar}
                    title="Alterar status da OS"
                    style={{ ...STATUS_BADGE_STYLE(status), border: "none", outline: "none", cursor: podeEditar ? "pointer" : "not-allowed", maxWidth: 340 }}
                  >
                    {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </div>
              <div className="os-header-actions">
                {mode === "edit" && podeOcorrencia && (
                  <button
                    onClick={() => setShowOcorrencia(true)}
                    title="Registrar ocorrência ligada a esta OS (falta de informação, retorno de serviço…)"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 12px", cursor: "pointer", marginRight: 8 }}
                  >
                    ⚠ Ocorrência
                  </button>
                )}
                <button className="os-btn-close" onClick={onClose}>
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

                  {/* ── Abas (edit): Ordem de Serviço / Peças (PPV) ── */}
                  {mode === "edit" && (
                    <div className="os-tabs">
                      <button type="button" className={`os-tab ${aba === "os" ? "active" : ""}`} onClick={() => setAba("os")}>
                        <i className="fas fa-file-lines" /> Ordem de Serviço
                      </button>
                      <button type="button" className={`os-tab ${aba === "ppv" ? "active" : ""}`} onClick={() => setAba("ppv")}>
                        <i className="fas fa-boxes" /> PPV / Requisições
                        {(produtos.length > 0 || requisicoes.length > 0) && (
                          <span className="os-tab-badge">{produtos.length + requisicoes.length}</span>
                        )}
                      </button>
                    </div>
                  )}

                  {/* ── Painel: Ordem de Serviço ── */}
                  <div className="os-tab-panel" style={{ display: aba === "os" ? "flex" : "none" }}>

                  {/* ── Summary card (edit mode) ── */}
                  {mode === "edit" && clienteInfo && (
                    <div className="os-summary" style={{ order: -6 }}>
                      <div className="os-summary-main">
                        <div className="os-summary-client">
                          <i className="fas fa-user" />
                          <div style={{ minWidth: 0 }}>
                            <div className="os-summary-name">{clienteInfo.nome}</div>
                            {clienteInfo.cpf && <div className="os-summary-sub"><i className="fas fa-id-card" style={{ marginRight: 6, opacity: 0.85 }} />{clienteInfo.cpf}</div>}
                          </div>
                        </div>
                        <div className="os-summary-total">
                          R$ {total.toFixed(2).replace(".", ",")}
                        </div>
                      </div>
                      <div className="os-summary-details">
                        {projeto && <span><i className="fas fa-cog" /> {projeto}</span>}
                        {tecnico1 && <span style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }} onClick={(e) => { e.stopPropagation(); window.open(`/mecanicos?tecnico=${encodeURIComponent(tecnico1)}`, '_blank') }} title="Abrir Janela Mecanico"><i className="fas fa-user-cog" /> {tecnico1}</span>}
                        <span><i className="fas fa-tag" /> {tipoServico}</span>
                      </div>
                    </div>
                  )}

                  {/* ── Resumo do PPV/peças na aba principal (as peças vivem na aba
                        "PPV / Requisições"; aqui fica o atalho pra não passarem batido) ── */}
                  {mode === "edit" && produtos.length > 0 && (
                    <button type="button" onClick={() => setAba("ppv")}
                      className="os-card" style={{ order: -5.7, borderLeft: "3px solid #dc2626", textAlign: "left", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 14, background: "var(--surface)" }}>
                      <span style={{ width: 42, height: 42, borderRadius: 11, background: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        <i className="fas fa-boxes" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 15, color: "var(--text)" }}>{produtos.length} peça(s) no PPV {ppvIds.join(", ")}</span>
                        <span style={{ display: "block", fontSize: 13, color: "var(--text-light)", marginTop: 2 }}>Total R$ {totalPecas.toFixed(2).replace(".", ",")} · clique pra ver na aba PPV / Requisições</span>
                      </span>
                      <i className="fas fa-arrow-right" style={{ color: "var(--text-light)" }} />
                    </button>
                  )}

                  {/* ── Omie: números enviados + log (edit mode) ── */}
                  {mode === "edit" && (ordemOmie || pedidoVenda || omieLog) && (
                    <div className="os-card" style={{ order: -5.5, borderLeft: "3px solid #0EA5E9" }}>
                      <div className="os-card-title"><i className="fas fa-paper-plane" style={{ color: "#0EA5E9" }} /> Enviado ao Omie</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: omieLog ? 8 : 0 }}>
                        {ordemOmie && (
                          <div>
                            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Ordem de Serviço (Omie)</div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{ordemOmie}</div>
                          </div>
                        )}
                        {ordemOmie && (
                          <button
                            onClick={abrirPdfOmie}
                            disabled={baixandoPdfOmie}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                              padding: "10px 14px", borderRadius: 8, border: "1.5px solid #0EA5E9",
                              background: "transparent", color: "#0EA5E9", fontWeight: 700, fontSize: 13.5,
                              cursor: baixandoPdfOmie ? "wait" : "pointer",
                            }}
                          >
                            {baixandoPdfOmie
                              ? <><i className="fas fa-spinner fa-spin" /> Buscando PDF no Omie...</>
                              : <><i className="fas fa-file-pdf" /> PDF da ordem (Omie)</>}
                          </button>
                        )}
                        {pedidoVenda && (
                          <div>
                            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Pedido de Venda (PPV)</div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{pedidoVenda}</div>
                          </div>
                        )}
                      </div>
                      {omieLog && (
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0, padding: 8, background: "var(--portal-bg-secondary, #f8fafc)", borderRadius: 6, fontFamily: "inherit", lineHeight: 1.5 }}>{omieLog}</pre>
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
                  <div className="os-card" style={{ order: -5 }}>
                    <div className="os-card-title"><i className="fas fa-user" /> {mode === "edit" ? "Alterar Cliente" : "Cliente"}</div>
                    <div style={S_RELATIVE}>
                      <i className="fas fa-search" style={S_SEARCH_ICON} />
                      <input type="text" placeholder="Buscar por nome, razão social ou CNPJ/CPF..." value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)} style={S_SEARCH_INPUT} />
                    </div>
                    {clienteFilter && (
                      <div className="client-search-results">
                        {filteredClientes.length === 0 ? (
                          <div style={S_EMPTY_RESULT}>Nenhum cliente encontrado</div>
                        ) : filteredClientes.map((c) => (
                          <div key={c.chave} className="client-search-item" onClick={() => { selectCliente(c.chave); setClienteFilter(""); }}>
                            <i className="fas fa-user-circle" style={S_SEARCH_ICON} />
                            <div style={S_CLIENT_ITEM_WRAP}>
                              <div style={S_CLIENT_ITEM_NAME}>{c.display.split("[")[0].trim()}</div>
                              <div style={S_CLIENT_ITEM_SUB}>{c.display.includes("[") ? c.display.substring(c.display.indexOf("[")) : ""}</div>
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

                  {/* ── Lembretes do Cliente ── */}
                  {lembretes.length > 0 && lembretes.map((l) => (
                    <div key={l.id} className="os-lembrete-alert">
                      <div className="os-lembrete-alert-header">
                        <i className="fas fa-bell" /> Lembrete
                      </div>
                      {editingLembreteId === l.id ? (
                        <div>
                          <textarea
                            rows={3}
                            value={editingLembreteText}
                            onChange={(e) => setEditingLembreteText(e.target.value)}
                            style={{ marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="os-lembrete-edit-btn" onClick={() => setEditingLembreteId(null)}>Cancelar</button>
                            <button className="os-lembrete-edit-btn" onClick={() => salvarLembreteInline(l.id, editingLembreteText)}>Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="os-lembrete-alert-text">{l.lembrete}</div>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="os-lembrete-edit-btn" onClick={() => { setEditingLembreteId(l.id); setEditingLembreteText(l.lembrete); }}>
                              <i className="fas fa-pen" style={{ marginRight: 4 }} /> Editar
                            </button>
                            {osId && (
                              <button className="os-lembrete-edit-btn" style={{ background: "#10B981", color: "#fff", borderColor: "#10B981" }} onClick={() => concluirLembrete(l.id)}>
                                <i className="fas fa-check" style={{ marginRight: 4 }} /> Concluir
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* ── Status ── */}
                  {/* Detalhes do status — só aparece quando Concluída ou Cancelada (o select ficou no cabeçalho) */}
                  {mode === "edit" && (status === "Concluída" || status === "Cancelada") && (
                    <div className="os-card" style={{ order: -4 }}>
                      <div className="os-card-title"><i className="fas fa-flag" /> {status === "Cancelada" ? "Cancelamento" : "Conclusão"}</div>
                      {status === "Concluída" && (
                        <div>
                          <label>N Ordem Omie</label>
                          <input type="text" value={ordemOmie} onChange={(e) => setOrdemOmie(e.target.value)} style={S_MB0} />
                          {ordemOmie && (
                            <button
                              onClick={abrirPdfOmie}
                              disabled={baixandoPdfOmie}
                              style={{
                                marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                padding: "11px 14px", borderRadius: 8, border: "1.5px solid #0EA5E9",
                                background: "transparent", color: "#0EA5E9", fontWeight: 700, fontSize: 13.5,
                                cursor: baixandoPdfOmie ? "wait" : "pointer",
                              }}
                            >
                              {baixandoPdfOmie
                                ? <><i className="fas fa-spinner fa-spin" /> Buscando PDF no Omie...</>
                                : <><i className="fas fa-file-pdf" /> PDF da ordem (Omie)</>}
                            </button>
                          )}
                        </div>
                      )}
                      {status === "Cancelada" && (
                        <div>
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
                    </div>
                  )}

                  {/* Estado do envio ao Omie (o botão de ação foi para a coluna à direita) */}
                  {mode === "edit" && ordemOmie && (
                    <div className="os-card" style={{ order: 20 }}>
                      <div className="os-card-title"><i className="fas fa-cloud-upload-alt" /> Enviar para o Omie</div>
                      <div className="os-omie-badge">
                        <i className="fas fa-check-circle" /> Enviado para Omie (ID: {ordemOmie})
                      </div>
                      <button
                        onClick={abrirPdfOmie}
                        disabled={baixandoPdfOmie}
                        style={{
                          marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          padding: "11px 14px", borderRadius: 8, border: "1.5px solid #0EA5E9",
                          background: "transparent", color: "#0EA5E9", fontWeight: 700, fontSize: 13.5,
                          cursor: baixandoPdfOmie ? "wait" : "pointer",
                        }}
                      >
                        {baixandoPdfOmie
                          ? <><i className="fas fa-spinner fa-spin" /> Buscando PDF no Omie...</>
                          : <><i className="fas fa-file-pdf" /> PDF da ordem (Omie)</>}
                      </button>
                    </div>
                  )}
                  {mode === "edit" && !ordemOmie && servicoInterno && status === "Concluída" && (
                    <div className="os-card" style={{ order: 20 }}>
                      <div className="os-card-title"><i className="fas fa-cloud-upload-alt" /> Concluir ordem interna</div>
                      <div className="os-omie-badge" style={{ background: '#F3E8FF', color: '#6D28D9', borderColor: '#C4B5FD' }}>
                        <i className="fas fa-check-circle" /> Ordem interna concluída (sem peças)
                      </div>
                    </div>
                  )}

                  {/* ── Garantia vinculada ── */}
                  {mode === "edit" && osId && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-shield-halved" /> Garantia</div>
                      <OSGarantiaInfo osId={osId} />
                    </div>
                  )}

                  {/* ── Unidades rastreadas (QR) retiradas pra esta OS ── */}
                  {mode === "edit" && osId && <OSUnidadesInfo osId={osId} />}


                  {/* ── Relatório Técnico ── */}
                  {mode === "edit" && relatorioTecnico && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-file-pdf" /> Relatório Técnico</div>
                      <a
                        href={relatorioTecnico}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "12px 16px", borderRadius: 10,
                          background: "#D1FAE5", border: "1.5px solid #6EE7B7",
                          color: "#065F46", fontWeight: 600, fontSize: 13,
                          textDecoration: "none", cursor: "pointer",
                        }}
                      >
                        <i className="fas fa-check-circle" style={{ color: "#059669" }} />
                        <span style={{ flex: 1 }}>Relatório enviado pelo técnico</span>
                        <i className="fas fa-external-link-alt" style={{ fontSize: 11 }} />
                      </a>
                    </div>
                  )}

                  {/* ── Carta de Correção ── */}
                  {mode === "edit" && dadosTecnico?.cartaCorrecao && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-pen-to-square" /> Carta de Correção</div>
                      <div style={{
                        background: "#FFFBEB", borderRadius: 10, padding: "14px 16px",
                        border: "1.5px solid #FDE68A", fontSize: 13, color: "#92400E",
                        lineHeight: 1.7, whiteSpace: "pre-wrap",
                      }}>
                        {dadosTecnico.cartaCorrecao}
                      </div>
                      <div style={{ fontSize: 11, color: "#D97706", marginTop: 8, fontWeight: 600 }}>
                        <i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />
                        Correção enviada pelo técnico
                      </div>
                    </div>
                  )}

                  {/* ── Dados do Técnico (fotos, diagnostico, etc) ── */}
                  {mode === "edit" && dadosTecnico && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-user-hard-hat" /> Dados do Técnico</div>

                      {/* Info resumida */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        {dadosTecnico.diagnostico && (
                          <div style={{ gridColumn: "1 / -1", background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Diagnóstico</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.diagnostico}</div>
                          </div>
                        )}
                        {dadosTecnico.servicoRealizado && (
                          <div style={{ gridColumn: "1 / -1", background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Serviço Realizado</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.servicoRealizado}</div>
                          </div>
                        )}
                        {dadosTecnico.chassis && (
                          <div style={{ background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Chassis</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.chassis}</div>
                          </div>
                        )}
                        {dadosTecnico.horimetro && (
                          <div style={{ background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Horímetro</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.horimetro}</div>
                          </div>
                        )}
                        {dadosTecnico.totalHora && (
                          <div style={{ background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Horas Técnico</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.totalHora}</div>
                          </div>
                        )}
                        {dadosTecnico.totalKm && (
                          <div style={{ background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>KM Técnico</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.totalKm} km</div>
                          </div>
                        )}
                        {dadosTecnico.nomResponsavel && (
                          <div style={{ gridColumn: "1 / -1", background: "var(--portal-bg-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--portal-text-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Responsável (cliente)</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.nomResponsavel}</div>
                          </div>
                        )}
                      </div>

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

                      {/* Assinaturas */}
                      {(dadosTecnico.assinaturas?.cliente || dadosTecnico.assinaturas?.tecnico) && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", textTransform: "uppercase", marginBottom: 6 }}>
                            Assinaturas
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {dadosTecnico.assinaturas.cliente && (
                              <div style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(dadosTecnico.assinaturas.cliente)}>
                                <img src={dadosTecnico.assinaturas.cliente} alt="Assinatura Cliente"
                                  style={{ width: "100%", height: 60, objectFit: "contain", borderRadius: 8, border: "1.5px solid var(--portal-border)", background: "var(--portal-bg-card)" }} />
                                <div style={{ fontSize: 9, color: "var(--portal-text-secondary)", textAlign: "center", marginTop: 2, fontWeight: 600 }}>Cliente</div>
                              </div>
                            )}
                            {dadosTecnico.assinaturas.tecnico && (
                              <div style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(dadosTecnico.assinaturas.tecnico)}>
                                <img src={dadosTecnico.assinaturas.tecnico} alt="Assinatura Técnico"
                                  style={{ width: "100%", height: 60, objectFit: "contain", borderRadius: 8, border: "1.5px solid var(--portal-border)", background: "var(--portal-bg-card)" }} />
                                <div style={{ fontSize: 9, color: "var(--portal-text-secondary)", textAlign: "center", marginTop: 2, fontWeight: 600 }}>Técnico</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                  <div className="os-card" style={{ order: -3 }}>
                    <div className="os-card-title"><i className="fas fa-users" /> Equipe &amp; Atendimento</div>
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
                        <input type="text" value={projeto} readOnly placeholder="Clique para pesquisar..." onClick={() => setShowProjModal(true)} style={S_POINTER_BOLD} />
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

                  {/* ── Datas do Serviço (inclui Alimentação/Almoço) ── */}
                  <div className="os-card" style={{ order: -2 }}>
                    <div className="os-card-title"><i className="fas fa-calendar-alt" /> Datas do Serviço</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--portal-text-secondary)', margin: 0 }}>Data Início Serviço</label>
                        <input type="date" value={previsaoExecucao} onChange={(e) => {
                          setPrevisaoExecucao(e.target.value)
                          if (!e.target.value || !dataFimServico) return
                          const start = new Date(e.target.value + 'T12:00:00')
                          const end = new Date(dataFimServico + 'T12:00:00')
                          if (start > end) return
                          const days: string[] = []
                          const cur = new Date(start)
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1) }
                          setDiasExecucao(days)
                        }} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--portal-text-secondary)', margin: 0 }}>Data Fim Serviço</label>
                        <input type="date" value={dataFimServico} onChange={(e) => {
                          setDataFimServico(e.target.value)
                          if (!e.target.value || !previsaoExecucao) return
                          const start = new Date(previsaoExecucao + 'T12:00:00')
                          const end = new Date(e.target.value + 'T12:00:00')
                          if (start > end) return
                          const days: string[] = []
                          const cur = new Date(start)
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1) }
                          setDiasExecucao(days)
                        }} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--portal-text-secondary)', margin: 0 }}>Hora Início Serviço</label>
                        <input type="time" value={horaInicioServico} onChange={(e) => setHoraInicioServico(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--portal-text-secondary)', margin: 0 }}>Previsão de Faturamento</label>
                        <input type="date" value={previsaoFaturamento} onChange={(e) => setPrevisaoFaturamento(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                    </div>
                    {/* Alimentação do Técnico (várias, sem limite) */}
                    <div style={{ marginTop: 10, padding: '10px 12px', background: alimentacoes.length ? '#FFFBEB' : 'var(--portal-bg-secondary)', border: `1px solid ${alimentacoes.length ? '#FCD34D' : 'var(--portal-border)'}`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1E3A5F' }}>
                          <i className="fas fa-utensils" style={{ color: '#D97706', fontSize: 12 }} />
                          Alimentação do técnico
                          {alimentacoes.length > 0 && (
                            <span style={{ fontSize: 11, color: '#92400E', fontWeight: 700 }}>· {alimentacoes.length} · R$ {alimentacoes.reduce((s, a) => s + (a.valor || 0), 0).toFixed(2)}</span>
                          )}
                        </span>
                        <button type="button" onClick={() => setAlimentacoes(prev => [...prev, { data: new Date().toISOString().slice(0, 10), valor: 0, tecnicos: [tecnico1].filter(Boolean), no_pdf: false }])}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#D97706', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          <i className="fas fa-plus" style={{ fontSize: 10 }} /> Adicionar
                        </button>
                      </div>

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
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>
                          Nenhuma alimentação. Clique em &quot;Adicionar&quot;.
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
                          <div key={i} style={{ marginTop: 8, padding: 8, background: '#fff', border: '1px solid #FCD34D', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ width: 130 }}>
                              <label style={{ fontSize: 10, color: 'var(--portal-text-secondary)', margin: 0 }}>Data</label>
                              <input type="date" value={a.data} onChange={(e) => upd({ data: e.target.value })} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                            </div>
                            <div style={{ width: 96 }}>
                              <label style={{ fontSize: 10, color: 'var(--portal-text-secondary)', margin: 0 }}>Valor (R$)</label>
                              <input type="number" min={0} step={0.01} value={a.valor || ''} onChange={(e) => upd({ valor: parseFloat(e.target.value) || 0 })} placeholder="0,00" style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: 'var(--portal-text-secondary)', margin: 0, display: 'block' }}>Técnico(s)</label>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {opts.map(opt => (
                                  <button key={opt.k} type="button" disabled={!opt.on}
                                    onClick={() => upd({ tecnicos: opt.k === 'ambos' ? [tecnico1, tecnico2].filter(Boolean) : opt.k === 'tec2' ? [tecnico2].filter(Boolean) : [tecnico1].filter(Boolean) })}
                                    style={{ padding: '6px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: opt.on ? 'pointer' : 'not-allowed',
                                      border: sel === opt.k ? '1px solid #D97706' : '1px solid #E5E7EB',
                                      background: sel === opt.k ? '#FEF3C7' : '#fff', color: sel === opt.k ? '#92400E' : '#9CA3AF', opacity: opt.on ? 1 : 0.4 }}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: a.no_pdf ? '#DC2626' : 'var(--portal-text-secondary)', paddingBottom: 6 }}>
                              <input type="checkbox" checked={a.no_pdf} onChange={(e) => upd({ no_pdf: e.target.checked })} style={{ accentColor: '#DC2626', width: 14, height: 14 }} />
                              Mostrar no PDF
                            </label>
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
                            <button type="button" onClick={() => setAlimentacoes(prev => prev.filter((_, idx) => idx !== i))} title="Remover" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }}>
                              <i className="fas fa-times" style={{ fontSize: 12 }} />
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
                    {/* Deslocamento total */}
                    {estimativa && diasExecucao.length > 0 && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)', textTransform: 'uppercase' as const, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-route" /> Deslocamento total ({diasExecucao.length} dia{diasExecucao.length > 1 ? 's' : ''})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>Ida/dia</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.ida.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.ida.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>Volta/dia</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.volta.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.volta.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>KM Total</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{(estimativa.total.distancia_total_km * diasExecucao.length).toFixed(0)} km</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.total.distancia_total_km} km/dia</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#1E3A5F', borderRadius: 6, padding: '6px 4px', color: '#fff' }}>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Tempo Fora</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{(estimativa.total.tempo_horas * diasExecucao.length).toFixed(1)}h</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{estimativa.total.tempo_horas}h/dia</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>


                  {/* ── Descrição ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-align-left" /> Descrição do Serviço</div>
                    <textarea rows={10} value={servSolicitado} onChange={(e) => setServSolicitado(e.target.value)} style={S_MONO_MB0} />
                  </div>

                  </div>{/* fim painel Ordem de Serviço (parte 1) */}

                  {/* ── Painel: Peças / PPV ── */}
                  <div className="os-tab-panel" style={{ display: aba === "ppv" ? "flex" : "none" }}>
                  {/* ── PPV & Requisições (edit) ── */}
                  {mode === "edit" && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-boxes" /> Materiais &amp; Requisições</div>
                      <label>PPV (Separe por vírgula)</label>
                      <input type="text" value={ppv} onChange={(e) => setPpv(e.target.value)} onBlur={() => loadPPV(ppv)} />

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
                        <div className="os-produtos-list">
                          {produtos.map((p, i) => (
                            <div key={i} className="os-produto-item">
                              <span>{p.descricao} <b>(x{p.qtde})</b></span>
                              <span style={S_PRODUTO_VALOR}>R$ {(p.valor * p.qtde).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Total de peças + adicionar peça direto no PPV vinculado */}
                      {ppvIds.length > 0 && (
                        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-secondary)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>
                              Total de peças {produtos.length > 0 ? `(${produtos.length})` : ""}
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--portal-text)" }}>R$ {totalPecas.toFixed(2)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {ppvIds.length > 1 && (
                              <select value={addProdTarget} onChange={(e) => setAddProdTarget(e.target.value)} style={{ flex: "1 1 120px", marginBottom: 0, fontWeight: 500 }} title="Escolha o PPV">
                                <option value="">PPV...</option>
                                {ppvIds.map((id) => <option key={id} value={id}>PPV {id}</option>)}
                              </select>
                            )}
                            <button type="button" onClick={abrirAddProduto} disabled={addingProduto || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Busca com mais usados, catálogo e kit — pergunta a quantidade"}
                              style={{ flex: "1 1 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "none", background: addingProduto || !podeEditar ? "var(--portal-text-faint)" : "#0d9488", color: "#fff", fontSize: 13, fontWeight: 600, cursor: addingProduto || !podeEditar ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                              {addingProduto ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Adicionar peça {ppvIds.length > 1 ? "" : `ao PPV ${ppvIds[0]}`}</>}
                            </button>
                            <button type="button" onClick={abrirKitOS} disabled={importandoKitOS || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : "Importar kit de revisão (inteiro ou só algumas peças)"}
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 8, border: "1.5px solid #0d9488", background: "transparent", color: "#0d9488", fontSize: 13, fontWeight: 700, cursor: importandoKitOS || !podeEditar ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                              {importandoKitOS ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-box-open" /> Kit</>}
                            </button>
                          </div>
                        </div>
                      )}

                      {requisicoes.length > 0 && (
                        <div style={S_MT12}>
                          <label>Requisições Vinculadas ({requisicoes.length})</label>
                          <div className="os-req-list">
                            {requisicoes.map((r, i) => (
                              <div key={i} className="os-req-item" style={{ flexWrap: "wrap", gap: 6 }}>
                                <span style={S_REQ_BOLD}>#{r.id}</span>
                                <span className={`os-req-badge ${r.atualizada ? "ok" : ""}`}>{r.atualizada ? "OK" : "Pendente"}</span>
                                <span style={S_REQ_MATERIAL}>{r.material}</span>
                                {r.valor > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>R$ {r.valor.toFixed(2)}</span>}
                                {r.solicitante && r.solicitante !== "N/A" && <span style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>({r.solicitante})</span>}
                                {/* Desvincular */}
                                {desvinculandoReq === r.id ? (
                                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                                    <input
                                      type="text"
                                      placeholder="Justificativa obrigatória..."
                                      value={justificativaDesvinc}
                                      onChange={(e) => setJustificativaDesvinc(e.target.value)}
                                      style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "1px solid var(--portal-border)", width: "100%" }}
                                    />
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button
                                        onClick={async () => {
                                          if (!justificativaDesvinc.trim()) { alert("Preencha a justificativa."); return; }
                                          await fetch("/api/pos/requisicoes/desvincular", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ reqId: r.id, justificativa: justificativaDesvinc.trim(), usuario: userName || "Admin" }),
                                          });
                                          setRequisicoes(prev => prev.filter(x => x.id !== r.id));
                                          setDesvinculandoReq(null);
                                          setJustificativaDesvinc("");
                                        }}
                                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer" }}
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => { setDesvinculandoReq(null); setJustificativaDesvinc(""); }}
                                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--portal-border)", background: "var(--portal-bg-card)", color: "var(--portal-text-secondary)", cursor: "pointer" }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDesvinculandoReq(r.id)}
                                    style={{ fontSize: 10, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}
                                  >
                                    Desvincular
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {totalRequisicoes > 0 && (
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginTop: 8, textAlign: "right" }}>
                              Total Requisições: R$ {totalRequisicoes.toFixed(2)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>{/* fim painel Peças / PPV */}

                  {/* ── Painel: Ordem de Serviço (parte 2) ── */}
                  <div className="os-tab-panel" style={{ display: aba === "os" ? "flex" : "none" }}>
                  {/* ── Financeiro ── */}
                  <div className="os-card os-card-financial">
                    <div className="os-card-title"><i className="fas fa-calculator" /> Financeiro</div>
                    <div className="os-financial-grid">
                      <div>
                        <label>Qtd. Horas</label>
                        <input type="number" value={qtdHoras} onChange={(e) => handleQtdHorasChange(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VH.toFixed(2)} = R$ {subtotalHoras.toFixed(2)}</div>
                      </div>
                      <div>
                        <label>Qtd. KM</label>
                        <input type="number" value={qtdKm} onChange={(e) => setQtdKm(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VK.toFixed(2)} = R$ {subtotalKm.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Estimativa de tempo (automática) */}
                    {loadingEstimativa && (
                      <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: 11 }} /> Calculando estimativa...
                      </div>
                    )}
                    {(estimativa || erroEstimativa || enderecoEstimativa) && !loadingEstimativa && (
                      <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: 12, marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)', marginBottom: 6, textTransform: 'uppercase' as const, fontWeight: 600, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fas fa-route" style={{ marginRight: 2 }} /> Estimativa de Tempo
                          {estimativa?.fonte && (
                            <span style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                              background: estimativa.fonte === 'Omie' ? '#DBEAFE' : estimativa.fonte === 'Manual' ? '#FEF3C7' : 'var(--portal-border)',
                              color: estimativa.fonte === 'Omie' ? '#1E40AF' : estimativa.fonte === 'Manual' ? '#92400E' : '#374151',
                            }}>
                              {estimativa.fonte === 'Omie' ? 'ENDEREÇO OMIE' : estimativa.fonte === 'Manual' ? 'CLIENTE MANUAL' : 'ENDEREÇO DA OS'}
                            </span>
                          )}
                        </div>
                        {/* Dropdown de endereços disponíveis */}
                        {enderecosDisponiveis.length > 1 && (
                          <div style={{ marginBottom: 6 }}>
                            <select
                              value={enderecoEstimativa}
                              onChange={(e) => {
                                setEnderecoEstimativa(e.target.value);
                                // Recalcular automaticamente ao trocar
                                setLoadingEstimativa(true); setErroEstimativa("");
                                fetch("/api/pos/estimativa", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ cnpj: clienteInfo?.cpf || "", endereco: clienteInfo?.endereco || "", cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "", qtdHoras, enderecoManual: e.target.value }),
                                }).then(r => r.json()).then(data => {
                                  if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
                                  if (data.erro) { setErroEstimativa(data.erro); setEstimativa(null); }
                                  else { setEstimativa(data); setEnderecoEstimativa(data.enderecoUsado || e.target.value); }
                                  setLoadingEstimativa(false);
                                }).catch(() => { setErroEstimativa("Erro de conexão"); setLoadingEstimativa(false); });
                              }}
                              style={{ width: '100%', fontSize: 11, padding: '5px 8px', border: '1px solid #BAE6FD', borderRadius: 6, background: 'var(--portal-bg-card)', marginBottom: 0, cursor: 'pointer' }}
                            >
                              {enderecosDisponiveis.map((e, i) => (
                                <option key={i} value={e.endereco}>
                                  [{e.label}] {e.endereco}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {/* Endereço editável */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                          <i className="fas fa-map-marker-alt" style={{ color: 'var(--portal-text-secondary)', fontSize: 11, flexShrink: 0 }} />
                          <input
                            type="text"
                            value={enderecoEstimativa}
                            onChange={(e) => setEnderecoEstimativa(e.target.value)}
                            placeholder="Endereço para cálculo..."
                            style={{ flex: 1, fontSize: 11, padding: '5px 8px', border: '1px solid #BAE6FD', borderRadius: 6, background: 'var(--portal-bg-card)', marginBottom: 0 }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!enderecoEstimativa) return;
                              setLoadingEstimativa(true); setErroEstimativa("");
                              try {
                                const res = await fetch("/api/pos/estimativa", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ cnpj: clienteInfo?.cpf || "", endereco: clienteInfo?.endereco || "", cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "", qtdHoras, enderecoManual: enderecoEstimativa }),
                                });
                                const data = await res.json();
                                if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
                                if (!res.ok || data.erro) { setErroEstimativa(data.erro || "Erro"); setEstimativa(null); }
                                else { setEstimativa(data); setEnderecoEstimativa(data.enderecoUsado || enderecoEstimativa); }
                              } catch { setErroEstimativa("Erro de conexão"); }
                              setLoadingEstimativa(false);
                            }}
                            style={{ fontSize: 10, padding: '5px 10px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            <i className="fas fa-sync-alt" style={{ marginRight: 3 }} />Recalcular
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!enderecoEstimativa) return;
                              setClienteInfo(prev => prev ? { ...prev, endereco: enderecoEstimativa } : prev);
                            }}
                            style={{ fontSize: 10, padding: '5px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            <i className="fas fa-thumbtack" style={{ marginRight: 3 }} />Fixar
                          </button>
                        </div>
                        {erroEstimativa && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8 }}>{erroEstimativa}</div>}
                        {estimativa && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>Ida</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.ida.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.ida.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>Serviço</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#F59E0B' }}>{estimativa.servico.horas}h</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.servico.tempo_min} min</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-secondary)' }}>Volta</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.volta.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{estimativa.volta.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#1E3A5F', borderRadius: 6, padding: '6px 4px', color: '#fff' }}>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Total Fora</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{estimativa.total.tempo_horas}h</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{estimativa.total.distancia_total_km} km</div>
                          </div>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Descontos (colapsável) */}
                    <div className="os-discount-section">
                      <div
                        className={`os-discount-toggle ${showDescontos ? "open" : ""}`}
                        onClick={() => setShowDescontos(!showDescontos)}
                      >
                        <i className="fas fa-chevron-right" />
                        <i className="fas fa-percentage" />
                        Aplicar Descontos
                        {totalDescontos > 0 && !showDescontos && (
                          <span style={S_DISC_BADGE}>
                            -R$ {totalDescontos.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {showDescontos && (
                        <div className="os-discount-body">
                          {/* Desconto em Horas */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-clock" style={S_MR6} />Horas
                            </span>
                            <input
                              type="number"
                              value={descHoraValor}
                              step={0.01}
                              placeholder="0,00"
                              onChange={(e) => setDescHoraValor(parseFloat(e.target.value || "0"))}
                            />
                            {descHoraValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descHoraValor.toFixed(2)} (de {subtotalHoras.toFixed(2)} p/ {(subtotalHoras - descHoraValor).toFixed(2)})
                              </span>
                            )}
                          </div>

                          {/* Desconto em KM */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-road" style={S_MR6} />KM
                            </span>
                            <input
                              type="number"
                              value={descKmValor}
                              step={0.01}
                              placeholder="0,00"
                              onChange={(e) => setDescKmValor(parseFloat(e.target.value || "0"))}
                            />
                            {descKmValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descKmValor.toFixed(2)} (de {subtotalKm.toFixed(2)} p/ {(subtotalKm - descKmValor).toFixed(2)})
                              </span>
                            )}
                          </div>

                          {/* Desconto Geral */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-tag" style={S_MR6} />Geral
                            </span>
                            <div className="os-discount-geral">
                              <input
                                type="number"
                                value={descPorc}
                                step={0.01}
                                placeholder="%"
                                onChange={(e) => syncDiscount("P", parseFloat(e.target.value || "0"))}
                              />
                              <span className="os-discount-geral-sep">ou</span>
                              <input
                                type="number"
                                value={descValor}
                                step={0.01}
                                placeholder="R$"
                                onChange={(e) => syncDiscount("V", parseFloat(e.target.value || "0"))}
                              />
                            </div>
                            {descValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descValor.toFixed(2)} ({descPorc.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="os-total-bar">
                      <div className="os-total-breakdown">
                        <span>Horas: R$ {(subtotalHoras - descHoraValor).toFixed(2)}</span>
                        <span>KM: R$ {(subtotalKm - descKmValor).toFixed(2)}</span>
                        {totalPecas > 0 && <span>Pecas: R$ {totalPecas.toFixed(2)}</span>}
                        {totalRequisicoes > 0 && <span>Req: R$ {totalRequisicoes.toFixed(2)}</span>}
                        {descValor > 0 && <span>Desc: -R$ {descValor.toFixed(2)}</span>}
                      </div>
                      <div className="os-total-value">
                        R$ {total.toFixed(2).replace(".", ",")}
                      </div>
                    </div>
                  </div>
                  </div>{/* fim painel Ordem de Serviço (parte 2) */}

                </div>
              </>
            )}
          </div>

          {/* ── Coluna de ações à direita (estilo Omie) ── */}
          <div className="os-action-rail">
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

                <button className="os-rail-btn" onClick={abrirQR}>
                  <i className="fas fa-qrcode" /> Gerar QR Code
                </button>
                {qrOpen && (
                  <>
                    <div onClick={() => setQrOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 6000 }} />
                    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 6001, background: "var(--surface)", borderRadius: 18, padding: "26px 26px 22px", width: "min(92vw, 380px)", boxShadow: "0 24px 60px rgba(0,0,0,0.3)", textAlign: "center" }}>
                      <button onClick={() => setQrOpen(false)} style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#94a3b8" }}>Ordem de Serviço</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", marginTop: 2 }}>{osId}</div>
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

                <button className="os-rail-btn" onClick={() => setShowLogs(!showLogs)}>
                  <i className="fas fa-clock-rotate-left" /> Histórico / Log
                </button>

                {/* ── PDFs oficiais do Omie: a OS e, se houver peças (PPV), o pedido ── */}
                {mode === "edit" && ordemOmie && (
                  <button className="os-rail-btn" onClick={abrirPdfOmie} disabled={baixandoPdfOmie} title="PDF oficial da Ordem de Serviço no Omie">
                    <i className={`fas ${baixandoPdfOmie ? "fa-spinner fa-spin" : "fa-file-pdf"}`} /> {baixandoPdfOmie ? "Buscando..." : `PDF OS ${(ordemOmie.replace(/^0+/, "") || ordemOmie)}`}
                  </button>
                )}
                {mode === "edit" && Object.entries(ppvOmieMap).map(([pid, numOmie]) => (
                  <button key={pid} className="os-rail-btn" onClick={() => abrirPdfPecasOmie(pid)} disabled={baixandoPdfPecas === pid} title={`PDF oficial do pedido/remessa de peças no Omie (${pid})`}>
                    <i className={`fas ${baixandoPdfPecas === pid ? "fa-spinner fa-spin" : "fa-file-pdf"}`} /> {baixandoPdfPecas === pid ? "Buscando..." : `PDF PV ${(numOmie.replace(/^0+/, "") || numOmie)}`}
                  </button>
                ))}

                {!ordemOmie && !(servicoInterno && status === "Concluída") && (
                  <button
                    className="os-rail-btn omie"
                    onClick={enviarParaOmie}
                    disabled={enviandoOmie || !podeOmie}
                    title={!podeOmie ? MSG_SEM_PERMISSAO : servicoInterno ? "OS interna: vai normal pro Omie; peças saem como remessa" : undefined}
                  >
                    {enviandoOmie
                      ? <><i className="fas fa-spinner fa-spin" /> Enviando...</>
                      : <><i className="fas fa-cloud-upload-alt" /> Enviar para Omie</>}
                  </button>
                )}
              </>
            )}

            <div className="os-rail-sep" />
            <button className="os-rail-btn" onClick={onClose}>
              <i className="fas fa-xmark" /> Fechar
            </button>
          </div>

          {mode === "edit" && <LogPanel osId={osId} visible={showLogs} refreshKey={logRefreshKey} />}
        </div>
      </div>

      <SearchModal title="Pesquisar Equipamento / Chassis" placeholder="Digite chassis, modelo ou número..." apiUrl="/api/pos/buscas/projetos" paramName="termo" visible={showProjModal} onClose={() => setShowProjModal(false)}
        onSelect={(item) => {
          const nome = item.nome || "";
          setProjeto(nome);
          const partes = nome.trim().split(/\s+/);
          const modelo = partes[0] || "";
          const chassis = partes.slice(1).join(" ") || "";
          if (!servSolicitado || servSolicitado.trim() === "" || servSolicitado === TEXT_TEMPLATE) {
            setServSolicitado(`Modelo: ${modelo}\nChassis: ${chassis}\nHorimetro: \n\nSolicitação do cliente: \nServiço Realizado: `);
          } else {
            const lines = servSolicitado.split("\n");
            if (lines[0]?.trim() === "Modelo:") lines[0] = "Modelo: " + modelo;
            if (lines[1]?.trim() === "Chassis:") lines[1] = "Chassis: " + chassis;
            setServSolicitado(lines.join("\n"));
          }
        }}
        renderItem={(item) => item.nome || ""}
      />

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
            onSelect={(codigo, descricao, preco, _empresa, qtd) => { adicionarProdutoPPV({ codigo, descricao, preco }, qtd); }}
            onAbrirKit={() => { setShowAddProdModal(false); setKitOSOpen(true); }}
          />
        </PPVMiniProvider>
        <ModalImportarKit open={kitOSOpen} onClose={() => setKitOSOpen(false)} onImportar={(produtos, _horas, rotulo) => { setKitOSOpen(false); importarKitNaOS(produtos, rotulo); }} />
      </div>
    </>
  );
}
