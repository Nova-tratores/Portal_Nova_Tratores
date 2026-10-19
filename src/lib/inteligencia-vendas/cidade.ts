// =============================================================================
// INTELIGÊNCIA DE VENDAS — raio-x de UMA cidade para a ficha do cliente
// (José, 19/10/2026: "em relação a mostrar como está o mercado da cidade, será que
// conseguimos mais informações?"). Lib PURA: transforma as respostas do IBGE SIDRA,
// do Open-Meteo e as nossas propostas no formato da tela.
//
//   SIDRA 6579 ... população estimada            SIDRA 5938 ... PIB e PIB do agro (VAB)
//   SIDRA 6778 ... propriedades rurais (Censo Agro 2017)
//   SIDRA 6869 ... propriedades com trator, tratores e potência (Censo Agro 2017)
//   SIDRA 5457 ... valor da produção por cultura + série de 6 anos (área e valor)
//   SIDRA 3939 ... rebanhos por tipo             SIDRA 74 ..... leite
//   Open-Meteo ... previsão de 7 dias            propostas .... concorrentes que ganharam de nós
// =============================================================================
import { textoNorm } from './normalizar';

export interface LinhaSidra { V: string; [k: string]: string }

export interface CidadeIV {
  ibge: number;
  populacao: { valor: number; ano: string } | null;
  pib: { totalMil: number; agroMil: number | null; agroPct: number | null; ano: string } | null;
  censo: {
    propriedades: number | null;
    comTrator: number | null;
    tratores: number | null;
    menos100cv: number | null;
    mais100cv: number | null;
    semTratorPct: number | null; // propriedades sem trator / total
  } | null;
  valorCulturas: { nome: string; valorMil: number }[];
  serie: { ano: string; areaHa: number | null; valorMil: number | null }[];
  rebanhos: { nome: string; cabecas: number }[];
  leiteMilLitros: number | null;
  anoAgro: string;
  clima: { data: string; chuvaMm: number; prob: number | null; tmin: number; tmax: number }[];
  alertasClima: string[];
  concorrentes: { nome: string; perdas: number; valor: number; ultima: string }[];
  perdasTotal: number;
  fontes: Record<string, 'ok' | 'erro'>;
}

