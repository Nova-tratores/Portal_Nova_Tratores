import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO, TBL_METRICAS, TBL_ITENS, TBL_REQ_SOL, TBL_REQ_ATT, TBL_PEDIDOS, FASES_CONTADOR_PARADO } from "@/lib/pos/constants";
import { getConfigPOS } from "@/lib/pos/config";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";
import { moverOSPorData } from "@/lib/pos/fase-auto-server";
import { motivoClienteInativo } from "@/lib/clientes/inativo";
import { logAndNotify } from "@/lib/server/audit-notify";
import { checarIrregularidade } from "@/lib/pos/checarIrregularidade";
import { normalizarAlimentacoes, agregadosAlimentacao } from "@/lib/pos/alimentacao-os";
import type { KanbanCard } from "@/lib/pos/types";
import { dataHoraBR } from "@/lib/datas/brasil";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";
import { protegerRotaOuInterna } from "@/lib/auth/chamada-interna";
import { paginar } from "@/lib/db/paginar";

/* ── Atualiza contadores de métricas abertas ── */
async function atualizarMetricasAbertas() {
  const { data: abertas } = await supabase
    .from(TBL_METRICAS)
    .select("id, id_ordem, data_inicio, dias")
    .is("data_fim", null);

  if (!abertas || abertas.length === 0) return;

  const ordemIds = [...new Set(abertas.map((m) => m.id_ordem))];
  const { data: ordens } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status")
    .in("Id_Ordem", ordemIds);

  const statusMap: Record<string, string> = {};
  (ordens || []).forEach((o) => { statusMap[o.Id_Ordem] = o.Status; });

  const agora = new Date();
  for (const m of abertas) {
    const statusAtual = statusMap[m.id_ordem] || "";
    const dias = Math.floor((agora.getTime() - new Date(m.data_inicio).getTime()) / 86400000);

    if (FASES_CONTADOR_PARADO.has(statusAtual)) {
      // Fecha a métrica
      await supabase.from(TBL_METRICAS).update({ data_fim: agora.toISOString(), dias }).eq("id", m.id);
    } else if (Number(m.dias) !== dias) {
      // Atualiza dias — só quando mudou (antes regravava as ~30 abertas a cada 5 min,
      // e a Planta Viva via a tabela "mudando" sempre e nunca pulava a rodada).
      await supabase.from(TBL_METRICAS).update({ dias }).eq("id", m.id);
    }
  }
}

/** abertas = tudo menos Concluída/Cancelada (o quadro do POS abre só com elas: ~8% do tamanho, 03/11/2026);
 *  fechadas = só Concluída/Cancelada (vêm quando alguém busca, abre essas fases, a Relação ou o Dashboard). */
type EscopoOrdens = "todas" | "abertas" | "fechadas";
const FECHADAS = '("Concluída","Cancelada")';

