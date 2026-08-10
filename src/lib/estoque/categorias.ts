// Categorias do dashboard: config (categorias_dashboard) + matching de "tipo"
// + agregação dos cards. Portado de server.js (CATEGORIAS_PADRAO,
// carregarCategorias, tipoMatchCategoria, expandirCategoriaFiltro,
// CATEGORIAS_AGRUPADAS, agregarCards).

import { supabase } from './supabase';
import { classificarGrupo } from './cruzamento-familia';

export interface CategoriaConfig {
  nome: string;
  palavras_chave: string;
  posicao: number;
  /** Identidade estável do card fixo (pecas_diversas | filtros | lubrificantes). */
  slug: string;
}

// Os 3 cards FIXOS de peças (os demais são dinâmicos, um por `tipo` com
// faturamento no período). Fallback quando a tabela `categorias_dashboard`
// está vazia. `pecas_diversas` é o catch-all (peças sem tipo); suas
// palavras-chave são opcionais.
export const CATEGORIAS_PADRAO: CategoriaConfig[] = [
  { slug: 'pecas_diversas', nome: 'Peças diversas', palavras_chave: '', posicao: 1 },
  { slug: 'filtros', nome: 'Filtros', palavras_chave: 'filtro,filtros', posicao: 2 },
  { slug: 'lubrificantes', nome: 'Lubrificantes', palavras_chave: 'lubrificante,lubrificantes,oleo,graxa', posicao: 3 },
];

/** Os 3 cards fixos, resolvidos por slug (robusto à ordem/posição da tabela). */
export interface FixedCats {
  pecas_diversas: CategoriaConfig;
  filtros: CategoriaConfig;
  lubrificantes: CategoriaConfig;
}
export async function getFixedCats(): Promise<FixedCats> {
  const cfg = await getCategoriasConfig();
  const bySlug = (slug: string, fallback: CategoriaConfig): CategoriaConfig =>
    cfg.find((c) => c.slug === slug) || fallback;
  return {
    pecas_diversas: bySlug('pecas_diversas', CATEGORIAS_PADRAO[0]),
    filtros: bySlug('filtros', CATEGORIAS_PADRAO[1]),
    lubrificantes: bySlug('lubrificantes', CATEGORIAS_PADRAO[2]),
  };
}

// Renomeação/agrupamento de categorias contábeis no dashboard.
// Chave = nome amigável exibido; valor = códigos contábeis Omie do grupo.
export const CATEGORIAS_AGRUPADAS: Record<string, string[]> = {
  'Revenda de Peças Oficina': ['1.01.01', '1.01.02', '1.01.92', '1.01.94', '1.01.95', '1.01.96', '1.01.99'],
  'Revenda de Pecas Balcao': ['1.01.03'],
};

// Config carregada do Supabase (categorias_dashboard), cacheada no processo.
// Global (categorias_dashboard não é por conta). TTL para refletir edições do admin.
let categoriasConfig: CategoriaConfig[] = [...CATEGORIAS_PADRAO];
let categoriasLoadedAt = 0;
const CATEGORIAS_TTL_MS = 5 * 60 * 1000;

/** Força recarga da config (ex.: após editar no /admin). */
export async function carregarCategorias(): Promise<void> {
  const { data } = await supabase.from('categorias_dashboard').select('*').order('posicao');
  if (data && data.length > 0) categoriasConfig = data as CategoriaConfig[];
  categoriasLoadedAt = Date.now();
}

/** Retorna a config de categorias (carrega do Supabase 1x, com TTL). */
export async function getCategoriasConfig(): Promise<CategoriaConfig[]> {
  if (Date.now() - categoriasLoadedAt >= CATEGORIAS_TTL_MS) {
    try {
      await carregarCategorias();
    } catch {
      // mantém o último valor conhecido / padrão
    }
  }
  return categoriasConfig;
}

const norm = (s: string): string =>
  s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Verifica se um `tipo` casa com as palavras-chave de uma categoria. */
export function tipoMatchCategoria(tipo: string | null | undefined, catConfig: CategoriaConfig): boolean {
  if (!tipo || !catConfig) return false;
  const t = norm(tipo);
  const palavras = catConfig.palavras_chave.split(',').map(norm);
  return palavras.some((p) => {
    if (!p) return false;
    if (t === p) return true;
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(?:^|[\\s_/\\-])' + escaped + '(?:$|[\\s_/\\-])');
    return regex.test(t);
  });
}

