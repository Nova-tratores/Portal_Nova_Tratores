// "Criar com meu código" no Dar entrada — regras PURAS (client-safe).
// A Omie não deixa mudar o código/descrição do produto que ela cria no recebimento
// (AlterarRecebimento não tem esses campos). Então o portal CRIA o produto antes
// (IncluirProduto com o código e a descrição escolhidos, sem controle de lote) e
// ASSOCIA a linha da nota a ele. Máquina com N unidades depois vai para a faixa
// "Máquinas a separar" (o produto vira a 1ª máquina, as outras nascem lá).
import { descricaoBase } from '@/lib/estoque/separar-maquinas';

export const CODIGO_MAX = 60;
export const DESCRICAO_MAX = 120;

export interface ProdutoProprio {
  codigo: string;
  descricao: string;
  codigoFamilia?: number | null;
}

export function normalizarCodigo(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Descrição sugerida a partir da NF (tira "NUMERO DE SERIE…/CERT. DE GARANTIA…"). */
export function descricaoSugerida(descricaoNf: unknown): string {
  return (descricaoBase(descricaoNf) || String(descricaoNf ?? '').trim()).toUpperCase().slice(0, DESCRICAO_MAX);
}

/** NCM da NF ("84323190") no formato do cadastro da Omie ("8432.31.90"). */
export function ncmOmie(ncm: unknown): string {
  const d = String(ncm ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : String(ncm ?? '').trim();
}

/** Erros (vazio = ok). `repetidos` = códigos usados em outras linhas da mesma nota. */
export function validarProdutoProprio(p: ProdutoProprio, rotulo = 'Item'): string[] {
  const erros: string[] = [];
  const c = normalizarCodigo(p.codigo);
  const d = String(p.descricao ?? '').trim();
  if (!c) erros.push(`${rotulo}: falta o código do produto.`);
  else if (c.length > CODIGO_MAX) erros.push(`${rotulo}: código com mais de ${CODIGO_MAX} letras.`);
  if (!d) erros.push(`${rotulo}: falta a descrição do produto.`);
  else if (d.length > DESCRICAO_MAX) erros.push(`${rotulo}: descrição com mais de ${DESCRICAO_MAX} letras.`);
  return erros;
}

export function validarLista(itens: Array<ProdutoProprio & { rotulo?: string }>): string[] {
  const erros: string[] = [];
  const vistos = new Set<string>();
  itens.forEach((p, i) => {
    const r = p.rotulo || `Item ${i + 1}`;
    erros.push(...validarProdutoProprio(p, r));
    const c = normalizarCodigo(p.codigo);
    if (c && vistos.has(c)) erros.push(`${r}: código ${c} repetido na nota.`);
    if (c) vistos.add(c);
  });
  return erros;
}

/** Código de integração: reexecutar a entrada acha o mesmo produto em vez de duplicar. */
export function codigoIntegracao(idReceb: unknown, nSequencia: unknown): string {
  return `RCB-${String(idReceb ?? '').trim()}-${String(nSequencia ?? '').trim()}`.slice(0, 60);
}

export function payloadProdutoProprio(p: ProdutoProprio & {
  idReceb: unknown; nSequencia: unknown; unidade?: string | null; ncm?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    codigo_produto_integracao: codigoIntegracao(p.idReceb, p.nSequencia),
    codigo: normalizarCodigo(p.codigo),
    descricao: String(p.descricao).trim().slice(0, DESCRICAO_MAX),
    unidade: String(p.unidade || 'UN').trim().toUpperCase() || 'UN',
    ncm: ncmOmie(p.ncm),
    tipoItem: '00', // mercadoria para revenda
    produto_lote: 'N',
  };
  if (Number(p.codigoFamilia) > 0) out.codigo_familia = Number(p.codigoFamilia);
  return out;
}
