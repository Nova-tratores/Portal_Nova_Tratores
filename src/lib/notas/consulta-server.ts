// /financeiro/notas — consulta no banco com TODOS os filtros da tela (abas, período,
// busca, filtros do cabeçalho). Uma função só para a lista paginada, o total dos
// filtros e os relatórios, para os três verem exatamente as mesmas notas.
// Migrations opcionais ausentes (vínculos, categoria, numero_n) são detectadas pela
// mensagem do erro e a consulta é refeita sem elas.
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { parseConta } from '@/lib/estoque/conta';
import { COLS, COLS_VINCULOS, COLS_CATEGORIA } from './cache-docs';
import { colunaBanco, ehCampoBusca, ehTipoNota, filtroBusca, parseOrdem, type CampoBusca, type Ordem } from './cache-regras';
import { lerFiltrosColuna, opsFiltrosColuna, type FiltrosColuna } from './filtros-relatorios';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_SEM_VINCULOS = /parte_cod|pedido_num|pedido_cod|os_num|os_cod|maquina/i;
const RE_SEM_CATEGORIA = /categoria/i;
const RE_SEM_NUMERO_N = /numero_n/i;

export interface ParamsNotas {
  conta: string;       // '' = as duas
  tipo: string;        // entrada | saida | saida_produto | saida_servico | ''
  de: string; ate: string;
  q: string; campo: CampoBusca;
  soMaquinas: boolean;
  filtros: FiltrosColuna;
  ordem: Ordem;
  podeEntrada: boolean;
}

export interface Faltando { semVinculos: boolean; semCategoria: boolean; semNumeroN: boolean }

export function lerParamsNotas(sp: URLSearchParams, podeEntrada: boolean): ParamsNotas {
  const campoRaw = sp.get('campo') || 'auto';
  return {
    conta: parseConta(sp.get('conta')) || '',
    tipo: sp.get('tipo') || '',
    de: ISO_DIA.test(sp.get('de') || '') ? sp.get('de')! : '',
    ate: ISO_DIA.test(sp.get('ate') || '') ? sp.get('ate')! : '',
    q: sp.get('q') || '',
    campo: ehCampoBusca(campoRaw) ? campoRaw : 'auto',
    soMaquinas: sp.get('maquinas') === '1',
    filtros: lerFiltrosColuna(sp),
    ordem: parseOrdem(sp.get('ordem')),
    podeEntrada,
  };
}

function colunas(f: Faltando): string {
  if (f.semVinculos) return COLS;
  return f.semCategoria ? COLS_VINCULOS : COLS_CATEGORIA;
}