/** Resolve a descrição final de uma categoria considerando o agrupamento. */
export function descricaoCategoriaAgrupada(codigo: string, mapaCategorias: Record<string, string>): string {
  for (const [nomeGrupo, codigos] of Object.entries(CATEGORIAS_AGRUPADAS)) {
    if (codigos.includes(codigo)) return nomeGrupo;
  }
  return mapaCategorias[codigo] || codigo;
}

/** Expande um filtro (código avulso ou nome de grupo) em array de códigos. */
export function expandirCategoriaFiltro(filtro: string | null | undefined): string[] | null {
  if (!filtro) return null;
  if (CATEGORIAS_AGRUPADAS[filtro]) return CATEGORIAS_AGRUPADAS[filtro];
  return [filtro];
}

export interface ItemVenda {
  tipo?: string | null;
  familia?: string | null;
  valor_total?: number | string | null;
  quantidade?: number | string | null;
  codigo_categoria?: string | null;
  cmc_unitario?: number | string | null;
}

const numv = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

/** Família de peça: vazia ou contém "peça"/"peças". */
export function ehPecaFamilia(familia: unknown): boolean {
  const f = norm(String(familia ?? ''));
  return f === '' || f.includes('peca');
}

// Categorias contábeis de PEÇA (Revenda de Peças Oficina/Balcão).
const CATEGORIAS_PECA = new Set(Object.values(CATEGORIAS_AGRUPADAS).flat());

/**
 * Um item é venda de PEÇA quando:
 *   - a família contém "peça" (sinal explícito) → sempre peça;
 *   - a família é própria e NÃO-peça (Trator/Implemento…) → não é peça;
 *   - a família está VAZIA (#N/D) → só é peça se a categoria contábil for de
 *     peça. Isto blinda o número: uma máquina sem família (ex.: veículo novo em
 *     1.01.97) NÃO conta como peça, mas uma peça sem família (1.01.02/03…) conta.
 */
export function ehPecaVenda(item: ItemVenda): boolean {
  const f = norm(String(item.familia ?? ''));
  if (f.includes('peca')) return true;
  if (f !== '') return false;
  return CATEGORIAS_PECA.has(String(item.codigo_categoria ?? ''));
}

/** Card ao qual um item de peça pertence, com chave estável. */
export interface CardPecaClass {
  key: string;
  nome: string;
}

/**
 * Classificador ÚNICO de um item nos cards de peça (fonte da verdade — usado
 * tanto na agregação quanto nos drill-downs, garantindo consistência).
 *   - só entra se for venda de peça (`ehPecaVenda`) — senão null (máquina/impl);
 *   - casa Filtros/Lubrificantes (palavras-chave) → card fixo (consome o tipo);
 *   - `pecas_diversas` por palavras-chave OU por `tipo` vazio → catch-all;
 *   - qualquer outro `tipo` de peça → card dinâmico `tipo:<norm(tipo)>`.
 */
export function classificarCardPeca(item: ItemVenda, fixed: FixedCats): CardPecaClass | null {
  if (!ehPecaVenda(item)) return null;
  const tipo = item.tipo;
  if (tipoMatchCategoria(tipo, fixed.filtros)) return { key: 'fix:filtros', nome: fixed.filtros.nome };
  if (tipoMatchCategoria(tipo, fixed.lubrificantes)) return { key: 'fix:lubrificantes', nome: fixed.lubrificantes.nome };
  if (tipoMatchCategoria(tipo, fixed.pecas_diversas)) return { key: 'fix:pecas_diversas', nome: fixed.pecas_diversas.nome };
  const tnorm = norm(String(tipo ?? ''));
  if (tnorm === '') return { key: 'fix:pecas_diversas', nome: fixed.pecas_diversas.nome };
  return { key: 'tipo:' + tnorm, nome: String(tipo).trim() };
}

export interface BucketPeca {
  nome: string;
  valor: number;
  custo: number;
}
export interface AgregarPecasResult {
  /** Todos os buckets por chave (fixos + `tipo:*`, incluindo os de valor <= 0). */
  porKey: Record<string, BucketPeca>;
  /** Cards para exibição: 3 fixos (sempre) + `tipo:*` com valor > 0, alfabéticos. */
  ordered: Array<{ key: string; nome: string; valor: number; custo: number }>;
  totalPecas: number;
  totalCusto: number;
}