async function getOrdensParaKanban(escopo: EscopoOrdens = "todas"): Promise<KanbanCard[]> {
  // Tudo em páginas (paginar): o PostgREST corta cada resposta em 1000 linhas —
  // OS (~900 e subindo), logs_ppo (~5,7 mil) e Requisicao (~2,8 mil) já passavam/vão passar.
  const montarOrdens = () => {
    let q = supabase.from(TBL_OS).select("*").order("Id_Ordem", { ascending: false });
    if (escopo === "abertas") q = q.or(`Status.is.null,Status.not.in.${FECHADAS}`);
    else if (escopo === "fechadas") q = q.in("Status", ["Concluída", "Cancelada"]);
    return q;
  };
  const { data: ordens } = await paginar<Record<string, unknown>>((de, ate) => montarOrdens().range(de, ate));
  // nas abertas, logs/requisições/relatórios vêm só das OS da lista — antes lia as tabelas inteiras a cada minuto
  const idsAbertas = escopo === "abertas" ? ordens.map((r) => String(safeGet(r, "Id_Ordem") || "")).filter(Boolean) : null;
  const filtroIds = idsAbertas && idsAbertas.length ? idsAbertas : ["-"];
  const lerLogs = () => {
    const q = supabase.from(TBL_LOGS_PPO).select("Id_ppo,Data_Acao,Hora_Acao,acao,UsuEmail,Status_Atual").order("id", { ascending: false });
    return idsAbertas ? q.in("Id_ppo", filtroIds) : q;
  };
  const lerReqs = () => {
    const q = supabase.from("Requisicao").select("id, titulo, valor_cobrado_cliente, ordem_servico").order("id");
    return idsAbertas ? q.in("ordem_servico", filtroIds) : q.not("ordem_servico", "is", null).neq("ordem_servico", "");
  };
  const lerRelatorios = () => {
    const q = supabase.from("Ordem_Servico_Tecnicos").select("Ordem_Servico, NomResp").order("IdOs");
    return idsAbertas ? q.in("Ordem_Servico", filtroIds) : q;
  };
  const [{ data: logs }, { data: metricasAbertas }, { data: reqsNovas }, { data: relatorios }, { data: reqsSol }, { data: reqsAtt }, { data: projetosCron }] = await Promise.all([
    paginar<{ Id_ppo: string; Data_Acao: string | null; Hora_Acao: string | null; acao: string | null; UsuEmail: string | null; Status_Atual: string | null }>((de, ate) => lerLogs().range(de, ate)),
    supabase.from(TBL_METRICAS).select("id_ordem, dias").is("data_fim", null),
    paginar<{ id: number; titulo: string | null; valor_cobrado_cliente: string | number | null; ordem_servico: string | null }>((de, ate) => lerReqs().range(de, ate)),
    paginar<{ Ordem_Servico: string | null; NomResp: string | null }>((de, ate) => lerRelatorios().range(de, ate)),
    supabase.from(TBL_REQ_SOL).select("IdReq, Material_Serv_Solicitado"),
    supabase.from(TBL_REQ_ATT).select("ReqREF, ReqValor"),
    // Vínculo reverso do Cronograma: projetos que apontam para uma OS (leitura, não escreve na OS)
    supabase.schema("cronograma").from("projetos").select("id, nome, os_ref").not("os_ref", "is", null),
  ]);

  const mapaAtraso: Record<string, number> = {};
  (metricasAbertas || []).forEach((m) => {
    mapaAtraso[m.id_ordem] = Math.max(mapaAtraso[m.id_ordem] || 0, m.dias || 0);
  });

  // Mapa legado: IdReq → { titulo, valor }
  const mapaReqSol: Record<string, string> = {};
  (reqsSol || []).forEach((s) => { if (s.IdReq) mapaReqSol[String(s.IdReq)] = s.Material_Serv_Solicitado || ""; });
  const mapaReqAtt: Record<string, number> = {};
  (reqsAtt || []).forEach((a) => { if (a.ReqREF) mapaReqAtt[String(a.ReqREF)] = parseFloat(a.ReqValor || 0) || 0; });

  // Mapa: ordem_servico → requisições (novo sistema)
  const mapaReqs: Record<string, Array<{ id: string; titulo: string; valor: number }>> = {};
  (reqsNovas || []).forEach((r) => {
    const osId = String(r.ordem_servico || "");
    if (!osId) return;
    if (!mapaReqs[osId]) mapaReqs[osId] = [];
    mapaReqs[osId].push({
      id: String(r.id),
      titulo: r.titulo || "",
      valor: parseFloat(String(r.valor_cobrado_cliente || 0)) || 0,
    });
  });

  // Mapa: ordem_servico → técnico do relatório
  const mapaRelTecnico: Record<string, string> = {};
  (relatorios || []).forEach((r) => {
    const osId = String(r.Ordem_Servico || "");
    if (osId && r.NomResp) mapaRelTecnico[osId] = r.NomResp;
  });

  // Mapa reverso: Id_Ordem → projeto do Cronograma que o referencia
  const mapaProjeto: Record<string, { id: string; nome: string }> = {};
  (projetosCron || []).forEach((p) => {
    const ref = String((p as { os_ref?: string }).os_ref || "");
    if (ref) mapaProjeto[ref] = { id: String((p as { id: string }).id), nome: String((p as { nome: string }).nome) };
  });

  const mapaDatasFase: Record<string, string> = {};
  // Data da última TROCA DE FASE (log com Status_Atual) — "Na fase desde" na Relação/Dashboard.
  const mapaFaseDesde: Record<string, { status: string; data: string }[]> = {};
  const mapaUltimoLog: Record<string, { acao: string; usuario: string; data: string }> = {};
  (logs || []).forEach((l) => {
    if (l.Status_Atual) (mapaFaseDesde[l.Id_ppo] ||= []).push({ status: String(l.Status_Atual), data: l.Data_Acao || "" });
    if (!mapaDatasFase[l.Id_ppo]) {
      mapaDatasFase[l.Id_ppo] = l.Data_Acao || "";
      mapaUltimoLog[l.Id_ppo] = {
        acao: l.acao || "",
        usuario: l.UsuEmail || "",
        data: (l.Data_Acao || "") + " " + (l.Hora_Acao || ""),
      };
    }
  });

  // OS de resserviço (cópia para o app dos técnicos) não vira cartão: aparece dentro da original (José, 22/10/2026)
  return (ordens || []).filter((row) => !safeGet(row, "resservico_de")).map((row) => {
    const osId = safeGet(row, "Id_Ordem") as string;
    const ultimoLog = mapaUltimoLog[osId];
    // Juntar requisições novas + legadas
    const reqsDoCard: Array<{ id: string; titulo: string; valor: number }> = [...(mapaReqs[osId] || [])];
    const idsJaNoCard = new Set(reqsDoCard.map((r) => r.id));
    const idReqStr = String(safeGet(row, "Id_Req") || "");
    if (idReqStr) {
      idReqStr.split(",").map((s) => s.trim()).filter(Boolean).forEach((rid) => {
        if (idsJaNoCard.has(rid)) return;
        reqsDoCard.push({
          id: rid,
          titulo: mapaReqSol[rid] || "Requisição legada",
          valor: mapaReqAtt[rid] || 0,
        });
      });
    }
    return {
      id: osId,
      cliente: (safeGet(row, "Os_Cliente") as string) || "",
      tecnico: (safeGet(row, "Os_Tecnico") as string) || "",
      data: formatarDataBR(safeGet(row, "Data") as string),
      dataFase: (mapaFaseDesde[osId] || []).find((x) => x.status === String(safeGet(row, "Status") || ""))?.data || mapaDatasFase[osId] || formatarDataBR(safeGet(row, "Data") as string),
      valor: parseFloat(String(safeGet(row, "Valor_Total") || 0)).toFixed(2).replace(".", ","),
      status: (safeGet(row, "Status") as string) || "Orçamento",
      temPPV: !!safeGet(row, "ID_PPV"),
      ppvId: String(safeGet(row, "ID_PPV") || ""),
      temReq: reqsDoCard.length > 0,
      temRel: !!safeGet(row, "ID_Relatorio_Final"),
      servSolicitado: (safeGet(row, "Serv_Solicitado") as string) || "-",
      ordemOmie: (safeGet(row, "Ordem_Omie") as string) || "",
      previsaoExecucao: (safeGet(row, "Previsao_Execucao") as string) || "",
      previsaoFaturamento: (safeGet(row, "Previsao_Faturamento") as string) || "",
      diasExecucao: (safeGet(row, "Dias_Execucao") as string) || "",
      dataFimServico: (safeGet(row, "Data_Fim_Servico") as string) || "",
      diasAtraso: mapaAtraso[osId] || 0,
      ultimaAcao: ultimoLog?.acao || "",
      ultimoUsuario: ultimoLog?.usuario || "",
      ultimaData: ultimoLog?.data || "",
      reqInfo: reqsDoCard,
      relTecnico: mapaRelTecnico[osId] || "",
      pendenciaMahindra: (safeGet(row, "pendencia_mahindra") as any) || null,
      resservico: (safeGet(row, "resservico") as KanbanCard["resservico"]) || null,
      servicoInterno: !!safeGet(row, "Servico_Interno"),
      lousaPendente: !!safeGet(row, "lousa_pendente"),
      projetoCronograma: mapaProjeto[osId] || null,
      tipoServico: (safeGet(row, "Tipo_Servico") as string) || "",
      revisao: (safeGet(row, "Revisao") as string) || "",
      projeto: (safeGet(row, "Projeto") as string) || "",
      qtdHoras: parseFloat(String(safeGet(row, "Qtd_HR") || 0)) || 0,
      qtdKm: parseFloat(String(safeGet(row, "Qtd_KM") || 0)) || 0,
    };
  });
}

