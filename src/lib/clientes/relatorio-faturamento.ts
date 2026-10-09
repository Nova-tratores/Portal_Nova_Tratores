// Relatório SEMANAL de faturamento (OS + pedidos de peças) por técnico — regras
// PURAS (sem banco), testadas em relatorio-faturamento.test.ts.
//
// Decisões do José (09/10/2026):
//  - semana = de SEGUNDA até o dia do envio (padrão sexta 17h);
//  - km: do RELATÓRIO do técnico e o COBRADO na OS, lado a lado; OS sem
//    relatório no aplicativo usa o km do Omie (cobrado) como km rodado;
//  - pedido sem técnico (balcão) entra numa linha "Balcão".
//  - pedido = só itens da família "Peças" (máquina vendida não é pedido de peças:
//    em 09/2026 foram R$ 2,1 mi em máquinas × R$ 261 mil em peças).

export const TECNICO_BALCAO = "Balcão / sem técnico";
/** Código do serviço "KM Deslocamento" no Omie (Nova) — ver lib/pos/omie.ts */
export const OMIE_NCODSERV_KM = 1975974257;

export type OSFaturada = {
  empresa: string; num_os: string; cod_os: number; data_faturamento: string; cliente: string
  valor: number; tecnico: string; tecnico2: string | null
  /** km rodado: do relatório do técnico; sem relatório no app, o cobrado no Omie */
  km_relatorio: number | null; km_cobrado: number | null
  km_origem: "relatorio" | "omie" | null
  tem_relatorio: boolean; pos_id: string | null
}
export type PVFaturado = {
  empresa: string; num_pedido: string; data_faturamento: string; cliente: string
  valor_pecas: number; itens: number; tecnico: string; origem_tecnico: "ppv" | "os" | "balcao"
  num_os: string | null
}
export type LinhaTecnico = {
  tecnico: string; os: number; valor_servico: number; km_relatorio: number; km_cobrado: number
  pv: number; valor_pecas: number; total: number
}
export type RelatorioFaturamento = {
  inicio: string; fim: string
  totais: { os: number; valor_servico: number; pv: number; valor_pecas: number; total: number; km_relatorio: number; km_cobrado: number }
  por_tecnico: LinhaTecnico[]
  os: OSFaturada[]
  pv: PVFaturado[]
  avisos: string[]
}

// ── datas ────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Segunda-feira (ISO) da semana de uma data. */
export function segundaDaSemana(dataIso: string): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  const dow = dt.getDay(); // 0 dom … 6 sáb
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoDia(dt);
}

/**
 * Período do relatório: da segunda da semana até o dia do envio
 * (diaSemana 1=seg … 5=sex; padrão sexta). Nunca passa de "hoje".
 */
export function periodoDaSemana(referenciaIso: string, diaSemana = 5, hojeIso?: string): { inicio: string; fim: string } {
  const inicio = segundaDaSemana(referenciaIso);
  const [a, m, d] = inicio.split("-").map(Number);
  const fimDt = new Date(a, m - 1, d + Math.min(Math.max(diaSemana, 1), 7) - 1);
  let fim = isoDia(fimDt);
  if (hojeIso && fim > hojeIso) fim = hojeIso;
  return { inicio, fim };
}

/** Todas as datas DD/MM/AAAA do período (o vendas_itens guarda assim). */
export function datasBR(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const [a, m, d] = inicio.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  for (let i = 0; i < 31; i++) {
    const iso = isoDia(dt);
    if (iso > fim) break;
    out.push(`${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`);
    dt.setDate(dt.getDate() + 1);
  }
  return out;
}

export const brParaIso = (br: string) => {
  const m = String(br || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(br || "").slice(0, 10);
};

// ── técnico ──────────────────────────────────────────────────────────────────
/** "Técnico: FERNANDO LEONEL" / "A // B" → "Fernando Leonel" (o 1º). */
export function nomeTecnico(bruto: unknown): string {
  let s = String(bruto ?? "").replace(/^\s*t[ée]cnico\s*:\s*/i, "").split("//")[0].replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, l) => sp + l.toUpperCase());
  return s.replace(/\b(De|Da|Do|Dos|Das|E)\b/g, w => w.toLowerCase());
}

/** Chave pra juntar grafias diferentes do mesmo técnico. */
export const chaveTecnico = (nome: string) =>
  nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// ── km ───────────────────────────────────────────────────────────────────────
export function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

/** Km cobrado na OS do Omie: soma das linhas "KM Deslocamento" dos serviços. */
export function kmCobradoDosServicos(servicos: unknown): number | null {
  let lista: unknown = servicos;
  if (typeof lista === "string") { try { lista = JSON.parse(lista); } catch { return null; } }
  if (!Array.isArray(lista)) return null;
  let km = 0, achou = false;
  for (const s of lista as { cod?: number; qtd?: number; desc?: string }[]) {
    const ehKm = Number(s?.cod) === OMIE_NCODSERV_KM || /desloc|\bkm\b/i.test(String(s?.desc || "").split("|")[0]);
    if (ehKm) { km += numero(s?.qtd); achou = true; }
  }
  return achou ? Math.round(km * 10) / 10 : null;
}

// ── montagem ─────────────────────────────────────────────────────────────────
export function montarRelatorio(inicio: string, fim: string, os: OSFaturada[], pv: PVFaturado[], avisos: string[] = []): RelatorioFaturamento {
  const linhas = new Map<string, LinhaTecnico>();
  const linha = (nome: string) => {
    const n = nome || TECNICO_BALCAO;
    const k = chaveTecnico(n);
    let l = linhas.get(k);
    if (!l) { l = { tecnico: n, os: 0, valor_servico: 0, km_relatorio: 0, km_cobrado: 0, pv: 0, valor_pecas: 0, total: 0 }; linhas.set(k, l); }
    return l;
  };
  for (const o of os) {
    const l = linha(o.tecnico || "Sem técnico na OS");
    l.os++; l.valor_servico += o.valor; l.km_relatorio += o.km_relatorio || 0; l.km_cobrado += o.km_cobrado || 0;
  }
  for (const p of pv) {
    const l = linha(p.tecnico || TECNICO_BALCAO);
    l.pv++; l.valor_pecas += p.valor_pecas;
  }
  const por_tecnico = [...linhas.values()]
    .map(l => ({ ...l, total: l.valor_servico + l.valor_pecas }))
    .sort((a, b) => (a.tecnico === TECNICO_BALCAO ? 1 : 0) - (b.tecnico === TECNICO_BALCAO ? 1 : 0) || b.total - a.total);

  const soma = (arr: number[]) => Math.round(arr.reduce((s, n) => s + n, 0) * 100) / 100;
  const totais = {
    os: os.length,
    valor_servico: soma(os.map(o => o.valor)),
    pv: pv.length,
    valor_pecas: soma(pv.map(p => p.valor_pecas)),
    total: 0,
    km_relatorio: soma(os.map(o => o.km_relatorio || 0)),
    km_cobrado: soma(os.map(o => o.km_cobrado || 0)),
  };
  totais.total = soma([totais.valor_servico, totais.valor_pecas]);

  return {
    inicio, fim, totais, por_tecnico,
    os: [...os].sort((a, b) => a.data_faturamento.localeCompare(b.data_faturamento) || a.num_os.localeCompare(b.num_os)),
    pv: [...pv].sort((a, b) => a.data_faturamento.localeCompare(b.data_faturamento) || a.num_pedido.localeCompare(b.num_pedido)),
    avisos,
  };
}