/**
 * Agrega itens de peça em cards dinâmicos por `tipo`. Os 3 fixos (Peças
 * diversas, Filtros, Lubrificantes) aparecem sempre; cada `tipo` restante com
 * faturamento > 0 vira um card, em ordem alfabética. Se `filtroCategoria` for
 * informado, filtra os itens pelo código contábil antes.
 */
export function agregarCardsPecas(
  itens: ItemVenda[],
  filtroCategoria: string | null,
  fixed: FixedCats,
): AgregarPecasResult {
  const codigosFiltro = filtroCategoria ? expandirCategoriaFiltro(filtroCategoria) : null;
  const porKey: Record<string, BucketPeca> = {};

  itens.forEach((item) => {
    if (codigosFiltro && !codigosFiltro.includes(item.codigo_categoria || '')) return;
    const r = classificarCardPeca(item, fixed);
    if (!r) return;
    const vt = numv(item.valor_total);
    const cmcU = numv(item.cmc_unitario);
    const qtd = numv(item.quantidade);
    const ct = cmcU > 0 && qtd > 0 ? cmcU * qtd : 0;
    let b = porKey[r.key];
    if (!b) {
      b = porKey[r.key] = { nome: r.nome, valor: 0, custo: 0 };
    } else if (r.key.startsWith('tipo:') && r.nome.localeCompare(b.nome, 'pt-BR') < 0) {
      // rótulo determinístico: menor grafia entre as variantes do mesmo tipo
      b.nome = r.nome;
    }
    b.valor += vt;
    b.custo += ct;
  });

  // Os 3 fixos existem sempre (mesmo zerados) e mantêm o nome atual da config.
  const fixos: Array<[string, CategoriaConfig]> = [
    ['fix:pecas_diversas', fixed.pecas_diversas],
    ['fix:filtros', fixed.filtros],
    ['fix:lubrificantes', fixed.lubrificantes],
  ];
  for (const [k, cfg] of fixos) {
    if (!porKey[k]) porKey[k] = { nome: cfg.nome, valor: 0, custo: 0 };
    else porKey[k].nome = cfg.nome;
  }

  const fixedOrdered = fixos.map(([k]) => ({ key: k, ...porKey[k] }));
  const dinamicos = Object.entries(porKey)
    .filter(([k, b]) => k.startsWith('tipo:') && b.valor > 0)
    .map(([k, b]) => ({ key: k, nome: b.nome, valor: b.valor, custo: b.custo }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

  const ordered = [...fixedOrdered, ...dinamicos];
  const totalPecas = Object.values(porKey).reduce((s, b) => s + b.valor, 0);
  const totalCusto = Object.values(porKey).reduce((s, b) => s + b.custo, 0);
  return { porKey, ordered, totalPecas, totalCusto };
}

export interface MaquinaFamilia {
  familia: string;
  receita: number;
  unidades: number;
  cmv: number;
}

/**
 * Agrega as vendas de MÁQUINAS por família, a partir do mesmo array `itens` que
 * a agregação de peças recebe (sem query nova). "Máquina" é decidido pelo
 * classificador oficial `classificarGrupo` (a MESMA régua da tela Cruzamento de
 * Família → os números batem entre as telas). Peças e famílias "ignorar"
 * (vazio/#N/D/kit revisão/ativo imobilizado) ficam de fora.
 * Retorna ordenado por receita desc.
 */
export function agregarMaquinas(itens: ItemVenda[]): MaquinaFamilia[] {
  const porFamilia: Record<string, MaquinaFamilia> = {};
  itens.forEach((item) => {
    const familia = (item.familia || '').trim();
    if (classificarGrupo(familia) !== 'maquina') return;
    const vt = numv(item.valor_total);
    const qtd = numv(item.quantidade);
    const cmcU = numv(item.cmc_unitario);
    const cmv = cmcU > 0 && qtd > 0 ? cmcU * qtd : 0;
    if (!porFamilia[familia]) porFamilia[familia] = { familia, receita: 0, unidades: 0, cmv: 0 };
    porFamilia[familia].receita += vt;
    porFamilia[familia].unidades += qtd;
    porFamilia[familia].cmv += cmv;
  });
  return Object.values(porFamilia).sort((a, b) => b.receita - a.receita);
}
