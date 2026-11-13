// Regras PURAS do Recebimento de NF-e (tela única /estoque/recebimentos).
// Sem banco e sem Omie: usadas pela lista (montada do espelho recebimentos_nfe),
// pela análise de UMA nota ao abrir (ConsultarRecebimento) e pelos testes.

import { isCfopGarantia, type AjustesConfig } from './config';

// CFOP de entrada equivalente ao de saída do fornecedor (5->1, 6->2, 7->3).
// Cópia da de lib/ajustes/omie.ts: este arquivo é importado pelo navegador e não
// pode puxar o cliente da Omie.
function cfopEntradaEquivalente(cfopSaida: unknown): string | null {
  if (cfopSaida == null) return null;
  const d = String(cfopSaida).replace(/\D/g, '');
  if (d.length < 4) return null;
  const mapa: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  return `${mapa[d[0]] || d[0]}.${d.slice(1, 4)}`;
}

export const RE_NATUREZA_GARANTIA = /garantia|conserto|reparo|assist[eê]ncia t[eé]cnica/i;
// combustivel e' um tipo PROPRIO (responsavel distinto do almoxarifado geral).
const RECEB_KW_COMBUSTIVEL = ['combust', 'diesel', 'gasolina', 'etanol', 'alcool', 'álcool', 'arla'];
const RECEB_KW_ALMOX = ['almoxarif', 'lubrific', 'oleo', 'óleo', 'graxa', 'uso e consumo', 'expediente'];

// Item de linha >= este valor (R$) classifica o recebimento como 'maquinas'.
// Maquina = item caro (ignora o total da nota; pedidao de pecas baratas nao conta).
export const LIMIAR_ITEM_MAQUINA = 10000;

export const TIPOS_RECEB = ['pecas', 'pecas_garantia', 'almoxarifado', 'combustivel', 'maquinas'] as const;
export type TipoReceb = (typeof TIPOS_RECEB)[number];

function num(v: unknown): number { return Number(v == null ? 0 : v) || 0; }

export interface ItemRecebNorm {
  nSequencia: number | string | null;
  cfop: string | null;
  cfopEntrada: string | null;
  cfopEntradaSugerido: string | null;
  codigoProdutoInt: string | null;
  descricaoProduto: string | null;
  ncm: string | null;
  idProduto: number | null;
  criarNovo: boolean;
  associarExistente: boolean;
  qtde: number;
  precoUnit: number;
  valTotalItem: number;
}

/** Shape comum (= lib/ajustes/omie.normalizarRecebimento) usado pela tela. */
export interface RecebNorm {
  idReceb: number | string | null;
  numeroNFe: string | null;
  serieNFe: string | null;
  chaveNFe: string | null;
  etapa: string | null;
  naturezaOperacao: string | null;
  fornecedorNome: string | null;
  fornecedorCnpjCpf: string | null;
  idFornecedor: number | string | null;
  dataEmissao: string | null; // DD/MM/AAAA
  valorNFe: number;
  recebido: boolean;
  cancelada: boolean;
  itens: ItemRecebNorm[];
  [k: string]: unknown;
}

/** Classifica um recebimento em 1 dos 5 tipos. Na dúvida, 'pecas'.
 * Precedência: garantia > combustível > almoxarifado > máquinas (item >= 10 mil) > peças. */
export function classificarTipoReceb(rec: { itens?: Array<Partial<ItemRecebNorm>> }, sinalGarantia: boolean): TipoReceb {
  if (sinalGarantia) return 'pecas_garantia';
  const itens = Array.isArray(rec.itens) ? rec.itens : [];
  let almox = false;
  let maxItem = 0;
  for (const it of itens) {
    const desc = String(it.descricaoProduto || '').toLowerCase();
    if (RECEB_KW_COMBUSTIVEL.some((k) => desc.includes(k))) return 'combustivel';
    if (RECEB_KW_ALMOX.some((k) => desc.includes(k))) almox = true;
    const v = num(it.valTotalItem) || num(it.precoUnit) * num(it.qtde);
    if (v > maxItem) maxItem = v;
  }
  if (almox) return 'almoxarifado';
  if (maxItem >= LIMIAR_ITEM_MAQUINA) return 'maquinas';
  return 'pecas';
}

/** Sinal de garantia/conserto: pela natureza da operação ou por CFOP de garantia. */
export function sinalGarantia(rec: Pick<RecebNorm, 'naturezaOperacao' | 'itens'>, cfg?: AjustesConfig): 'natureza' | 'cfop' | null {
  if (RE_NATUREZA_GARANTIA.test(rec.naturezaOperacao || '')) return 'natureza';
  if ((rec.itens || []).some((it) => isCfopGarantia(it.cfop, cfg))) return 'cfop';
  return null;
}

/** Acrescenta sinal/tipo (o tipo manual, quando houver, vence). */
export function prepararRecebimento<T extends RecebNorm>(rec: T, cfg?: AjustesConfig, tipoManual?: string | null) {
  const sinal = sinalGarantia(rec, cfg);
  const tipoAuto = classificarTipoReceb(rec, !!sinal);
  const tipo = tipoManual && (TIPOS_RECEB as readonly string[]).includes(tipoManual) ? (tipoManual as TipoReceb) : tipoAuto;
  return { ...rec, sinal, temSinalGarantia: !!sinal, tipo, tipoAuto, tipoManual: tipo !== tipoAuto };
}

// "2026-11-09" ou "09/11/2026" -> "09/11/2026"
export function dataBR(s: unknown): string | null {
  if (!s) return null;
  const str = String(s).split('T')[0];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return str;
}

