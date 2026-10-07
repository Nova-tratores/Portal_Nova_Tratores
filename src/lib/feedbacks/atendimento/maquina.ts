// Linha do tempo de UMA máquina (por chassi) — funções PURAS, testáveis.
// O carregador (maquina-db.ts) só junta as fontes; aqui vira uma lista
// cronológica de eventos com a referência do documento (o link é resolvido
// na tela, que sabe se o usuário tem o módulo — ver links.ts).

import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";
import { tsData, type HistOS, type HistPV } from "@/lib/feedbacks/historico-cliente";
import { extrairHorasRevisaoOS } from "@/lib/pos/extrairTrator";
import { descricaoServicoOmie, digitos, isoData, parsePpvIds, resumirTrator, semZeros, ETAPA_OS, type Maquina, type MaquinaCrm, type OSPortalBruta, type PPVBruto } from "./puro";

export type TipoEvento =
  | "entrega" | "inspecao" | "revisao" | "cheque" | "os" | "ppv" | "pv"
  | "garantia" | "requisicao" | "atendimento" | "observacao" | "visita" | "crm";

export const TIPO_EVENTO_ROTULO: Record<TipoEvento, { rotulo: string; emoji: string; cor: string }> = {
  entrega: { rotulo: "Entrega", emoji: "🚜", cor: "#0369a1" },
  inspecao: { rotulo: "Inspeção de entrega", emoji: "🔎", cor: "#0369a1" },
  revisao: { rotulo: "Revisão", emoji: "🛠️", cor: "#0891b2" },
  cheque: { rotulo: "Cheque de revisão", emoji: "🧾", cor: "#0891b2" },
  os: { rotulo: "Ordem de serviço", emoji: "🔧", cor: "#7c3aed" },
  ppv: { rotulo: "PPV", emoji: "📦", cor: "#0f766e" },
  pv: { rotulo: "Pedido de venda", emoji: "🧾", cor: "#0f766e" },
  garantia: { rotulo: "Garantia", emoji: "🛡️", cor: "#b45309" },
  requisicao: { rotulo: "Requisição", emoji: "📋", cor: "#ea580c" },
  atendimento: { rotulo: "Atendimento", emoji: "📞", cor: "#475569" },
  observacao: { rotulo: "Observação", emoji: "📝", cor: "#64748b" },
  visita: { rotulo: "Visita do vendedor", emoji: "📍", cor: "#16a34a" },
  crm: { rotulo: "Cadastro no CRM", emoji: "🗂️", cor: "#16a34a" },
};

/** Referência do documento — a tela transforma em link conforme o acesso. */
export type RefEvento =
  | { tipo: "os"; id_ordem: string | null; cod_os: number | null; empresa: string | null; ordem_omie: string | null; link_nf: string | null; nf: string | null }
  | { tipo: "ppv"; id: string }
  | { tipo: "pv"; cod_pedido: number | null; empresa: string | null; numero_pv: string | null; link_nf: string | null; nf: string | null }
  | { tipo: "garantia"; id: string }
  | { tipo: "requisicao"; id: number }
  | { tipo: "url"; href: string; rotulo: string }
  | { tipo: "nenhum" };

export interface EventoMaquina {
  id: string;
  tipo: TipoEvento;
  ts: number;
  data: string | null; // ISO
  titulo: string;
  detalhe: string | null;
  horimetro: number | null;
  status: string | null;
  valor: number | null;
  /** quem (técnico, vendedor, atendente) */
  quem: string | null;
  ref: RefEvento;
  /** ids ligados (PPV ↔ OS) — para o destaque cruzado */
  ligados: string[];
}

