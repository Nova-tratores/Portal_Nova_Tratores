// Funções PURAS do cockpit de atendimento (sem I/O, testáveis). O montador
// de contexto (contexto.ts) e a rota da fila só orquestram estas.

import { calcularPrevisao } from "@/lib/revisoes/utils";
import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";
import { tsData, type HistOS, type HistPV } from "@/lib/feedbacks/historico-cliente";
import { clienteKey, TAG_NAO_CONTATAR, type FeedbackRegistro, type Oportunidade, type PrioridadeOportunidade } from "@/lib/feedbacks/types";
import { extrairChassis } from "@/lib/pos/extrairTrator";

export const TAG_PENDENCIA_CADASTRAL = "!!#Pendências Cadastrais#!!";

// Etapas da OS no espelho Omie (mesmo mapa do ModalHistoricoCliente).
export const ETAPA_OS: Record<string, string> = {
  "10": "Em aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada", "70": "Devolvida",
};

export function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase();
}

/** Número sem zeros à esquerda ("000000000005270" → "5270"); vazio se não houver dígitos. */
export function semZeros(s: unknown): string {
  const d = String(s ?? "").trim();
  if (!d) return "";
  const t = d.replace(/^0+/, "");
  return t || (/^0+$/.test(d) ? "0" : "");
}

/** Só os dígitos de um texto ("REM 3469" → "3469", "CASTRO 4090" → "4090"). */
export function digitos(s: unknown): string {
  return (String(s ?? "").match(/\d+/g) || []).join("");
}