// Cache do auto-move — roda no máximo uma vez a cada 5 minutos
let lastAutoMove = 0;
const AUTO_MOVE_INTERVAL = 5 * 60 * 1000;

/* ── Cópia compartilhada da lista (05/11/2026) ──
 * Com 5 pessoas no POS eram ~35 consultas/min só para responder "nada mudou". Guarda a lista
 * pronta por escopo, por COPIA_MS; pedidos simultâneos esperam a mesma montagem. */
const COPIA_MS = 30_000;
type Copia = { em: number; pronto: Promise<{ corpo: string; etag: string }> };
const copias = ((globalThis as unknown as { __posOrdensCopias?: Map<EscopoOrdens, Copia> }).__posOrdensCopias ??= new Map());

function listaDoQuadro(escopo: EscopoOrdens, compartilhado: boolean): Promise<{ corpo: string; etag: string }> {
  const atual = copias.get(escopo);
  if (compartilhado && atual && Date.now() - atual.em < COPIA_MS) return atual.pronto;
  const pronto = getOrdensParaKanban(escopo).then((ordens) => {
    const corpo = JSON.stringify(ordens);
    return { corpo, etag: `"${createHash("sha1").update(corpo).digest("base64url")}"` };
  });
  const copia: Copia = { em: Date.now(), pronto };
  copias.set(escopo, copia);
  pronto.catch(() => { if (copias.get(escopo) === copia) copias.delete(escopo); });
  return pronto;
}