export interface OSTecnicoBruta { Ordem_Servico: string | null; Horimetro?: string | number | null; DataFinal?: string | null; Chassis?: string | null }
export interface ChequeEmailBruto { id: number; chassis: string | null; horas: string | null; enviado_em: string | null; registro_manual?: boolean | null; pdf_url?: string | null; cliente?: string | null }
export interface ChequeBruto { id: string; os_id: string | null; horas: number | string | null; assinado_em: string | null; assinado_nome?: string | null; created_at: string | null; atrasado?: boolean | null; token?: string | null }
export interface GarantiaBruta { id: string; numero: string | null; id_ordem: string | null; status: string | null; resultado?: string | null; created_at: string | null; finalizada_em?: string | null; tecnico_nome?: string | null; valor_pago_total?: number | null }
export interface RequisicaoBruta { id: number; titulo: string | null; tipo: string | null; status: string | null; valor_despeza: number | string | null; created_at: string | null; data?: string | null; solicitante?: string | null; fornecedor?: string | null; Chassis_Modelo?: string | null }
export interface RegistroBruto { id: number; tipo: "crm" | "rfm"; data_contato: string | null; data_servico: string | null; ultimo_servico: string | null; criado_em: string | null; feedback: string | null; acao: string | null; motivo: string | null; atendente_nome: string | null; nome: string | null; status_atendimento?: string | null }
export interface ObservacaoBruta { id: number; tipo: string | null; texto: string | null; status: string | null; criado_por_nome: string | null; created_at: string | null }
export interface VisitaBruta { id: number; data_visita: string | null; tipo: string | null; resumo: string | null; proximos_passos: string | null; vendedor_nome?: string | null }

export interface FontesLinhaDoTempo {
  chassi: string;
  trator: Trator | null;
  osPortal: OSPortalBruta[];
  tecnicos: OSTecnicoBruta[];
  osOmie: HistOS[];
  pvs: HistPV[];
  ppvs: PPVBruto[];
  chequesEmail: ChequeEmailBruto[];
  cheques: ChequeBruto[];
  garantias: GarantiaBruta[];
  requisicoes: RequisicaoBruta[];
  registros: RegistroBruto[];
  observacoes: ObservacaoBruta[];
  crm: MaquinaCrm | null;
  visitas: VisitaBruta[];
}

