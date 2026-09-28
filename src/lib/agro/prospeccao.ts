// Lib PURA da lista de prospecção e da ficha do imóvel (Inteligência por CAR).
// Tipos + rótulos + CSV + pequenas regras de apresentação — sem Supabase, sem React.

export type Confianca = 'alta' | 'media' | 'baixa';

export interface ImovelProspeccao {
  cod_car: string;
  municipio: string;
  municipio_ibge: number;
  area_ha: number | null;
  area_util_ha: number | null;
  modulos_fiscais: number | null;
  cultura_principal: string | null;
  cultura_nome: string | null;
  cultura_grupo: string | null;
  area_cultura_ha: number | null;
  pct_area_util: number | null;
  confianca: Confianca | null;
  motivo_confianca: string | null;
  fonte_principal: string | null;
  credito_12m: number | null;
  credito_36m: number | null;
  credito_invest_36m: number | null;
  ultima_finalidade: string | null;
  ultimo_credito_em: string | null;
  score_oportunidade: number | null;
  score_detalhe: Record<string, unknown> | null;
  vinculos: number;
  sobreposicao_pct: number | null;
  centroide: { type: 'Point'; coordinates: [number, number] } | null;
  // enriquecidos pela rota
  clientes?: string[];
  sugestoes_pendentes?: number;
}

export const CONF_ROTULO: Record<Confianca, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const CONF_COR: Record<Confianca, string> = { alta: '#16a34a', media: '#d97706', baixa: '#6b7280' };

// mesma paleta do mapa (MapaCar.tsx) — cultura → cor
export const CORES_CULTURA: Record<string, string> = {
  soja: '#facc15', milho: '#fb923c', sorgo: '#f97316', trigo: '#eab308', feijao: '#a16207', algodao: '#e5e7eb', arroz: '#7dd3fc',
  horti: '#f472b6', outras_temp: '#fdba74', cana: '#a3e635', cafe: '#7c2d12', citros: '#f59e0b', outras_peren: '#c084fc',
  pastagem: '#4ade80', silvicultura: '#166534', mosaico: '#9ca3af', outro: '#6b7280',
};
export const COR_DIVERSIFICADO = '#cbd5e1';
export function corCultura(codigo: string | null | undefined): string {
  return codigo ? (CORES_CULTURA[codigo] || '#6b7280') : COR_DIVERSIFICADO;
}

export function nomeCultura(i: Pick<ImovelProspeccao, 'cultura_nome'>): string {
  return i.cultura_nome || 'Diversificado';
}

/** "SP-3538808-4B75…1B6B" — curto pra tabela, inteiro no title. */
export function codCarCurto(cod: string): string {
  if (!cod || cod.length <= 20) return cod || '';
  return `${cod.slice(0, 11)}…${cod.slice(-6)}`;
}

export function fmtHa(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ha';
}
export function fmtBRL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
export function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return y && m && dd ? `${dd}/${m}/${y}` : '—';
}

/** Link do Google Maps no centróide do imóvel (o vendedor abre no celular). */
export function linkMaps(c: ImovelProspeccao['centroide']): string | null {
  if (!c?.coordinates || c.coordinates.length < 2) return null;
  const [lng, lat] = c.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Explica o score com as partes gravadas em score_detalhe (nunca número solto). */
export function explicarScore(d: Record<string, unknown> | null | undefined): string[] {
  if (!d) return [];
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : Number(d[k] ?? NaN));
  const out: string[] = [];
  if (Number.isFinite(n('area'))) out.push(`área da cultura: ${n('area').toFixed(2)} (100 ha = 1, teto 3)`);
  if (Number.isFinite(n('credito'))) out.push(`crédito: ${n('credito')} (${n('credito') === 2 ? 'investimento nos 36 meses' : n('credito') === 1 ? 'custeio nos 12 meses' : 'sem crédito recente'})`);
  if (Number.isFinite(n('sem_compra'))) out.push(`ainda não é cliente vinculado: ${n('sem_compra')}`);
  if (Number.isFinite(n('prioridade'))) out.push(`prioridade da regra: ${n('prioridade')}${d.produto_sugerido ? ` (${String(d.produto_sugerido)})` : ' (sem regra cadastrada)'}`);
  if (Number.isFinite(n('fator_confianca'))) out.push(`fator da confiança: × ${n('fator_confianca')}`);
  if (Number(d.sugestoes_pendentes) > 0) out.push(`${d.sugestoes_pendentes} sugestão(ões) de cliente pendente(s)`);
  return out;
}