/** "PPV-0201, PPV-0202" → ["PPV-0201","PPV-0202"] (maiúsculas, sem repetir). */
export function parsePpvIds(s: unknown): string[] {
  const out: string[] = [];
  for (const m of String(s ?? "").toUpperCase().matchAll(/PPV-?\s*(\d+)/g)) {
    const id = `PPV-${m[1]}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** "6075E CAB MDI07513PS0006206" → { modelo: "6075E CAB", chassi: "MDI07513PS0006206" } (nome de projeto Omie). */
export function separarModeloChassi(nome: string | null | undefined): { modelo: string; chassi: string | null } {
  const tokens = String(nome || "").trim().split(/\s+/).filter(Boolean);
  const ultimo = tokens[tokens.length - 1] || "";
  if (tokens.length > 1 && /^[A-Z0-9-]{8,}$/i.test(ultimo) && /\d/.test(ultimo)) {
    return { modelo: tokens.slice(0, -1).join(" "), chassi: ultimo.toUpperCase() };
  }
  return { modelo: String(nome || "").trim(), chassi: null };
}

/** Chassi do cabeçalho "MODELO: X|CHASSI: Y|HOR: Z" do JSON `servicos` da OS Omie. */
export function chassiDoServicoOmie(servicos: string | null | undefined): string | null {
  const m = String(servicos || "").match(/CHASSIS?\s*:\s*([A-Z0-9-]{6,})/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Chassi plausível: tem pelo menos um dígito e 6+ caracteres. `extrairChassis`
 * pega "Chassis: HORIMETRO" (texto livre da OS) como se fosse chassi — não é.
 */
export function chassiPlausivel(c: string | null | undefined): string | null {
  const s = norm(c);
  if (s.length < 6 || !/\d/.test(s) || !/^[A-Z0-9-]+$/.test(s)) return null;
  return s;
}

/** Dois chassis são a mesma máquina: iguais, ou um termina com os 7 últimos do outro. */
export function mesmoChassi(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  if (A.length < 7 || B.length < 7) return false;
  return A.endsWith(B.slice(-7)) || B.endsWith(A.slice(-7));
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
  ID_PPV?: string | null;
  Cnpj_Cliente?: string | null;
  id_omie?: number | string | null;
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
  /** Id_Ordem da POS do portal ("OS-0817") — é o que abre /pos?id= */
  id_ordem: string | null;
  /** nº da OS na Omie, sem zeros à esquerda */
  ordem_omie: string | null;
  /** código interno Omie (reconstrução em /api/clientes/print) */
  cod_os: number | null;
  link_nf: string | null;
  /** PPVs ligados a esta OS (Ordem_Servico.ID_PPV, lista separada por vírgula) */
  ppv_ids: string[];
  /** PV citado na OS Omie (num_pedido_cli, só dígitos) */
  pv_numero: string | null;
  chassi: string | null;
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

/** Chaves pelas quais uma OS do portal pode ser reconhecida na Omie: nº (sem zeros) e id_omie. */
function chavesOmieDaPos(o: OSPortalBruta): string[] {
  return [semZeros(o.Ordem_Omie), semZeros(o.id_omie)].filter(Boolean);
}

function servicoDaPos(o: OSPortalBruta): Servico {
  const ts = Math.max(tsData(o.Data_Fim_Servico), tsData(o.Data));
  const v = o.Valor_Total == null || o.Valor_Total === "" ? null : Number(String(o.Valor_Total).replace(",", "."));
  return {
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
    id_ordem: o.Id_Ordem != null ? String(o.Id_Ordem) : null,
    ordem_omie: semZeros(o.Ordem_Omie) || null,
    cod_os: null,
    link_nf: null,
    ppv_ids: parsePpvIds(o.ID_PPV),
    pv_numero: null,
    chassi: chassiPlausivel(extrairChassis({ Projeto: o.Projeto, Serv_Solicitado: o.Serv_Solicitado })),
  };
}

/**
 * OS do espelho Omie ∪ POS do portal numa lista só. A POS que já foi para a
 * Omie (Ordem_Omie / id_omie = num_os ou cod_os) NÃO aparece duas vezes: o item
 * da Omie herda dela o Id_Ordem (é o que abre /pos?id=), o técnico, o projeto e
 * os PPVs ligados. (`Ordem_Omie` vem ora zero-padded, ora com o cod_os — por
 * isso as duas chaves.)
 */
export function unificarServicos(osOmie: HistOS[], osPortal: OSPortalBruta[], limite = 10): Servico[] {
  const posPorChave = new Map<string, OSPortalBruta>();
  for (const o of osPortal) for (const k of chavesOmieDaPos(o)) if (!posPorChave.has(k)) posPorChave.set(k, o);
  const posUsadas = new Set<OSPortalBruta>();

  const out: Servico[] = [];
  for (const o of osOmie) {
    const ts = tsData(o.data_faturamento) || tsData(o.data_inclusao);
    const pos = posPorChave.get(semZeros(o.num_os)) ?? posPorChave.get(semZeros(o.cod_os));
    if (pos) posUsadas.add(pos);
    const projOmie = (o.projeto || "").trim() || null;
    out.push({
      origem: "omie",
      numero: o.num_os,
      data: isoData(o.data_faturamento) ?? isoData(o.data_inclusao),
      descricao: descricaoServicoOmie(o),
      tecnico: pos ? (pos.Os_Tecnico || pos.Os_Tecnico2 || "").trim() || null : null,
      status: o.etapa ? ETAPA_OS[String(o.etapa)] ?? o.status ?? null : o.status ?? null,
      valor: o.valor_total == null ? null : Number(o.valor_total),
      empresa: o.empresa,
      projeto: (pos?.Projeto || "").trim() || projOmie,
      ts,
      id_ordem: pos?.Id_Ordem != null ? String(pos.Id_Ordem) : null,
      ordem_omie: semZeros(o.num_os) || null,
      cod_os: o.cod_os == null ? null : Number(o.cod_os),
      link_nf: (o.link_nf || "").trim() || null,
      ppv_ids: pos ? parsePpvIds(pos.ID_PPV) : [],
      pv_numero: digitos(o.num_pedido_cli) || null,
      chassi: (pos ? chassiPlausivel(extrairChassis({ Projeto: pos.Projeto, Serv_Solicitado: pos.Serv_Solicitado })) : null)
        ?? separarModeloChassi(projOmie).chassi ?? chassiPlausivel(chassiDoServicoOmie(o.servicos)),
    });
  }
  for (const o of osPortal) {
    if (posUsadas.has(o)) continue;
    out.push(servicoDaPos(o));
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
// Compras: PV do espelho Omie ∪ PPV (pré-pedido) do portal numa lista só
// -----------------------------------------------------------------------------
/** Linha crua de `pedidos` (PPV) — só o que o cockpit usa. */
export interface PPVBruto {
  id_pedido: string;
  data?: string | null; // "DD/MM/YYYY HH:mm"
  cliente?: string | null;
  status?: string | null;
  valor_total?: number | string | null;
  pedido_omie?: string | null; // nº do PV na Omie, zero-padded (15)
  Id_Os?: string | null; // POS que originou ("OS-0817")
  Projeto?: string | null;
  tecnico?: string | null;
  Tipo_Pedido?: string | null;
  nf_numero?: string | null;
  faturado_omie_em?: string | null;
  omie_empresa?: string | null;
}

export interface Compra {
  /** 'ambos' = PPV do portal que virou PV na Omie (um item, dois números) */
  origem: "pv" | "ppv" | "ambos";
  numero_pv: string | null;
  id_ppv: string | null;
  data: string | null; // ISO
  /** etapa do PV ("Faturado") ou status do PPV no kanban */
  status: string | null;
  valor: number | null;
  faturado: boolean;
  nf: string | null;
  empresa: string | null;
  /** POS ligada ao PPV (pedidos.Id_Os) */
  os_id: string | null;
  link_nf: string | null;
  cod_pedido: number | null;
  projeto: string | null;
  tecnico: string | null;
  tipo: string | null;
  ts: number;
}

function numValor(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function unificarCompras(pvs: HistPV[], ppvs: PPVBruto[], limite = 12): Compra[] {
  // PPV por nº do PV (sem zeros). A Castro tem PV com o MESMO número da Nova:
  // quando o PPV diz a empresa (omie_empresa), ela desempata.
  const ppvPorPv = new Map<string, PPVBruto[]>();
  for (const p of ppvs) {
    const k = semZeros(p.pedido_omie);
    if (!k) continue;
    ppvPorPv.set(k, [...(ppvPorPv.get(k) || []), p]);
  }
  const usados = new Set<PPVBruto>();
  const out: Compra[] = [];
  for (const pv of pvs) {
    const candidatos = ppvPorPv.get(semZeros(pv.num_pedido)) || [];
    const ppv = candidatos.find((c) => !usados.has(c) && c.omie_empresa && norm(c.omie_empresa) === norm(pv.empresa))
      ?? candidatos.find((c) => !usados.has(c) && !c.omie_empresa)
      ?? null;
    if (ppv) usados.add(ppv);
    out.push({
      origem: ppv ? "ambos" : "pv",
      numero_pv: pv.num_pedido,
      id_ppv: ppv?.id_pedido ?? null,
      data: isoData(pv.data_inclusao),
      status: pv.etapa,
      valor: numValor(pv.valor_total),
      faturado: /^(s|sim|true|1)$/i.test(String(pv.faturado ?? "")),
      nf: (pv.numero_nf || "").trim() || null,
      empresa: pv.empresa,
      os_id: (ppv?.Id_Os || "").trim() || null,
      link_nf: (pv.link_nf || "").trim() || null,
      cod_pedido: pv.cod_pedido == null ? null : Number(pv.cod_pedido),
      projeto: (ppv?.Projeto || "").trim() || null,
      tecnico: (ppv?.tecnico || "").trim() || null,
      tipo: (ppv?.Tipo_Pedido || "").trim() || null,
      ts: tsData(pv.data_inclusao),
    });
  }
  for (const p of ppvs) {
    if (usados.has(p)) continue;
    out.push({
      origem: "ppv",
      numero_pv: semZeros(p.pedido_omie) || null,
      id_ppv: p.id_pedido,
      data: isoData(p.data),
      status: (p.status || "").trim() || null,
      valor: numValor(p.valor_total),
      faturado: !!p.faturado_omie_em,
      nf: (p.nf_numero || "").trim() || null,
      empresa: (p.omie_empresa || "").trim() || null,
      os_id: (p.Id_Os || "").trim() || null,
      link_nf: null,
      cod_pedido: null,
      projeto: (p.Projeto || "").trim() || null,
      tecnico: (p.tecnico || "").trim() || null,
      tipo: (p.Tipo_Pedido || "").trim() || null,
      ts: tsData(p.data),
    });
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, limite);
}

/**
 * Vínculos PPV ↔ POS vistos dos dois lados (a OS diz ID_PPV, o PPV diz Id_Os —
 * um dos lados pode estar vazio). Usado pelo destaque cruzado dos cards.
 */
export function ligacoesPpvOs(servicos: Servico[], compras: Compra[]): { ppvsPorOs: Record<string, string[]>; osPorPpv: Record<string, string> } {
  const ppvsPorOs: Record<string, string[]> = {};
  const osPorPpv: Record<string, string> = {};
  const liga = (os: string | null, ppv: string | null) => {
    if (!os || !ppv) return;
    const O = os.trim().toUpperCase(), P = ppv.trim().toUpperCase();
    if (!ppvsPorOs[O]) ppvsPorOs[O] = [];
    if (!ppvsPorOs[O].includes(P)) ppvsPorOs[O].push(P);
    if (!osPorPpv[P]) osPorPpv[P] = O;
  };
  for (const s of servicos) for (const p of s.ppv_ids) liga(s.id_ordem, p);
  for (const c of compras) liga(c.os_id, c.id_ppv);
  return { ppvsPorOs, osPorPpv };
}

// -----------------------------------------------------------------------------
// Máquinas: tratores (com previsão de revisão) ∪ equipamentos da pasta
// -----------------------------------------------------------------------------
export type FonteMaquina = "tratores" | "projeto" | "os" | "crm" | "pasta";

/** Máquina cadastrada no CRM de vendas (tabela `maquinas`, por propriedade). */
export interface MaquinaCrm {
  id: number;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  numero_serie: string | null;
  horimetro: number | null;
  estado: string | null;
  observacoes: string | null;
}

/** Projeto Omie = máquina ("6075E CAB MDI07513PS0006206") faturada/atendida para o cliente. */
export interface ProjetoMaquina { nome: string; empresa: string }

/** Chassi citado numa OS/PPV (Projeto, Serv_Solicitado, cabeçalho do serviço Omie). */
export interface ChassiCitado { chassi: string; modelo: string | null }

export interface Maquina {
  /** fonte principal (compatibilidade) — a primeira de `fontes` */
  fonte: FonteMaquina;
  /** todas as fontes em que a máquina apareceu */
  fontes: FonteMaquina[];
  modelo: string | null;
  chassi: string | null;
  entrega: string | null; // ISO
  cidade: string | null;
  vendedor: string | null;
  ultima_revisao: { rotulo: string; data: string | null; horimetro: number | null } | null;
  proxima_revisao: { horas: number; data_estimada: string | null; atrasada: boolean; media_horas_dia: number } | null;
  /** tratores.ID (controle de revisões) */
  id_trator: string | null;
  /** projeto Omie correspondente (abre a ficha completa em /clientes/projeto) */
  projeto: ProjetoMaquina | null;
  /** nome que consta em `tratores`, quando difere do cliente da ficha (vendido em nome de outro) */
  dono_tratores: string | null;
  crm: MaquinaCrm | null;
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
    fontes: ["tratores"],
    modelo: (t.Modelo || "").trim() || null,
    chassi: (t.Chassis || "").trim().toUpperCase() || null,
    entrega: isoData(t.Entrega),
    cidade: (t.Cidade || "").trim() || null,
    vendedor: (t.Vendedor || "").trim() || null,
    ultima_revisao: ultima,
    proxima_revisao: proxima,
    id_trator: t.ID != null && String(t.ID).trim() ? String(t.ID).trim() : null,
    projeto: null,
    dono_tratores: null,
    crm: null,
  };
}

function maquinaVazia(fonte: FonteMaquina, modelo: string | null, chassi: string | null): Maquina {
  return { fonte, fontes: [fonte], modelo, chassi, entrega: null, cidade: null, vendedor: null, ultima_revisao: null, proxima_revisao: null, id_trator: null, projeto: null, dono_tratores: null, crm: null };
}

/**
 * Nome do modelo quando a mesma máquina vem de duas fontes. Entre as fontes
 * fortes (tratores/projeto Omie) fica o mais descritivo ("6075E CAB" > "6075E");
 * OS/CRM/pasta só preenchem quando não há nada ou quando o que há é lixo de
 * origem ("2025.0").
 */
function melhorModelo(a: string | null, b: string | null, fonteB: FonteMaquina): string | null {
  const lixo = (s: string | null) => !s || /^\d+(\.\d+)?$/.test(s.trim());
  if (lixo(a)) return lixo(b) ? a || b : b;
  if (lixo(b)) return a;
  if (fonteB !== "tratores" && fonteB !== "projeto") return a;
  return (b as string).length > (a as string).length ? b : a;
}

function ordenarMaquinas(out: Maquina[]): Maquina[] {
  // atrasadas primeiro, depois por data estimada; sem previsão por último
  return out.sort((a, b) => {
    const pa = a.proxima_revisao, pb = b.proxima_revisao;
    if (!!pa?.atrasada !== !!pb?.atrasada) return pa?.atrasada ? -1 : 1;
    return (pa?.data_estimada ?? "9999").localeCompare(pb?.data_estimada ?? "9999");
  });
}

/** Equipamentos digitados na pasta que não são um chassi já listado em `tratores`. */
export function mesclarMaquinas(tratores: Trator[], equipamentosPasta: string[]): Maquina[] {
  return mesclarMaquinasFontes({ tratores, pasta: equipamentosPasta });
}

export interface FontesMaquinas {
  tratores?: Trator[];
  projetos?: ProjetoMaquina[];
  citados?: ChassiCitado[];
  crm?: MaquinaCrm[];
  pasta?: string[];
  /** nome do cliente da ficha — para avisar quando `tratores` traz outro dono */
  nomeCliente?: string | null;
}

/**
 * Todas as fontes numa lista só, deduplicada por chassi (igual ou mesmo final-7).
 * Ordem de entrada = ordem de confiança: tratores (tem entrega e revisões) →
 * projeto Omie → chassi citado em OS/PPV → CRM → pasta (texto livre, sem chassi).
 */
export function mesclarMaquinasFontes(f: FontesMaquinas): Maquina[] {
  const out: Maquina[] = [];
  const NOME = norm(f.nomeCliente);
  const achar = (chassi: string | null) => (chassi ? out.find((m) => mesmoChassi(m.chassi, chassi)) : undefined);
  const junta = (m: Maquina) => {
    const ex = achar(m.chassi);
    if (!ex) { out.push(m); return; }
    for (const fo of m.fontes) if (!ex.fontes.includes(fo)) ex.fontes.push(fo);
    ex.modelo = melhorModelo(ex.modelo, m.modelo, m.fonte);
    if ((ex.chassi?.length ?? 0) < (m.chassi?.length ?? 0)) ex.chassi = m.chassi;
    ex.entrega ??= m.entrega; ex.cidade ??= m.cidade; ex.vendedor ??= m.vendedor;
    ex.ultima_revisao ??= m.ultima_revisao; ex.proxima_revisao ??= m.proxima_revisao;
    ex.id_trator ??= m.id_trator; ex.projeto ??= m.projeto; ex.dono_tratores ??= m.dono_tratores; ex.crm ??= m.crm;
  };

  for (const t of f.tratores || []) {
    const m = resumirTrator(t);
    const dono = (t.Cliente || "").trim();
    if (dono && NOME && norm(dono) !== NOME) m.dono_tratores = dono;
    junta(m);
  }
  for (const p of f.projetos || []) {
    const { modelo, chassi } = separarModeloChassi(p.nome);
    const m = maquinaVazia("projeto", modelo || null, chassi);
    m.projeto = { nome: p.nome, empresa: p.empresa };
    junta(m);
  }
  for (const c of f.citados || []) {
    const ch = chassiPlausivel(c.chassi);
    if (!ch) continue;
    junta(maquinaVazia("os", (c.modelo || "").trim() || null, ch));
  }
  for (const c of f.crm || []) {
    const modelo = [c.marca, c.modelo].filter(Boolean).join(" ").trim() || c.tipo || null;
    const m = maquinaVazia("crm", modelo, (c.numero_serie || "").trim().toUpperCase() || null);
    m.crm = c;
    junta(m);
  }
  const vistos = new Set<string>();
  for (const e of f.pasta || []) {
    const txt = String(e ?? "").trim();
    if (!txt) continue;
    const k = norm(txt);
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (out.some((m) => m.chassi && (k.includes(m.chassi) || (m.chassi.length >= 7 && k.includes(m.chassi.slice(-7)))))) continue;
    out.push(maquinaVazia("pasta", txt, null));
  }
  return ordenarMaquinas(out);
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
  email: string | null;
  cidade: string | null;
  tags: string[];
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
  registros: Pick<FeedbackRegistro, "id" | "nome" | "codigo_omie" | "telefone" | "email" | "status_atendimento" | "atendente_nome" | "aberto_em" | "data_contato" | "data_servico" | "ultimo_servico" | "criado_em" | "prioridade">[];
  tagsPorCliente: Map<string, string[]>;
  telefonePorCodigo: Map<string, string>;
  /** ligações abertas em feedback_chamada, por cliente_key */
  chamadasAbertas?: Map<string, { atendente_id: string; atendente_nome: string }>;
  /** humor_cliente da última ligação encerrada, por cliente_key */
  humorPorCliente?: Map<string, number>;
  /** cadastro Omie por código: e-mail e cidade (telefone continua em telefonePorCodigo) */
  cadastroPorCodigo?: Map<string, { email: string | null; cidade: string | null }>;
}

export function agruparFila({ oportunidades, registros, tagsPorCliente, telefonePorCodigo, chamadasAbertas, humorPorCliente, cadastroPorCodigo }: FilaEntrada): LinhaFila[] {
  const mapa = new Map<string, LinhaFila>();
  const pega = (codigo: string | null, nome: string) => {
    const key = clienteKey(codigo, nome);
    let l = mapa.get(key);
    if (!l) {
      l = {
        cliente_key: key, codigo_omie: codigo, nome: nome.trim(), telefone: (codigo && telefonePorCodigo.get(codigo)) || null,
        email: (codigo && cadastroPorCodigo?.get(codigo)?.email) || null,
        cidade: (codigo && cadastroPorCodigo?.get(codigo)?.cidade) || null,
        tags: tagsPorCliente.get(key) || [],
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
    if (!l.email && r.email) l.email = r.email;
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