/** Joga fora as cópias (depois de gravar uma OS por esta rota). */
function descartarCopias() { copias.clear(); }

// GET: quadro do POS e a lista de OS dos drawers (POS e PPV: substituto/vinculo).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "ppv" }]);
  if (g.resposta) return g.resposta;
  const agora = Date.now();
  // Auto-move roda em background, não bloqueia a resposta
  if (agora - lastAutoMove > AUTO_MOVE_INTERVAL) {
    lastAutoMove = agora;
    // regra única de fase por data (lib/pos/fase-auto.ts) — a mesma do agendador diário
    moverOSPorData()
      .then(() => atualizarMetricasAbertas())
      .catch((e) => console.error("Erro auto-move:", e));
  }
  const e = req.nextUrl.searchParams.get("escopo");
  const escopo: EscopoOrdens = e === "abertas" || e === "fechadas" ? e : "todas";
  // Atualização automática do quadro (a cada 1 min e ao voltar para a aba) pede `compartilhado=1`:
  // recebe a lista montada para todo mundo nos últimos 30 s, em vez de refazer as ~7 consultas por
  // pessoa. Abrir a tela, salvar etc. pedem sem o parâmetro e sempre leem o banco (e renovam a cópia).
  const compartilhado = req.nextUrl.searchParams.get("compartilhado") === "1";
  const { corpo, etag } = await listaDoQuadro(escopo, compartilhado);
  // "nada mudou": o POS manda o ETag da última lista; igual → 304 sem corpo (o navegador não baixa nem lê de novo)
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  return new NextResponse(corpo, { headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": "no-store" } });
}

async function buscarProdutosPorPPV(idPPVInput: string) {
  const listaIds = String(idPPVInput || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (!listaIds.length) return [];
  const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", listaIds);
  const resumo: Record<string, { descricao: string; qtde: number; totalFinanceiro: number }> = {};
  (items || []).forEach((item) => {
    const cod = safeGet(item, "CodProduto") as string;
    const desc = safeGet(item, "Descricao") as string;
    const tipo = String(safeGet(item, "TipoMovimento") || "").toLowerCase();
    const preco = parseFloat(String(safeGet(item, "Preco") || 0));
    let qtd = Math.abs(parseFloat(String(safeGet(item, "Qtde") || 0)));
    if (tipo.includes("devolu")) qtd = -qtd;
    if (!resumo[cod]) resumo[cod] = { descricao: desc, qtde: 0, totalFinanceiro: 0 };
    resumo[cod].qtde += qtd;
    resumo[cod].totalFinanceiro += preco * qtd;
  });
  return Object.values(resumo)
    .map((p) => ({ descricao: p.descricao, qtde: p.qtde, valor: p.qtde !== 0 ? p.totalFinanceiro / p.qtde : 0 }))
    .filter((p) => p.qtde !== 0);
}

async function calcularTotais(dados: { qtdHoras: number; qtdKm: number; ppv: string; descontoValor: number; descontoHora?: number; descontoKm?: number }) {
  const config = await getConfigPOS();
  const produtos = await buscarProdutosPorPPV(dados.ppv);
  let vPecas = 0;
  produtos.forEach((p) => { vPecas += p.valor * p.qtde; });
  const vHoras = (dados.qtdHoras || 0) * config.valor_hora;
  const vKm = (dados.qtdKm || 0) * config.valor_km;
  let vReq = 0;
  if (dados.ppv) {
    const ids = String(dados.ppv).split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      const { data } = await supabase.from(TBL_REQ_ATT).select("ReqValor").eq("ReqREF", id);
      if (data && data.length > 0) vReq += parseFloat(String(data[0].ReqValor || 0));
    }
  }
  const subtotal = vHoras + vKm + vPecas + vReq;
  // Desconto = geral + desconto de hora + desconto de km (todos em R$)
  const desc = (dados.descontoValor || 0) + (dados.descontoHora || 0) + (dados.descontoKm || 0);
  return { total: subtotal - desc, subtotal, vHoras, vKm, vPecas, vReq, vHorasRaw: vHoras, vKmRaw: vKm, vPecasRaw: vPecas };
}

async function registrarLog(osId: string, acao: string, statusPara: string | null, statusDe: string | null = null, userName: string = "Sistema") {
  const agora = new Date();
  const dataFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(agora);
  const horaFmt = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const { data: resOs } = await supabase.from(TBL_OS).select("Data").eq("Id_Ordem", osId);
  let totalDiasAberto = 0;
  if (resOs && resOs.length > 0 && resOs[0].Data) {
    const dataCriacao = new Date(resOs[0].Data.split("T")[0].replace(/-/g, "/"));
    totalDiasAberto = Math.floor((agora.getTime() - dataCriacao.getTime()) / 86400000);
  }

  const { data: resUltimo } = await supabase.from(TBL_LOGS_PPO).select("Data_Acao").eq("Id_ppo", osId).order("id", { ascending: false }).limit(1);
  let diasNaFase = 0;
  if (resUltimo && resUltimo.length > 0) {
    const p = resUltimo[0].Data_Acao.split("/");
    const dtFase = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    diasNaFase = Math.floor((agora.getTime() - dtFase.getTime()) / 86400000);
  }

  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: osId, Data_Acao: dataFmt, Hora_Acao: horaFmt,
    UsuEmail: userName, acao,
    Status_Anterior: statusDe, Status_Atual: statusPara,
    Dias_Na_Fase: Math.max(0, diasNaFase), Total_Dias_Aberto: Math.max(0, totalDiasAberto),
  });
}