/** Monta a consulta com os filtros. `cols` = colunas pedidas (null = as da lista). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function montarConsultaNotas(p: ParamsNotas, f: Faltando, opts: { cols?: string; contar?: boolean } = {}): any {
  let query = supabaseAdmin.from('notas_fiscais_docs').select(opts.cols || colunas(f), opts.contar ? { count: 'exact' } : undefined);
  if (p.conta) query = query.eq('conta_omie', p.conta);
  if (!p.podeEntrada) query = query.neq('tipo', 'entrada');
  if (p.tipo === 'saida') query = query.in('tipo', ['saida_produto', 'saida_servico']);
  else if (ehTipoNota(p.tipo) && (p.podeEntrada || p.tipo !== 'entrada')) query = query.eq('tipo', p.tipo);
  if (p.de) query = query.gte('data_emissao', p.de);
  if (p.ate) query = query.lte('data_emissao', p.ate);
  const or = filtroBusca(p.q, p.campo, { semVinculos: f.semVinculos });
  if (or) query = query.or(or);
  if (p.soMaquinas && !f.semVinculos) query = query.not('maquina', 'is', null);
  for (const op of opsFiltrosColuna(p.filtros, f)) {
    if (op.op === 'in') query = query.in(op.col, op.val);
    else if (op.op === 'or') query = query.or(op.val);
    else if (op.op === 'gte' || op.op === 'gteNum') query = query.gte(op.col, op.val);
    else if (op.op === 'lte') query = query.lte(op.col, op.val);
    else if (op.op === 'notNull') query = query.not(op.col, 'is', null);
    else if (op.op === 'notTrue') query = query.not(op.col, 'is', true);
  }
  return query;
}

/** Aplica a ordem do cabeçalho (+ desempate estável). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ordenar(query: any, p: ParamsNotas, f: Faltando): any {
  const col = colunaBanco(p.ordem, f);
  let q = query.order(col, { ascending: p.ordem.dir === 'asc', nullsFirst: false });
  if (col !== 'data_emissao') q = q.order('data_emissao', { ascending: false, nullsFirst: false });
  return q.order('id', { ascending: false });
}

/** Roda `fazer` e, se o erro for de migration opcional ausente, repete sem ela (até 3x). */
export async function comFallback<T extends { error: { message?: string } | null }>(
  fazer: (f: Faltando) => PromiseLike<T>,
): Promise<{ res: T; faltando: Faltando }> {
  const f: Faltando = { semVinculos: false, semCategoria: false, semNumeroN: false };
  let res = await fazer(f);
  for (let i = 0; i < 3 && res.error; i++) {
    const msg = res.error.message || '';
    if (!f.semNumeroN && RE_SEM_NUMERO_N.test(msg)) f.semNumeroN = true;
    else if (!f.semCategoria && RE_SEM_CATEGORIA.test(msg)) f.semCategoria = true;
    else if (!f.semVinculos && RE_SEM_VINCULOS.test(msg)) f.semVinculos = true;
    else break;
    res = await fazer(f);
  }
  return { res, faltando: f };
}

const PAGINA = 1000;
const PARALELO = 6;

/** Todas as notas do filtro (só as colunas pedidas), em páginas de 1000 em paralelo.
 *  `teto` evita varrer o banco inteiro: passou dele, devolve `excedeu`. */
export async function buscarTodasNotas<T>(p: ParamsNotas, f: Faltando, cols: string, teto: number): Promise<{ linhas: T[]; total: number; excedeu: boolean }> {
  const primeira = await ordenar(montarConsultaNotas(p, f, { cols, contar: true }), { ...p, ordem: { coluna: 'data_emissao', dir: 'desc' } }, f).range(0, PAGINA - 1);
  if (primeira.error) throw new Error(primeira.error.message);
  const total = primeira.count || 0;
  if (total > teto) return { linhas: [], total, excedeu: true };
  const linhas: T[] = [...(primeira.data || [])];
  const paginas: number[] = [];
  for (let off = PAGINA; off < total; off += PAGINA) paginas.push(off);
  for (let i = 0; i < paginas.length; i += PARALELO) {
    const lote = await Promise.all(paginas.slice(i, i + PARALELO).map((off) =>
      ordenar(montarConsultaNotas(p, f, { cols }), { ...p, ordem: { coluna: 'data_emissao', dir: 'desc' } }, f).range(off, off + PAGINA - 1)));
    for (const r of lote) {
      if (r.error) throw new Error(r.error.message);
      linhas.push(...(r.data || []));
    }
  }
  return { linhas, total, excedeu: false };
}

/** Colunas que o total e os relatórios leem (sem os caminhos de arquivo). */
export function colsRelatorio(f: Faltando): string {
  const base = 'id,conta_omie,tipo,numero,serie,data_emissao,parte_nome,parte_doc,valor,cancelada,chave_nfe';
  if (f.semVinculos) return base;
  return base + ',pedido_num,os_num,maquina' + (f.semCategoria ? '' : ',categoria');
}
export function colsSoma(f: Faltando): string {
  return 'tipo,valor,cancelada' + (f.semVinculos || f.semCategoria ? '' : ',categoria');
}