export interface LinhaDoTempo {
  maquina: Maquina | null;
  /** horímetro mais recente visto em qualquer fonte */
  horimetro_recente: { valor: number; data: string | null; origem: string } | null;
  eventos: EventoMaquina[];
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const horim = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => { const s = String(v ?? "").trim(); return s || null; };
const corta = (s: string | null, n = 240): string | null => (s && s.length > n ? `${s.slice(0, n)}…` : s);

export function montarLinhaDoTempo(f: FontesLinhaDoTempo): LinhaDoTempo {
  const ev: EventoMaquina[] = [];
  const push = (e: Omit<EventoMaquina, "ts"> & { ts?: number }) => {
    const ts = e.ts ?? tsData(e.data);
    ev.push({ ...e, ts });
  };

  // --- controle de revisões (tratores)
  const maquina = f.trator ? resumirTrator(f.trator) : null;
  if (f.trator) {
    const t = f.trator;
    if (isoData(t.Entrega)) {
      push({ id: "entrega", tipo: "entrega", data: isoData(t.Entrega), titulo: `Entrega do ${txt(t.Modelo) || "trator"}`, detalhe: [txt(t.Cidade), txt(t.Cliente) && `para ${txt(t.Cliente)}`].filter(Boolean).join(" · ") || null, horimetro: null, status: null, valor: null, quem: txt(t.Vendedor), ref: { tipo: "nenhum" }, ligados: [] });
    }
    if (isoData(t["Inspecao Data"])) {
      push({ id: "inspecao", tipo: "inspecao", data: isoData(t["Inspecao Data"]), titulo: "Inspeção de entrega", detalhe: null, horimetro: horim(t["Inspecao Horimetro"]), status: null, valor: null, quem: null, ref: t["Inspecao PDF"] ? { tipo: "url", href: String(t["Inspecao PDF"]), rotulo: "PDF da inspeção" } : { tipo: "nenhum" }, ligados: [] });
    }
    for (const rev of REVISOES_LISTA) {
      const d = isoData(t[`${rev} Data`]);
      if (!d) continue;
      push({ id: `rev-${rev}`, tipo: "revisao", data: d, titulo: `Revisão de ${rev} registrada`, detalhe: null, horimetro: horim(t[`${rev} Horimetro`]), status: null, valor: null, quem: null, ref: { tipo: "nenhum" }, ligados: [] });
    }
  }

  // --- cheques de revisão (enviados por e-mail / online)
  for (const c of f.chequesEmail) {
    push({ id: `chq-mail-${c.id}`, tipo: "cheque", data: isoData(c.enviado_em), titulo: `Cheque de ${semZeros(c.horas) || c.horas}h enviado à Mahindra`, detalhe: c.registro_manual ? "registro manual (sem e-mail)" : null, horimetro: null, status: "enviado", valor: null, quem: null, ref: c.pdf_url ? { tipo: "url", href: c.pdf_url, rotulo: "PDF do cheque" } : { tipo: "nenhum" }, ligados: [] });
  }
  for (const c of f.cheques) {
    const h = semZeros(c.horas) || String(c.horas ?? "");
    push({ id: `chq-${c.id}`, tipo: "cheque", data: isoData(c.assinado_em) ?? isoData(c.created_at), titulo: c.assinado_em ? `Cheque de ${h}h assinado pelo cliente` : `Cheque de ${h}h gerado (sem assinatura)`, detalhe: [c.atrasado && "cheque atrasado", c.os_id && `OS ${c.os_id}`].filter(Boolean).join(" · ") || null, horimetro: null, status: c.assinado_em ? "assinado" : "pendente", valor: null, quem: txt(c.assinado_nome), ref: c.token ? { tipo: "url", href: `/cheque/${c.token}`, rotulo: "Abrir cheque" } : { tipo: "nenhum" }, ligados: c.os_id ? [c.os_id] : [] });
  }

  // --- OS do portal (POS) + horímetro do relatório do técnico
  const horPorOs = new Map<string, number>();
  for (const t of f.tecnicos) { const h = horim(t.Horimetro); if (t.Ordem_Servico && h != null) horPorOs.set(String(t.Ordem_Servico), h); }
  const posPorChave = new Map<string, OSPortalBruta>();
  for (const o of f.osPortal) {
    const id = txt(o.Id_Ordem);
    if (!id) continue;
    for (const k of [semZeros(o.Ordem_Omie), semZeros(o.id_omie)]) if (k && !posPorChave.has(k)) posPorChave.set(k, o);
    const ppvs = parsePpvIds(o.ID_PPV);
    const horasRev = extrairHorasRevisaoOS({ Revisao: (o as { Revisao?: string | null }).Revisao, Serv_Solicitado: o.Serv_Solicitado, Tipo_Servico: o.Tipo_Servico });
    push({
      id: `os-${id}`, tipo: "os", data: isoData(o.Data_Fim_Servico) ?? isoData(o.Data),
      titulo: `${id} · ${txt(o.Tipo_Servico) || "Serviço"}${horasRev ? ` ${horasRev}h` : ""}`,
      detalhe: corta(txt(o.Serv_Realizado) || txt(o.Serv_Solicitado)),
      horimetro: horPorOs.get(id) ?? null, status: txt(o.Status), valor: num(o.Valor_Total), quem: txt(o.Os_Tecnico) || txt(o.Os_Tecnico2),
      ref: { tipo: "os", id_ordem: id, cod_os: null, empresa: null, ordem_omie: semZeros(o.Ordem_Omie) || null, link_nf: null, nf: null },
      ligados: ppvs,
    });
  }
  // --- OS da Omie que NÃO nasceram no portal
  for (const o of f.osOmie) {
    const n = semZeros(o.num_os);
    if (n && posPorChave.has(n)) { // mesma OS já listada pelo portal: só completa NF/valor
      const pos = posPorChave.get(n)!;
      const e = ev.find((x) => x.id === `os-${pos.Id_Ordem}`);
      if (e && e.ref.tipo === "os") { e.ref.cod_os = o.cod_os ?? null; e.ref.empresa = o.empresa; e.ref.link_nf = txt(o.link_nf); e.ref.nf = txt(o.num_nf); if (e.valor == null) e.valor = num(o.valor_total); }
      continue;
    }
    if (o.cod_os && posPorChave.has(String(o.cod_os))) continue;
    push({
      id: `osomie-${o.empresa}-${o.num_os}`, tipo: "os", data: isoData(o.data_faturamento) ?? isoData(o.data_inclusao),
      titulo: `OS ${o.num_os} (${o.empresa || "Omie"})`, detalhe: corta(descricaoServicoOmie(o)),
      horimetro: horim(String(o.servicos || "").match(/\bHOR(?:IMETRO)?\s*:\s*([\d.,]+)/i)?.[1]),
      status: o.etapa ? ETAPA_OS[String(o.etapa)] ?? o.status ?? null : o.status ?? null, valor: num(o.valor_total), quem: null,
      ref: { tipo: "os", id_ordem: null, cod_os: o.cod_os ?? null, empresa: o.empresa, ordem_omie: n || null, link_nf: txt(o.link_nf), nf: txt(o.num_nf) },
      ligados: digitos(o.num_pedido_cli) ? [`PV ${digitos(o.num_pedido_cli)}`] : [],
    });
  }

  // --- PPV / PV
  const pvPorNum = new Map<string, HistPV>();
  for (const p of f.pvs) { const k = semZeros(p.num_pedido); if (k) pvPorNum.set(k, p); }
  const pvsUsados = new Set<string>();
  for (const p of f.ppvs) {
    const pv = pvPorNum.get(semZeros(p.pedido_omie));
    if (pv) pvsUsados.add(semZeros(pv.num_pedido));
    push({
      id: `ppv-${p.id_pedido}`, tipo: "ppv", data: isoData(p.data),
      titulo: `${p.id_pedido}${pv ? ` → PV ${pv.num_pedido}` : ""}${txt(p.Tipo_Pedido) && txt(p.Tipo_Pedido) !== "Pedido" ? ` · ${txt(p.Tipo_Pedido)}` : ""}`,
      detalhe: [pv?.empresa, pv?.numero_nf && `NF ${pv.numero_nf}`].filter(Boolean).join(" · ") || null,
      horimetro: null, status: txt(p.status), valor: num(pv?.valor_total ?? p.valor_total), quem: txt(p.tecnico),
      ref: { tipo: "ppv", id: p.id_pedido }, ligados: [txt(p.Id_Os), pv ? `PV ${pv.num_pedido}` : null].filter((x): x is string => !!x),
    });
  }
  for (const pv of f.pvs) {
    if (pvsUsados.has(semZeros(pv.num_pedido))) continue;
    push({
      id: `pv-${pv.empresa}-${pv.num_pedido}`, tipo: "pv", data: isoData(pv.data_inclusao), titulo: `PV ${pv.num_pedido} (${pv.empresa || "Omie"})`,
      detalhe: [pv.etapa && `Etapa ${pv.etapa}`, pv.numero_nf && `NF ${pv.numero_nf}`].filter(Boolean).join(" · ") || null,
      horimetro: null, status: /^(s|sim|true|1)$/i.test(String(pv.faturado ?? "")) ? "Faturado" : pv.etapa, valor: num(pv.valor_total), quem: null,
      ref: { tipo: "pv", cod_pedido: pv.cod_pedido ?? null, empresa: pv.empresa, numero_pv: pv.num_pedido, link_nf: txt(pv.link_nf), nf: txt(pv.numero_nf) }, ligados: [`PV ${pv.num_pedido}`],
    });
  }

  // --- garantias
  for (const g of f.garantias) {
    push({ id: `gar-${g.id}`, tipo: "garantia", data: isoData(g.created_at), titulo: `${g.numero || "Garantia"}${g.id_ordem ? ` · ${g.id_ordem}` : ""}`, detalhe: [g.resultado, g.finalizada_em && `finalizada em ${isoData(g.finalizada_em)?.split("-").reverse().join("/")}`].filter(Boolean).join(" · ") || null, horimetro: null, status: txt(g.status), valor: num(g.valor_pago_total), quem: txt(g.tecnico_nome), ref: { tipo: "garantia", id: g.id }, ligados: g.id_ordem ? [g.id_ordem] : [] });
  }
  // --- requisições
  for (const r of f.requisicoes) {
    push({ id: `req-${r.id}`, tipo: "requisicao", data: isoData(r.data) ?? isoData(r.created_at), titulo: `Req. #${r.id} · ${txt(r.tipo) || "requisição"}`, detalhe: corta([txt(r.titulo), txt(r.fornecedor)].filter(Boolean).join(" · ") || null), horimetro: null, status: txt(r.status), valor: num(r.valor_despeza), quem: txt(r.solicitante), ref: { tipo: "requisicao", id: r.id }, ligados: [] });
  }
  // --- atendimentos (CRM/RFM) que citam a máquina
  for (const r of f.registros) {
    const data = r.data_contato || r.data_servico || r.ultimo_servico || (r.criado_em ? r.criado_em.slice(0, 10) : null);
    push({ id: `at-${r.id}`, tipo: "atendimento", data: isoData(data), titulo: `Atendimento ${r.tipo.toUpperCase()}`, detalhe: corta(txt(r.feedback) || txt(r.acao) || txt(r.motivo)), horimetro: null, status: txt(r.status_atendimento), valor: null, quem: txt(r.atendente_nome), ref: { tipo: "nenhum" }, ligados: [] });
  }
  // --- observações do trator (controle de revisões)
  for (const o of f.observacoes) {
    push({ id: `obs-${o.id}`, tipo: "observacao", data: isoData(o.created_at), titulo: txt(o.tipo) ? `Observação · ${txt(o.tipo)}` : "Observação", detalhe: corta(txt(o.texto)), horimetro: null, status: txt(o.status), valor: null, quem: txt(o.criado_por_nome), ref: { tipo: "nenhum" }, ligados: [] });
  }
  // --- CRM de vendas
  if (f.crm) {
    const c = f.crm;
    push({ id: `crm-${c.id}`, tipo: "crm", data: null, ts: 0, titulo: `No CRM: ${[c.marca, c.modelo].filter(Boolean).join(" ") || c.tipo || "máquina"}`, detalhe: [c.tipo, c.ano && `ano ${c.ano}`, c.estado && `estado ${c.estado}`, c.observacoes].filter(Boolean).join(" · ") || null, horimetro: c.horimetro, status: null, valor: null, quem: null, ref: { tipo: "nenhum" }, ligados: [] });
  }
  for (const v of f.visitas) {
    push({ id: `vis-${v.id}`, tipo: "visita", data: isoData(v.data_visita), titulo: `Visita ${txt(v.tipo) || ""}`.trim(), detalhe: corta([txt(v.resumo), txt(v.proximos_passos) && `próximos passos: ${txt(v.proximos_passos)}`].filter(Boolean).join(" · ") || null), horimetro: null, status: null, valor: null, quem: txt(v.vendedor_nome), ref: { tipo: "nenhum" }, ligados: [] });
  }

  // horímetro mais recente em qualquer fonte
  let hr: LinhaDoTempo["horimetro_recente"] = null;
  for (const e of ev) {
    if (e.horimetro == null) continue;
    if (!hr || e.ts > tsData(hr.data) || (e.ts === tsData(hr.data) && e.horimetro > hr.valor)) hr = { valor: e.horimetro, data: e.data, origem: TIPO_EVENTO_ROTULO[e.tipo].rotulo };
  }

  ev.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
  return { maquina, horimetro_recente: hr, eventos: ev };
}