/** Linha do espelho recebimentos_nfe (+ natureza lida do dados_raw) -> shape da tela. */
export function recebimentoDoEspelho(row: Record<string, unknown>): RecebNorm {
  const prods = Array.isArray(row.produtos) ? (row.produtos as Record<string, unknown>[]) : [];
  const maqs = Array.isArray(row.maquinas) ? (row.maquinas as Record<string, unknown>[]) : [];
  // `maquinas` repete itens de `produtos` (linhas antigas do app legado só em `maquinas`)
  const seqs = new Set(prods.map((p) => String(p.nSequencia ?? '')));
  const todos = [...prods, ...maqs.filter((m) => !seqs.has(String(m.nSequencia ?? '')))];
  const itens: ItemRecebNorm[] = todos.map((p) => {
    const id = num(p.nCodProduto);
    const qtde = num(p.nQtde);
    const precoUnit = num(p.nValUnit);
    const cfop = (p.cCFOP as string) || null;
    return {
      nSequencia: (p.nSequencia as number) ?? null,
      cfop,
      cfopEntrada: (p.cCFOPEntrada as string) || null,
      cfopEntradaSugerido: cfopEntradaEquivalente(cfop),
      codigoProdutoInt: (p.cCodigo as string) || null,
      descricaoProduto: (p.cDescricao as string) || null,
      ncm: (p.cNCM as string) || null,
      idProduto: id > 0 ? id : null,
      criarNovo: p.cAdicionarNovo === 'S',
      associarExistente: p.cAssociarExistente === 'S',
      qtde, precoUnit,
      valTotalItem: num(p.vTotal) || qtde * precoUnit,
    };
  });
  return {
    idReceb: (row.id_receb as number) ?? null,
    numeroNFe: (row.numero_nfe as string) || null,
    serieNFe: (row.serie_nfe as string) || null,
    chaveNFe: (row.chave_nfe as string) || null,
    etapa: (row.etapa as string) || null,
    naturezaOperacao: (row.natureza as string) || null,
    fornecedorNome: (row.fornecedor_razao as string) || (row.fornecedor as string) || null,
    fornecedorCnpjCpf: (row.fornecedor_cnpj as string) || null,
    idFornecedor: (row.id_fornecedor as number) ?? null,
    dataEmissao: dataBR(row.emissao_nfe),
    valorNFe: num(row.total_nfe),
    recebido: row.status === 'Recebida',
    cancelada: row.status === 'Cancelada',
    itens,
  };
}

/** Tira zeros à esquerda ("000016751" -> "16751"; "0" continua "0"). */
export function semZerosEsq(s: string): string {
  return s.replace(/^0+(?=\d)/, '');
}

/**
 * Busca única da lista: número da nota (com ou sem zeros), chave (44 dígitos),
 * CNPJ (com ou sem pontuação), fornecedor/descrição dos itens ou valor ("379,45").
 * Termo só de dígitos: bate o número EXATO (sem zeros), ou o CNPJ/chave que contém.
 */
export function casaBusca(rec: RecebNorm, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const dig = t.replace(/\D/g, '');
  if (/^[\d.\-/\s]+$/.test(t) && dig) {
    if (semZerosEsq(String(rec.numeroNFe || '').replace(/\D/g, '')) === semZerosEsq(dig)) return true;
    if (dig.length >= 6) {
      if (String(rec.fornecedorCnpjCpf || '').replace(/\D/g, '').includes(dig)) return true;
      if (String(rec.chaveNFe || '').replace(/\D/g, '').includes(dig)) return true;
    }
    return false;
  }
  // valor: "379,45" / "R$ 1.234,56"
  const valor = /^r?\$?\s*[\d.]+,\d{1,2}$/.test(t) ? Number(t.replace(/[^\d,]/g, '').replace(',', '.')) : null;
  if (valor != null && Math.abs((rec.valorNFe || 0) - valor) < 0.005) return true;
  const alvo = [rec.fornecedorNome, rec.naturezaOperacao, ...(rec.itens || []).map((i) => `${i.descricaoProduto || ''} ${i.codigoProdutoInt || ''}`)]
    .join(' ')
    .toLowerCase();
  return alvo.includes(t);
}

/** Dias desde a emissão (para "parada há N dias"). */
export function diasDesde(dataBRouIso: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!dataBRouIso) return null;
  const s = String(dataBRouIso);
  let d: Date | null = null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (br) d = new Date(+br[3], +br[2] - 1, +br[1]);
  else if (iso) d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
  if (!d || isNaN(d.getTime())) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - d.getTime()) / 86400000));
}

// "Entradas feitas": a correção de custo grava UMA linha por peça no
// recebimento_entrada_log, e a tela mostrava N linhas iguais (mesma NF, mesma ação,
// segundos de diferença). Junta as correções seguidas da mesma nota, da mesma pessoa,
// dentro da janela, numa linha só com as peças dentro. Logs vêm do mais novo ao mais velho.
export interface LogEntradaBruto {
  id: number; id_receb: number | null; acao: string; user_id: string | null; created_at: string;
}
export function agruparCorrecoes<T extends LogEntradaBruto>(logs: T[], janelaMs = 10 * 60 * 1000): Array<{ linha: T; itens: T[] }> {
  const out: Array<{ linha: T; itens: T[] }> = [];
  for (const l of logs) {
    const ult = out[out.length - 1];
    if (
      l.acao === 'correcao_cmc' && ult && ult.linha.acao === 'correcao_cmc' &&
      ult.linha.id_receb === l.id_receb && ult.linha.user_id === l.user_id &&
      Math.abs(new Date(ult.linha.created_at).getTime() - new Date(l.created_at).getTime()) <= janelaMs
    ) {
      ult.itens.push(l);
      continue;
    }
    out.push({ linha: l, itens: l.acao === 'correcao_cmc' ? [l] : [] });
  }
  return out;
}