/** Valor numérico de uma linha SIDRA ('-', '...', 'X' = sem dado). */
export function valorSidra(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || /^[-.X]+$|^\.\.\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Linhas de dados (a 1ª linha do SIDRA é o cabeçalho). */
export function linhas(json: unknown): LinhaSidra[] {
  return Array.isArray(json) ? (json.slice(1) as LinhaSidra[]) : [];
}

/** Acha o valor da linha cuja descrição (qualquer D?N) contém o texto. */
export function valorPor(ls: LinhaSidra[], trecho: string, ano?: string): number | null {
  const trechos = [trecho, ...(ano ? [ano] : [])];
  const l = ls.find((x) => trechos.every((t) => Object.keys(x).some((k) => /^D\dN$/.test(k) && textoNorm(x[k]).includes(textoNorm(t)))));
  return l ? valorSidra(l.V) : null;
}

/** Ano (D3N ou o que tiver 'Ano') da 1ª linha. */
export function anoDe(ls: LinhaSidra[]): string {
  const l = ls[0];
  if (!l) return '';
  const k = Object.keys(l).find((x) => /^D\dN$/.test(x) && /^\d{4}$/.test(String(l[x])));
  return k ? l[k] : '';
}

/** Categoria = última dimensão descritiva da linha (cultura, rebanho…). */
function categoria(l: LinhaSidra): string {
  const ks = Object.keys(l).filter((k) => /^D\dN$/.test(k)).sort();
  return String(l[ks[ks.length - 1]] || '');
}

export function porCategoria(ls: LinhaSidra[]): { nome: string; valor: number }[] {
  return ls
    .map((l) => ({ nome: categoria(l), valor: valorSidra(l.V) ?? 0 }))
    .filter((x) => x.valor > 0 && x.nome && !/^total$/i.test(x.nome))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Tira os subitens quando o IBGE manda o total junto: 'Café (em grão) Total' vira 'Café (em grão)'
 * e some o 'Café (em grão) Arábica'; 'Galináceos - total' vira 'Galináceos' e some 'Galináceos - galinhas'.
 */
export function semSubitens<T extends { nome: string }>(lista: T[]): T[] {
  const RE = /\s*(?:-\s*)?total$/i;
  const totais = lista.filter((x) => RE.test(x.nome)).map((x) => x.nome.replace(RE, ''));
  return lista
    .filter((x) => RE.test(x.nome) || !totais.some((t) => x.nome.startsWith(t)))
    .map((x) => ({ ...x, nome: x.nome.replace(RE, '') }));
}

/** Série por ano a partir de linhas com ano. */
export function serieAnual(area: LinhaSidra[], valor: LinhaSidra[]): CidadeIV['serie'] {
  const anos = new Map<string, { areaHa: number | null; valorMil: number | null }>();
  const ano = (l: LinhaSidra) => { const k = Object.keys(l).find((x) => /^D\dN$/.test(x) && /^\d{4}$/.test(String(l[x]))); return k ? l[k] : ''; };
  for (const l of area) { const a = ano(l); if (a) anos.set(a, { ...(anos.get(a) || { areaHa: null, valorMil: null }), areaHa: valorSidra(l.V) }); }
  for (const l of valor) { const a = ano(l); if (a) anos.set(a, { ...(anos.get(a) || { areaHa: null, valorMil: null }), valorMil: valorSidra(l.V) }); }
  return [...anos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([a, v]) => ({ ano: a, ...v }));
}

/** Previsão diária do Open-Meteo → dias. */
export function climaDoOpenMeteo(j: any): CidadeIV['clima'] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = j?.daily;
  if (!d?.time) return [];
  return (d.time as string[]).map((t, i) => ({
    data: t,
    chuvaMm: Number(d.precipitation_sum?.[i] ?? 0) || 0,
    prob: d.precipitation_probability_max?.[i] ?? null,
    tmin: Number(d.temperature_2m_min?.[i] ?? 0),
    tmax: Number(d.temperature_2m_max?.[i] ?? 0),
  }));
}

/** Avisos simples do tempo para quem vai visitar/vender. */
export function alertasDoClima(dias: CidadeIV['clima']): string[] {
  const out: string[] = [];
  const geada = dias.filter((d) => d.tmin <= 3);
  if (geada.length) out.push(`Risco de geada (mínima de ${Math.min(...geada.map((d) => d.tmin)).toFixed(0)} °C)`);
  const forte = dias.filter((d) => d.chuvaMm >= 40);
  if (forte.length) out.push(`Chuva forte em ${forte.length} dia(s): estrada de terra pode complicar a visita`);
  const soma = dias.reduce((s, d) => s + d.chuvaMm, 0);
  if (dias.length >= 5 && soma < 5) out.push('Semana seca: menos de 5 mm previstos');
  if (dias.length && soma >= 20 && soma < 120 && !forte.length) out.push(`${Math.round(soma)} mm previstos na semana: bom para o plantio`);
  return out;
}

export interface PropostaCidade { Cidade: string | null; status: string | null; concorrente: string | null; concorrente_valor: number | null; fechado_em: string | null; status_desde: string | null; criado_em: string | null }

/** Quem ganhou de nós nesta cidade (propostas perdidas com concorrente informado). */
export function concorrentesNaCidade(propostas: PropostaCidade[], nomeCidade: string, perdida: string): { lista: CidadeIV['concorrentes']; total: number } {
  const alvo = textoNorm(nomeCidade);
  const m = new Map<string, { nome: string; perdas: number; valor: number; ultima: string }>();
  let total = 0;
  for (const p of propostas) {
    if (p.status !== perdida) continue;
    const cid = textoNorm(String(p.Cidade || '').replace(/\s*[(/-].*$/, ''));
    if (!cid || cid !== alvo) continue;
    total++;
    const nome = String(p.concorrente || '').trim();
    if (!nome) continue;
    const chave = textoNorm(nome);
    const e = m.get(chave) || { nome: nome.replace(/\b\w/g, (x) => x.toUpperCase()), perdas: 0, valor: 0, ultima: '' };
    e.perdas++;
    e.valor += Number(p.concorrente_valor) || 0;
    const q = String(p.fechado_em || p.status_desde || p.criado_em || '').slice(0, 10);
    if (q > e.ultima) e.ultima = q;
    m.set(chave, e);
  }
  return { lista: [...m.values()].sort((a, b) => b.perdas - a.perdas).slice(0, 6), total };
}