// ---------- CSV (mesmo padrão de lib/ppv/relacao.ts: BOM, ';', CRLF) ----------

const cel = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const numBR = (n: number | null | undefined, casas = 2): string =>
  n == null || !Number.isFinite(Number(n)) ? '' : Number(n).toFixed(casas).replace('.', ',');

export const COLUNAS_CSV = [
  'Score', 'Município', 'Código CAR', 'Cultura principal', 'Confiança', 'Motivo da confiança',
  'Área total (ha)', 'Área útil (ha)', 'Área da cultura (ha)', '% da área útil',
  'Crédito 12 m (R$)', 'Crédito 36 m (R$)', 'Investimento 36 m (R$)', 'Última finalidade', 'Último crédito',
  'Cliente vinculado', 'Sugestões pendentes', 'Sobreposição máx. (%)', 'Latitude', 'Longitude',
] as const;

/**
 * CSV da lista de prospecção. NÃO leva dado de pessoa física vindo de fonte
 * pública (o LIA proíbe): só o imóvel, a estimativa e o cliente que a própria
 * Nova vinculou.
 */
export function gerarCSVProspeccao(lista: ImovelProspeccao[]): string {
  const linhas = lista.map((i) => [
    numBR(i.score_oportunidade), i.municipio, i.cod_car, nomeCultura(i),
    i.confianca ? CONF_ROTULO[i.confianca] : '', i.motivo_confianca || '',
    numBR(i.area_ha, 1), numBR(i.area_util_ha, 1), numBR(i.area_cultura_ha, 1), numBR(i.pct_area_util, 0),
    numBR(i.credito_12m, 0), numBR(i.credito_36m, 0), numBR(i.credito_invest_36m, 0),
    i.ultima_finalidade || '', fmtData(i.ultimo_credito_em) === '—' ? '' : fmtData(i.ultimo_credito_em),
    (i.clientes || []).join(' / '), i.sugestoes_pendentes ? String(i.sugestoes_pendentes) : '',
    numBR(i.sobreposicao_pct, 0),
    i.centroide?.coordinates ? numBR(i.centroide.coordinates[1], 6) : '',
    i.centroide?.coordinates ? numBR(i.centroide.coordinates[0], 6) : '',
  ].map(cel).join(';'));
  return '﻿' + [COLUNAS_CSV.map(cel).join(';'), ...linhas].join('\r\n');
}

// ---------- uso do solo por safra (ficha) ----------

export interface UsoSolo { ano_safra: number; fonte: string; cultura_codigo: string; area_ha: number; pct_area_util: number | null }

/** Pivot cultura × safra (só MapaBiomas), culturas ordenadas pela área da safra mais recente. */
export function pivotUso(uso: UsoSolo[], nomes: Record<string, string>): { anos: number[]; linhas: { codigo: string; nome: string; porAno: Record<number, number> }[] } {
  const mb = uso.filter((u) => u.fonte === 'mapbiomas');
  const anos = Array.from(new Set(mb.map((u) => u.ano_safra))).sort((a, b) => a - b);
  const por: Record<string, Record<number, number>> = {};
  for (const u of mb) {
    por[u.cultura_codigo] = por[u.cultura_codigo] || {};
    por[u.cultura_codigo][u.ano_safra] = (por[u.cultura_codigo][u.ano_safra] || 0) + Number(u.area_ha || 0);
  }
  const ultimo = anos[anos.length - 1];
  const linhas = Object.entries(por)
    .map(([codigo, porAno]) => ({ codigo, nome: nomes[codigo] || codigo, porAno }))
    .sort((a, b) => (b.porAno[ultimo] || 0) - (a.porAno[ultimo] || 0));
  return { anos, linhas };
}
