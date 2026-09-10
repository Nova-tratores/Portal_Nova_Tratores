// Funções PURAS do cockpit de atendimento (sem I/O, testáveis). O montador
// de contexto (contexto.ts) e a rota da fila só orquestram estas.

import { calcularPrevisao } from "@/lib/revisoes/utils";
import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";
import { tsData, type HistOS, type HistPV } from "@/lib/feedbacks/historico-cliente";
import { clienteKey, TAG_NAO_CONTATAR, type FeedbackRegistro, type Oportunidade, type PrioridadeOportunidade } from "@/lib/feedbacks/types";

export const TAG_PENDENCIA_CADASTRAL = "!!#Pendências Cadastrais#!!";

// Etapas da OS no espelho Omie (mesmo mapa do ModalHistoricoCliente).
export const ETAPA_OS: Record<string, string> = {
  "10": "Em aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada", "70": "Devolvida",
};

export function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase();
}

/** ISO (YYYY-MM-DD) a partir de ISO ou DD/MM/YYYY; null se inválida. */
export function isoData(s: string | null | undefined): string | null {
  const ts = tsData(s);
  if (!ts) return null;
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// -----------------------------------------------------------------------------
// Serviços: OS do espelho Omie + Ordem_Servico do Portal numa lista só
// -----------------------------------------------------------------------------
export interface OSPortalBruta {
  Id_Ordem?: number | string | null;
  Os_Cliente?: string | null;
  Os_Tecnico?: string | null;
  Os_Tecnico2?: string | null;
  Data?: string | null;
  Data_Fim_Servico?: string | null;
  Serv_Solicitado?: string | null;
  Serv_Realizado?: string | null;
  Status?: string | null;
  Tipo_Servico?: string | null;
  Valor_Total?: number | string | null;
  Projeto?: string | null;
  Ordem_Omie?: string | null;
}

export interface Servico {
  origem: "omie" | "portal";
  numero: string | null;
  data: string | null; // ISO
  descricao: string | null;
  tecnico: string | null;
  status: string | null;
  valor: number | null;
  empresa: string | null;
  projeto: string | null;
  ts: number;
}

/**
 * `servicos` do espelho Omie vem como JSON `[{cod,qtd,valor,desc}]` (às vezes
 * com o cabeçalho "MODELO: X|CHASSI: Y|HOR: Z|" dentro do desc). Devolve texto
 * legível: itens separados por " · ", sem o cabeçalho, sem "|" solto.
 */
export function descricaoServicoOmie(o: Pick<HistOS, "servicos" | "descricao">): string | null {
  const raw = (o.servicos || "").trim();
  const limpa = (t: string) =>
    t.replace(/\b(MODELO|CHASSI|HOR|HORIMETRO|HORÍMETRO)\s*:\s*[^|]*\|?/gi, "").replace(/\s*\|\s*/g, " · ").replace(/(\s*·\s*)+/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "").replace(/\s+/g, " ").trim();
  if (raw.startsWith("[")) {
    try {
      const itens = JSON.parse(raw) as { desc?: unknown; qtd?: unknown }[];
      const partes = itens.map((i) => limpa(String(i?.desc ?? ""))).filter(Boolean);
      if (partes.length) return partes.join(" · ");
    } catch { /* cai no texto */ }
  }
  const txt = limpa(raw || o.descricao || "");
  return txt || null;
}

export function unificarServicos(osOmie: HistOS[], osPortal: OSPortalBruta[], limite = 10): Servico[] {
  const out: Servico[] = [];
  for (const o of osOmie) {
    const ts = tsData(o.data_faturamento) || tsData(o.data_inclusao);
    out.push({
      origem: "omie",
      numero: o.num_os,
      data: isoData(o.data_faturamento) ?? isoData(o.data_inclusao),
      descricao: descricaoServicoOmie(o),
      tecnico: null,
      status: o.etapa ? ETAPA_OS[String(o.etapa)] ?? o.status ?? null : o.status ?? null,
      valor: o.valor_total == null ? null : Number(o.valor_total),
      empresa: o.empresa,
      projeto: null,
      ts,
    });
  }
  // A OS do Portal quando enviada à Omie ganha Ordem_Omie — evita listar duas vezes.
  const numerosOmie = new Set(out.map((s) => String(s.numero ?? "").trim()).filter(Boolean));
  for (const o of osPortal) {
    const omie = String(o.Ordem_Omie ?? "").trim();
    if (omie && numerosOmie.has(omie)) continue;
    const ts = Math.max(tsData(o.Data_Fim_Servico), tsData(o.Data));
    const v = o.Valor_Total == null || o.Valor_Total === "" ? null : Number(String(o.Valor_Total).replace(",", "."));
    out.push({
      origem: "portal",
      numero: o.Id_Ordem != null ? String(o.Id_Ordem) : null,
      data: isoData(o.Data_Fim_Servico) ?? isoData(o.Data),
      descricao: (o.Serv_Realizado || o.Serv_Solicitado || "").trim() || null,
      tecnico: (o.Os_Tecnico || o.Os_Tecnico2 || "").trim() || null,
      status: (o.Status || "").trim() || null,
      valor: v != null && Number.isFinite(v) ? v : null,
      empresa: null,
      projeto: (o.Projeto || "").trim() || null,
      ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, limite);
}

export interface Pedido {
  numero: string | null;
  data: string | null;
  etapa: string | null;
  valor: number | null;
  faturado: boolean;
  nf: string | null;
  empresa: string | null;
}

export function resumirPedidos(pv: HistPV[], limite = 10): Pedido[] {
  return [...pv]
    .sort((a, b) => tsData(b.data_inclusao) - tsData(a.data_inclusao))
    .slice(0, limite)
    .map((p) => ({
      numero: p.num_pedido,
      data: isoData(p.data_inclusao),
      etapa: p.etapa,
      valor: p.valor_total == null ? null : Number(p.valor_total),
      faturado: /^(s|sim|true|1)$/i.test(String(p.faturado ?? "")),
      nf: p.numero_nf,
      empresa: p.empresa,
    }));
}

// -----------------------------------------------------------------------------
// Máquinas: tratores (com previsão de revisão) ∪ equipamentos da pasta
// -----------------------------------------------------------------------------
export interface Maquina {
  fonte: "tratores" | "pasta";
  modelo: string | null;
  chassi: string | null;
  entrega: string | null; // ISO
  cidade: string | null;
  vendedor: string | null;
  ultima_revisao: { rotulo: string; data: string | null; horimetro: number | null } | null;
  proxima_revisao: { horas: number; data_estimada: string | null; atrasada: boolean; media_horas_dia: number } | null;
}

export function resumirTrator(t: Trator): Maquina {
  let ultima: Maquina["ultima_revisao"] = null;
  for (const rev of REVISOES_LISTA) {
    const data = t[`${rev} Data`];
    const h = parseFloat(String(t[`${rev} Horimetro`] ?? ""));
    if (data && !Number.isNaN(h)) ultima = { rotulo: rev, data: isoData(data), horimetro: h };
  }
  let proxima: Maquina["proxima_revisao"] = null;
  try {
    if (t.Entrega && isoData(t.Entrega)) {
      // calcularPrevisao faz `new Date(str)`: DD/MM/YYYY vira Invalid Date.
      // Passa uma cópia com todas as datas em ISO.
      const tIso: Trator = { ...t, Entrega: isoData(t.Entrega) as string };
      for (const rev of REVISOES_LISTA) {
        const d = isoData(t[`${rev} Data`]);
        if (d) tIso[`${rev} Data`] = d;
      }
      const p = calcularPrevisao(tIso);
      proxima = {
        horas: p.proximaRevHoras,
        data_estimada: Number.isNaN(p.dataEstimada.getTime()) ? null : p.dataEstimada.toISOString().slice(0, 10),
        atrasada: p.atrasada,
        media_horas_dia: p.mediaHorasDia,
      };
    }
  } catch {
    proxima = null;
  }
  return {
    fonte: "tratores",
    modelo: (t.Modelo || "").trim() || null,
    chassi: (t.Chassis || "").trim() || null,
    entrega: isoData(t.Entrega),
    cidade: (t.Cidade || "").trim() || null,
    vendedor: (t.Vendedor || "").trim() || null,
    ultima_revisao: ultima,
    proxima_revisao: proxima,
  };
}

/** Equipamentos digitados na pasta que não são um chassi já listado em `tratores`. */
export function mesclarMaquinas(tratores: Trator[], equipamentosPasta: string[]): Maquina[] {
  const out = tratores.map(resumirTrator);
  const chassis = new Set(out.map((m) => norm(m.chassi)).filter(Boolean));
  const vistos = new Set<string>();
  for (const e of equipamentosPasta) {
    const txt = String(e ?? "").trim();
    if (!txt) continue;
    const k = norm(txt);
    if (vistos.has(k)) continue;
    vistos.add(k);
    if ([...chassis].some((c) => c && k.includes(c))) continue;
    out.push({ fonte: "pasta", modelo: txt, chassi: null, entrega: null, cidade: null, vendedor: null, ultima_revisao: null, proxima_revisao: null });
  }
  // atrasadas primeiro, depois por data estimada
  return out.sort((a, b) => {
    const pa = a.proxima_revisao, pb = b.proxima_revisao;
    if (!!pa?.atrasada !== !!pb?.atrasada) return pa?.atrasada ? -1 : 1;
    return (pa?.data_estimada ?? "9999").localeCompare(pb?.data_estimada ?? "9999");
  });
}

// -----------------------------------------------------------------------------
// Atendimentos anteriores
// -----------------------------------------------------------------------------
export function dataRegistro(r: Pick<FeedbackRegistro, "data_contato" | "data_servico" | "ultimo_servico" | "criado_em">): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || (r.criado_em ? r.criado_em.slice(0, 10) : "");
}

export interface AtendimentoResumo {
  id: number;
  tipo: "crm" | "rfm";
  data: string;
  atendente: string | null;
  status_atendimento: FeedbackRegistro["status_atendimento"];
  nota: number | null;
  nps: string | null;
  status_cliente: string | null;
  resumo: string | null;
  arquivado_motivo: string | null;
  tecnico: string | null;
  trator: string | null;
}

export function resumirAtendimentos(registros: FeedbackRegistro[], limite = 10): AtendimentoResumo[] {
  return [...registros]
    .sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)))
    .slice(0, limite)
    .map((r) => ({
      id: r.id,
      tipo: r.tipo,
      data: dataRegistro(r),
      atendente: r.atendente_nome,
      status_atendimento: r.status_atendimento,
      nota: r.nota,
      nps: r.nps,
      status_cliente: r.status_cliente,
      resumo: (r.feedback || r.acao || r.motivo || "").trim() || null,
      arquivado_motivo: r.arquivado_motivo,
      tecnico: r.tecnico,
      trator: r.trator,
    }));
}