// O filtro "PPV-%" é no BANCO: "REM-..." ordena acima de "PPV-..." como texto,
// então os 50 últimos viram só remessas quando elas passarem de 50 — e a
// numeração de PPV recomeçaria do 0001, colidindo com pedido existente.
async function gerarPPVId(): Promise<string> {
  const { data } = await supabase.from(TBL_PEDIDOS).select("id_pedido").like("id_pedido", "PPV-%").order("id_pedido", { ascending: false }).limit(50);
  let maxNum = 0;
  (data || []).forEach((row) => {
    const match = String(row.id_pedido || "").match(/^PPV-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return `PPV-${String(maxNum + 1).padStart(4, "0")}`;
}

// POST: POS (OSDrawer), PPV/etiqueta da peça (FormRetirada), Orçamentos ("gerar OS")
// e o Tratorilson (assistente/executar, chamada interna).
export async function POST(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, [{ modulo: "pos" }, { modulo: "ppv" }, { modulo: "orcamentos", acao: "gerar" }]);
  if (g.resposta) return g.resposta;
  descartarCopias(); // OS nova: a próxima atualização automática já a mostra
  const dados = await req.json();
  // autoria do login; só a chamada de sistema mantém o nome que veio no corpo
  dados.userName = g.interno ? (dados.userName || "Sistema") : autorDe(g.user);

  // Cliente inativo no Omie NÃO cria OS (checa no espelho local)
  const motivoInativo = await motivoClienteInativo(dados.nomeCliente, dados.cpfCliente);
  if (motivoInativo) {
    return NextResponse.json({ error: motivoInativo }, { status: 400 });
  }

  const { data: resId } = await supabase.from(TBL_OS).select("Id_Ordem").order("Id_Ordem", { ascending: false }).limit(1);
  let ultimoNum = 0;
  if (resId && resId.length > 0) ultimoNum = parseInt(resId[0].Id_Ordem.split("-")[1], 10);
  const newId = `OS-${String(ultimoNum + 1).padStart(4, "0")}`;

  // Auto-gerar PPV se solicitado (revisão, ou peças escolhidas na abertura)
  let ppvFinal = dados.ppv || "";
  let ppvGerado = "";
  let avisoPPV = "";       // volta pro front se o PPV não pôde ser criado
  if (dados.gerarPPV) {
    const novoPPV = await gerarPPVId();

    // Criar registro na tabela pedidos para o PPV existir de fato
    const dataFormatada = dataHoraBR();

    const { error: ppvErr } = await supabase.from(TBL_PEDIDOS).insert({
      id_pedido: novoPPV,
      // OS interna: peças saem por remessa (mesma regra do criar-ppv)
      Tipo_Pedido: dados.servicoInterno ? "Remessa" : "Pedido",
      cliente: dados.nomeCliente || "",
      tecnico: dados.tecnicoResponsavel || "",
      status: "Aguardando",
      valor_total: 0,
      // Também nasce quando peças foram escolhidas já na abertura da OS
      observacao: `Gerado automaticamente pela OS ${newId} (${dados.revisao || (dados.tipoServico === "Revisão" ? "Revisão" : "peças lançadas na abertura")})`,
      Motivo_Saida_Pedido: "Saida Tecnico (Com OS)",
      email_usuario: dados.userName || "Sistema",
      Id_Os: newId,
      data: dataFormatada,
    });

    // ANTES o erro era engolido: se o PPV falhava, a OS ficava com ID_PPV
    // apontando pra um PPV inexistente ("não cria nada"). Agora só vinculamos
    // quando ele foi criado de verdade; senão, avisa e segue com a OS.
    if (ppvErr) {
      console.error("Erro ao gerar PPV:", ppvErr);
      avisoPPV = `A OS foi criada, mas não consegui gerar o PPV automático: ${ppvErr.message}`;
    } else {
      ppvGerado = novoPPV;
      ppvFinal = ppvFinal ? `${ppvFinal},${ppvGerado}` : ppvGerado;
    }
  }

  const c = await calcularTotais({ qtdHoras: parseFloat(dados.qtdHoras || 0), qtdKm: parseFloat(dados.qtdKm || 0), ppv: ppvFinal, descontoValor: parseFloat(dados.descontoValor || 0), descontoHora: parseFloat(dados.descontoHora || 0), descontoKm: parseFloat(dados.descontoKm || 0) });
  const configPost = await getConfigPOS();

  const baseInsert: Record<string, unknown> = {
    Id_Ordem: newId, Status: "Orçamento", Data: new Date().toISOString().split("T")[0],
    Os_Cliente: dados.nomeCliente, Cnpj_Cliente: dados.cpfCliente, Endereco_Cliente: dados.enderecoCliente, Cidade_Cliente: dados.cidadeCliente || '',
    Os_Tecnico: dados.tecnicoResponsavel, Os_Tecnico2: dados.tecnico2,
    Tipo_Servico: dados.tipoServico, Revisao: dados.revisao, Projeto: dados.projeto,
    Serv_Solicitado: dados.servicoSolicitado, Qtd_HR: parseFloat(dados.qtdHoras || 0),
    Valor_HR: configPost.valor_hora, Qtd_KM: parseFloat(dados.qtdKm || 0), Valor_KM: configPost.valor_km,
    Valor_Total: c.total, ID_PPV: ppvFinal, Desconto: parseFloat(dados.descontoValor || 0),
    Desconto_Hora: parseFloat(dados.descontoHora || 0),
    Desconto_KM: parseFloat(dados.descontoKm || 0),
    Previsao_Execucao: dados.previsaoExecucao || null,
    Previsao_Faturamento: dados.previsaoFaturamento || null,
    Servico_Oficina: !!dados.servicoOficina,
    Hora_Inicio_Exec: dados.horaInicioExec || '',
    Hora_Chegada: dados.horaChegada || '',
    Hora_Fim_Exec: dados.horaFimExec || '',
    Dias_Execucao: dados.diasExecucao || '',
    Data_Fim_Servico: dados.dataFimServico || null,
    Hora_Inicio_Servico: dados.horaInicioServico || '',
    Servico_Numero: dados.servicoNumero || null,
    ...(() => {
      const temArray = Array.isArray(dados.alimentacoes);
      const lista = temArray ? normalizarAlimentacoes(dados.alimentacoes) : [];
      const agg = temArray ? agregadosAlimentacao(lista)
        : { tecnico: !!dados.alimentacaoTecnico, valor: parseFloat(dados.alimentacaoValor || 0), noPdf: !!dados.alimentacaoNoPdf };
      return {
        Alimentacao_Tecnico: agg.tecnico,
        Alimentacao_Valor: agg.valor,
        Alimentacao_No_PDF: agg.noPdf,
        Alimentacoes: lista,
      };
    })(),
  };

  const { error } = await supabase.from(TBL_OS).insert(baseInsert);

  if (error) {
    console.error("Erro Supabase insert:", error);
    return NextResponse.json({ success: false, erro: `Erro ao criar OS: ${error.message}` }, { status: 500 });
  }

  // OS nova com desconto: guarda o motivo (pedido na tela) no espelho completo (José, 27/10/2026)
  if (dados.omieEspelho?.descontoMotivo?.texto) {
    const { normalizarEspelho, espelhoPadrao } = await import("@/lib/pos/omie-espelho");
    const esp = normalizarEspelho(dados.omieEspelho, espelhoPadrao({ interna: !!dados.servicoInterno, garantia: /garantia/i.test(String(dados.tipoServico || "")) }));
    const { error: eEsp } = await supabase.from(TBL_OS).update({ Omie_Espelho: esp }).eq("Id_Ordem", newId);
    if (eEsp) console.warn(`[os-espelho] ${newId}: não gravou o motivo do desconto (${eEsp.message})`);
  }

  // PPV gerado junto: já nasce com a categoria/previsão/parcelas da OS
  if (ppvGerado) {
    try {
      const { sincronizarPPVsComOS } = await import("@/lib/ppv/sync-os");
      await sincronizarPPVsComOS(newId, { soPPV: ppvGerado, usuario: dados.userName || "Sistema" });
    } catch (e) { console.warn(`[ppv-sync-os] ${newId}: ${e instanceof Error ? e.message : e}`); }
  }

  // Servico_Interno via RPC (bypassa schema cache do PostgREST)
  if (dados.servicoInterno) {
    await supabase.rpc('set_servico_interno', { p_id_ordem: newId, p_valor: true });
    // OS interna → PPVs vinculados viram Remessa automaticamente
    await supabase.from("pedidos").update({ Tipo_Pedido: "Remessa" }).eq("Id_Os", newId);
  }

  // Alimentação já lançada na criação -> abre a(s) despesa(s) na fase Pedido
  if (Array.isArray(dados.alimentacoes) && dados.alimentacoes.length > 0) {
    try {
      const { sincronizarAlimentacaoOS } = await import("@/lib/pos/alimentacao-os");
      const sync = await sincronizarAlimentacaoOS(newId);
      if (!sync.pulado) console.log(`[alimentacao-os] OS ${newId} criada com ${sync.criadas} despesa(s) em aberto`);
    } catch (e) {
      console.error(`[alimentacao-os] OS ${newId} sync falhou (ignorado):`, e instanceof Error ? e.message : e);
    }
  }

  const userNameLog = dados.userName || "Sistema";
  await registrarLog(newId, "Ordem Criada", "Orçamento", null, userNameLog);
  if (ppvGerado) {
    await registrarLog(newId, `PPV ${ppvGerado} gerado automaticamente`, "Orçamento", null, userNameLog);
  }

  await logAndNotify({
    userName: userNameLog, sistema: "pos", acao: "criar",
    entidade: "ordem_servico", entidadeId: newId, entidadeLabel: `OS ${newId} - ${dados.nomeCliente}`,
    notifTitulo: `Nova OS criada: ${newId}`,
    notifDescricao: `${userNameLog} criou OS ${newId} para ${dados.nomeCliente}`,
    notifLink: `/pos?id=${newId}`,
  });

  // Notificação no sininho + push para técnico(s) atribuído(s)
  try {
    const servico = dados.servicoSolicitado || dados.tipoServico || '';
    const cidade = dados.cidadeCliente ? ` em ${dados.cidadeCliente}` : '';
    const previsao = dados.previsaoExecucao ? ` · Previsão: ${dados.previsaoExecucao.split('-').reverse().join('/')}` : '';
    const tituloTec = `🔧 Novo serviço atribuído: OS ${newId}`;
    const descricaoTec = `Cliente: ${dados.nomeCliente}${cidade}. ${servico}${previsao}`;
    const tecnicos = [dados.tecnicoResponsavel, dados.tecnico2].filter(Boolean) as string[];
    if (tecnicos.length > 0) {
      await supabase.from('mecanico_notificacoes').insert(
        tecnicos.map(nome => ({
          tecnico_nome: nome,
          tipo: 'ordem',
          titulo: tituloTec,
          descricao: descricaoTec,
          link: `/os/${newId}`,
          lida: false,
        }))
      );
      const { pushParaTecnico } = await import('@/lib/push-mecanicos');
      for (const nome of tecnicos) {
        await pushParaTecnico(nome, { titulo: tituloTec, descricao: descricaoTec, link: `/os/${newId}` });
      }
    }
  } catch { /* best-effort */ }

  // Checagem de pendência Mahindra (inspeção/revisões anteriores)
  try {
    const pendencia = await checarIrregularidade({
      Projeto: dados.projeto,
      Serv_Solicitado: dados.servicoSolicitado,
      Tipo_Servico: dados.tipoServico,
      Revisao: dados.revisao,
    });
    if (pendencia) {
      await supabase.from(TBL_OS).update({ pendencia_mahindra: pendencia }).eq("Id_Ordem", newId);
      await logAndNotify({
        userName: userNameLog, sistema: "pos", acao: "pendencia_detectada",
        entidade: "ordem_servico", entidadeId: newId, entidadeLabel: `OS ${newId}`,
        notifTitulo: `⚠️ OS irregular: ${newId}`,
        notifDescricao: `${newId} — ${pendencia.detalhes.join('; ')}`,
        notifLink: `/pos?id=${newId}`,
      });
    }
  } catch (e) {
    console.error('Erro ao checar irregularidade Mahindra:', e);
  }

  // Criar entradas na agenda_tecnico para dias de execução
  if (dados.tecnicoResponsavel) {
    const entries: string[] = dados.diasExecucao
      ? (dados.diasExecucao as string).split(',').filter(Boolean)
      : dados.previsaoExecucao ? [dados.previsaoExecucao] : [];
    if (entries.length > 0) {
      await supabase.from('agenda_tecnico').insert(
        entries.map((entry: string) => {
          const [dia, horas] = entry.split(' ')
          const [hInicio, hFim] = (horas || '').split('-')
          return {
            tecnico_nome: dados.tecnicoResponsavel,
            id_ordem: newId,
            data_agendada: dia,
            turno: 'integral',
            cliente: dados.nomeCliente || null,
            endereco: dados.enderecoCliente || null,
            status: 'agendado',
            hora_inicio: hInicio || dados.horaInicioExec || '08:00',
            hora_fim: hFim || dados.horaFimExec || '',
          }
        })
      );
    }
  }

  const ordens = await getOrdensParaKanban();
  return NextResponse.json({ success: true, ordensAtualizadas: ordens, novaOsId: newId, ppvGerado, avisoPPV });
}