// -----------------------------------------------------------------------------
// Fila: uma linha por cliente (oportunidades abertas ∪ registros abertos)
// -----------------------------------------------------------------------------
const PESO_PRIORIDADE: Record<PrioridadeOportunidade, number> = { Urgente: 0, Normal: 1, Baixa: 2 };

export interface LinhaFila {
  cliente_key: string;
  codigo_omie: string | null;
  nome: string;
  telefone: string | null;
  prioridade: PrioridadeOportunidade;
  regras: string[];
  n_oportunidades: number;
  registros_abertos: number;
  em_atendimento_por: string | null;
  em_atendimento_id: string | null; // atendente_id da chamada aberta (p/ "sou eu?")
  ultimo_humor: number | null; // humor_cliente da última ligação encerrada (Fase 2)
  ultimo_contato: string | null; // ISO
  mais_antiga: string | null; // computado_em / aberto_em mais antigo
  caveira: boolean;
}

export interface FilaEntrada {
  oportunidades: Oportunidade[];
  registros: Pick<FeedbackRegistro, "id" | "nome" | "codigo_omie" | "telefone" | "status_atendimento" | "atendente_nome" | "aberto_em" | "data_contato" | "data_servico" | "ultimo_servico" | "criado_em" | "prioridade">[];
  tagsPorCliente: Map<string, string[]>;
  telefonePorCodigo: Map<string, string>;
  /** ligações abertas em feedback_chamada, por cliente_key */
  chamadasAbertas?: Map<string, { atendente_id: string; atendente_nome: string }>;
  /** humor_cliente da última ligação encerrada, por cliente_key */
  humorPorCliente?: Map<string, number>;
}

export function agruparFila({ oportunidades, registros, tagsPorCliente, telefonePorCodigo, chamadasAbertas, humorPorCliente }: FilaEntrada): LinhaFila[] {
  const mapa = new Map<string, LinhaFila>();
  const pega = (codigo: string | null, nome: string) => {
    const key = clienteKey(codigo, nome);
    let l = mapa.get(key);
    if (!l) {
      l = {
        cliente_key: key, codigo_omie: codigo, nome: nome.trim(), telefone: (codigo && telefonePorCodigo.get(codigo)) || null,
        prioridade: "Baixa", regras: [], n_oportunidades: 0, registros_abertos: 0,
        em_atendimento_por: chamadasAbertas?.get(key)?.atendente_nome ?? null,
        em_atendimento_id: chamadasAbertas?.get(key)?.atendente_id ?? null,
        ultimo_humor: humorPorCliente?.get(key) ?? null,
        ultimo_contato: null, mais_antiga: null, caveira: (tagsPorCliente.get(key) || []).includes(TAG_NAO_CONTATAR),
      };
      mapa.set(key, l);
    }
    return l;
  };
  const maisAntiga = (l: LinhaFila, iso: string | null) => {
    if (iso && (!l.mais_antiga || iso < l.mais_antiga)) l.mais_antiga = iso;
  };
  for (const op of oportunidades) {
    if (op.status !== "aberta") continue;
    const l = pega(op.codigo_omie, op.cliente_nome);
    l.n_oportunidades++;
    if (!l.regras.includes(op.regra)) l.regras.push(op.regra);
    if (PESO_PRIORIDADE[op.prioridade] < PESO_PRIORIDADE[l.prioridade]) l.prioridade = op.prioridade;
    maisAntiga(l, op.computado_em ? op.computado_em.slice(0, 10) : null);
  }
  for (const r of registros) {
    const l = pega(r.codigo_omie, r.nome);
    if (!l.telefone && r.telefone) l.telefone = r.telefone;
    const d = dataRegistro(r);
    if (d && (!l.ultimo_contato || d > l.ultimo_contato)) l.ultimo_contato = d;
    if (r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento") {
      l.registros_abertos++;
      // sem chamada aberta, o registro em_andamento ainda diz quem está com ele
      if (r.status_atendimento === "em_andamento" && r.atendente_nome && !l.em_atendimento_por) l.em_atendimento_por = r.atendente_nome;
      if (r.prioridade === "Urgente") l.prioridade = "Urgente";
      else if (l.n_oportunidades === 0 && l.prioridade === "Baixa") l.prioridade = "Normal";
      maisAntiga(l, r.aberto_em ? r.aberto_em.slice(0, 10) : d || null);
    }
  }
  return [...mapa.values()]
    .filter((l) => l.n_oportunidades > 0 || l.registros_abertos > 0)
    .sort((a, b) => {
      if (a.caveira !== b.caveira) return a.caveira ? 1 : -1;
      const d = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
      if (d !== 0) return d;
      return (a.mais_antiga ?? "9999").localeCompare(b.mais_antiga ?? "9999") || a.nome.localeCompare(b.nome, "pt-BR");
    });
}

export function temTag(tags: string[] | null | undefined, tag: string): boolean {
  return (tags || []).some((t) => norm(t) === norm(tag));
}

/** `tags` do espelho Omie vem em formatos variados: array, JSON string, "a, b", ou [{tag}]. */
export function tagsDoCadastro(raw: unknown): string[] {
  const deItem = (x: unknown): string => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") { const o = x as Record<string, unknown>; return String(o.tag ?? o.nome ?? o.name ?? ""); }
    return "";
  };
  if (Array.isArray(raw)) return raw.map(deItem);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) { try { const p = JSON.parse(s); if (Array.isArray(p)) return p.map(deItem); } catch { /* cai no split */ } }
    return s.split(/[,;|]/).map((t) => t.trim());
  }
  if (raw && typeof raw === "object") return Object.values(raw as Record<string, unknown>).map(deItem);
  return [];
}
